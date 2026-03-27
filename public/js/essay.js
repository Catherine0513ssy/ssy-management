document.addEventListener('alpine:init', () => {
  Alpine.data('essayTab', () => ({
    // View
    view: 'list',  // list | detail | submission

    // Task list
    tasks: [],
    loading: false,

    // Create form
    showCreateForm: false,
    taskForm: { title: '', requirements: '', essay_type: 'free', max_score: 10 },

    // Current task detail
    currentTask: null,
    submissions: [],

    // Upload
    showUpload: false,
    uploadEntries: [],  // [{file, name, preview}]
    uploading: false,

    // Batch processing
    batchProcessing: false,
    batchMsg: '',

    // Current submission detail
    currentSub: null,
    editingOcr: false,
    editOcrText: '',
    editingScores: false,
    loaded: false,

    async init() {
      const ensureLoaded = async () => {
        if (this.loaded) return;
        this.loaded = true;
        await this.loadTasks();
      };
      window.addEventListener('ssy:tab-change', async (event) => {
        if (event.detail?.tabId === 'essay') {
          await ensureLoaded();
        }
      });
      if (document.body.dataset.activeTab === 'essay') {
        await ensureLoaded();
      }
    },

    // ===== Task List =====
    async loadTasks() {
      this.loading = true;
      try {
        const data = await API.getEssayTasks();
        this.tasks = data.tasks || [];
      } catch (e) { console.error(e); }
      this.loading = false;
    },

    async createTask() {
      if (!this.taskForm.title.trim()) {
        this.$dispatch('toast', { message: '请输入作文题目', type: 'error' });
        return;
      }
      try {
        await API.createEssayTask(this.taskForm);
        this.taskForm = { title: '', requirements: '', essay_type: 'free', max_score: 10 };
        this.showCreateForm = false;
        await this.loadTasks();
        this.$dispatch('toast', { message: '任务已创建', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    async deleteTask(id) {
      if (!confirm('删除任务将同时删除所有学生作文，确定？')) return;
      try {
        await API.deleteEssayTask(id);
        await this.loadTasks();
        this.$dispatch('toast', { message: '已删除', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    async openTask(task) {
      this.currentTask = task;
      this.view = 'detail';
      await this.loadSubmissions();
    },

    backToList() {
      this.currentTask = null;
      this.submissions = [];
      this.view = 'list';
      this.showUpload = false;
      this.loadTasks();
    },

    // ===== Task Detail =====
    async loadSubmissions() {
      if (!this.currentTask) return;
      try {
        const data = await API.getSubmissions(this.currentTask.id);
        this.submissions = data.submissions || [];
      } catch (e) { console.error(e); }
    },

    // Upload flow
    onFilesSelected(e) {
      const files = e.target.files;
      if (!files) return;
      this.uploadEntries = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const entry = { file: f, name: '', preview: '' };
        const reader = new FileReader();
        reader.onload = (ev) => { entry.preview = ev.target.result; };
        reader.readAsDataURL(f);
        this.uploadEntries.push(entry);
      }
      this.showUpload = true;
    },

    removeUploadEntry(i) {
      this.uploadEntries.splice(i, 1);
      if (!this.uploadEntries.length) this.showUpload = false;
    },

    async submitUpload() {
      if (!this.uploadEntries.length) return;
      this.uploading = true;
      try {
        const fd = new FormData();
        const names = [];
        for (const entry of this.uploadEntries) {
          fd.append('images', entry.file);
          names.push(entry.name.trim() || '');
        }
        fd.append('names', JSON.stringify(names));
        await API.uploadEssayImages(this.currentTask.id, fd);
        this.uploadEntries = [];
        this.showUpload = false;
        await this.loadSubmissions();
        this.$dispatch('toast', { message: '上传成功', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
      this.uploading = false;
    },

    // Individual actions
    async runOcr(sub) {
      sub._ocrLoading = true;
      try {
        const data = await API.ocrSubmission(sub.id);
        Object.assign(sub, data.submission);
        this.$dispatch('toast', { message: 'OCR 完成', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
      sub._ocrLoading = false;
    },

    async confirmOcr(sub) {
      try {
        await API.updateSubmission(sub.id, { ocr_confirmed: 1 });
        sub.ocr_confirmed = 1;
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    async runGrade(sub) {
      sub._gradeLoading = true;
      try {
        const data = await API.gradeSubmission(sub.id);
        Object.assign(sub, data.submission);
        this.$dispatch('toast', { message: '评分完成', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
      sub._gradeLoading = false;
    },

    async deleteSub(sub) {
      if (!confirm(`删除 ${sub.student_name} 的作文？`)) return;
      try {
        await API.deleteSubmission(sub.id);
        await this.loadSubmissions();
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    // Batch
    async batchOcr() {
      this.batchProcessing = true;
      this.batchMsg = '正在批量识别...';
      try {
        const data = await API.ocrAllSubmissions(this.currentTask.id);
        this.batchMsg = '';
        await this.loadSubmissions();
        this.$dispatch('toast', { message: `识别完成：成功 ${data.processed}，失败 ${data.failed}`, type: data.failed ? 'info' : 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
      this.batchProcessing = false;
      this.batchMsg = '';
    },

    async batchGrade() {
      this.batchProcessing = true;
      this.batchMsg = '正在批量评分...';
      try {
        const data = await API.gradeAllSubmissions(this.currentTask.id);
        this.batchMsg = '';
        await this.loadSubmissions();
        this.$dispatch('toast', { message: `评分完成：成功 ${data.processed}，失败 ${data.failed}`, type: data.failed ? 'info' : 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
      this.batchProcessing = false;
      this.batchMsg = '';
    },

    // ===== Submission Detail =====
    openSubmission(sub) {
      this.currentSub = sub;
      this.view = 'submission';
    },

    backToTask() {
      this.currentSub = null;
      this.view = 'detail';
      this.editingOcr = false;
      this.editingScores = false;
      this.loadSubmissions();
    },

    startEditOcr() {
      this.editOcrText = this.currentSub.ocr_text || '';
      this.editingOcr = true;
    },

    async saveOcrEdit() {
      try {
        const data = await API.updateSubmission(this.currentSub.id, {
          ocr_text: this.editOcrText,
          ocr_confirmed: 1,
          status: 'ocr_done',
        });
        Object.assign(this.currentSub, data.submission);
        this.editingOcr = false;
        this.$dispatch('toast', { message: '已保存', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    async saveScoreEdit() {
      try {
        const scoreDetail = JSON.parse(this.currentSub.score_detail || '{}');
        let total = 0;
        for (const k of Object.keys(scoreDetail)) {
          total += parseFloat(scoreDetail[k].score) || 0;
        }
        await API.updateSubmission(this.currentSub.id, {
          score_detail: scoreDetail,
          total_score: parseFloat(total.toFixed(1)),
          status: 'reviewed',
        });
        this.currentSub.total_score = parseFloat(total.toFixed(1));
        this.currentSub.status = 'reviewed';
        this.editingScores = false;
        this.$dispatch('toast', { message: '评分已更新', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    // ===== Helpers =====
    getStatusLabel(s) {
      return { uploaded: '待识别', ocr_done: '已识别', graded: '已评分', reviewed: '已审核' }[s] || s;
    },
    getStatusColor(s) {
      return { uploaded: '#94a3b8', ocr_done: '#60a5fa', graded: '#34d399', reviewed: '#a78bfa' }[s] || '#94a3b8';
    },
    getTypeLabel(t) {
      return { free: '命题作文', picture: '看图作文', dialogue: '补全对话', letter: '书信', other: '其他' }[t] || t;
    },

    parseJSON(str) {
      if (!str) return null;
      try { return typeof str === 'string' ? JSON.parse(str) : str; } catch (_) { return null; }
    },

    renderAnnotatedText(text, annotationsJson) {
      if (!text) return '';
      const annotations = this.parseJSON(annotationsJson);
      if (!annotations || !annotations.length) return this._escapeHtml(text);

      let html = this._escapeHtml(text);
      // Sort by length descending to avoid partial matches
      const sorted = [...annotations].sort((a, b) => (b.original || '').length - (a.original || '').length);
      for (const ann of sorted) {
        if (!ann.original) continue;
        const escaped = this._escapeHtml(ann.original);
        const color = { major: '#ef4444', minor: '#f59e0b', suggestion: '#60a5fa' }[ann.severity] || '#94a3b8';
        const tooltip = `${ann.reason || ''} → ${ann.corrected || ''}`.replace(/"/g, '&quot;');
        const replacement = `<span style="border-bottom:2px wavy ${color};background:${color}11;cursor:help;position:relative;" title="${tooltip}">${escaped}</span>`;
        html = html.replace(escaped, replacement);
      }
      return html.replace(/\n/g, '<br>');
    },

    _escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
  }));
});
