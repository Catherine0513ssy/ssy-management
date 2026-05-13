document.addEventListener('alpine:init', () => { console.log('[ESSAY] alpine:init fired');
  Alpine.data('essayTab', () => ({
    // View
    view: 'list',  // list | detail | submission

    // Task list
    tasks: [],
    loading: false,

    // Create form
    showCreateForm: false,
    taskForm: { title: '', requirements: '', essay_type: 'free', max_score: 15 },

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

    // AI Chat Drawer
    chatDrawerOpen: false,
    chatPanelOpen: false,
    chatMessages: [],
    chatInput: '',
    chatLoading: false,

    // AI Rewrite
    aiRewrite: null,
    rewriteLoading: false,

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
      }, 50);
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
        this.$dispatch('toast', { message: '请输入作文题目', type: 'error' }, 50);
        return;
      }
      try {
        await API.createEssayTask(this.taskForm);
        this.taskForm = { title: '', requirements: '', essay_type: 'free', max_score: 15 };
        this.showCreateForm = false;
        await this.loadTasks();
        this.$dispatch('toast', { message: '任务已创建', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
    },

    async deleteTask(id) {
      if (!confirm('删除任务将同时删除所有学生作文，确定？')) return;
      try {
        await API.deleteEssayTask(id);
        await this.loadTasks();
        this.$dispatch('toast', { message: '已删除', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
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
        this.$dispatch('toast', { message: '上传成功', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
      this.uploading = false;
    },

    // Individual actions
    async runOcr(sub) {
      sub._ocrLoading = true;
      try {
        const data = await API.ocrSubmission(sub.id);
        Object.assign(sub, data.submission);
        this.$dispatch('toast', { message: 'OCR 完成', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
      sub._ocrLoading = false;
    },

    async confirmOcr(sub) {
      try {
        await API.updateSubmission(sub.id, { ocr_confirmed: 1 }, 50);
        sub.ocr_confirmed = 1;
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
    },

    async runGrade(sub) {
      sub._gradeLoading = true;
      try {
        const data = await API.gradeSubmission(sub.id);
        Object.assign(sub, data.submission);
        this.$dispatch('toast', { message: '评分完成', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
      sub._gradeLoading = false;
    },

    async deleteSub(sub) {
      if (!confirm(`删除 ${sub.student_name} 的作文？`)) return;
      try {
        await API.deleteSubmission(sub.id);
        await this.loadSubmissions();
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
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
        this.$dispatch('toast', { message: `识别完成：成功 ${data.processed}，失败 ${data.failed}`, type: data.failed ? 'info' : 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
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
        this.$dispatch('toast', { message: `评分完成：成功 ${data.processed}，失败 ${data.failed}`, type: data.failed ? 'info' : 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
      this.batchProcessing = false;
      this.batchMsg = '';
    },

    // ===== Submission Detail =====
    openSubmission(sub) {
      this.currentSub = sub;
      this.view = 'submission';
      this.chatMessages = [];
      this.chatInput = '';
      this.aiRewrite = null;
      this.loadChatHistory();
      this.loadRewriteHistory();
    },

    backToTask() {
      this.currentSub = null;
      this.view = 'detail';
      this.editingOcr = false;
      this.editingScores = false;
      this.chatMessages = [];
      this.aiRewrite = null;
      this.loadSubmissions();
    },

    // ===== AI Chat =====
    async loadChatHistory() {
      if (!this.currentSub) return;
      try {
        const data = await API.getInteractions(this.currentSub.id, 'chat');
        this.chatMessages = data.interactions || [];
      } catch (e) { console.error(e); }
    },

    async sendChat() {
      if (!this.chatInput.trim() || !this.currentSub) return;
      const msg = this.chatInput.trim();
      this.chatInput = '';
      this.chatLoading = true;
      try {
        const data = await API.chatSubmission(this.currentSub.id, msg);
        this.chatMessages.push({ role: 'user', content: msg });
        this.chatMessages.push({ role: 'assistant', content: data.reply });
        setTimeout(() => {
          const container = document.querySelector('.chat-drawer-messages');
          if (container) container.scrollTop = container.scrollHeight;
        }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
      this.chatLoading = false;
    },

    // ===== AI Rewrite =====
    async loadRewriteHistory() {
      if (!this.currentSub) return;
      try {
        const data = await API.getInteractions(this.currentSub.id, 'rewrite');
        const rewrite = data.interactions?.[0];
        if (rewrite) {
          this.aiRewrite = {
            text: rewrite.content,
            changes: this.parseJSON(rewrite.extra_json) || [],
          };
        }
      } catch (e) { console.error(e); }
    },

    async requestRewrite() {
      if (!this.currentSub) return;
      this.rewriteLoading = true;
      try {
        const data = await API.rewriteSubmission(this.currentSub.id);
        this.aiRewrite = { text: data.rewrite, changes: data.changes || [] };
        this.$dispatch('toast', { message: 'AI 改写完成', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
      this.rewriteLoading = false;
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
        }, 50);
        Object.assign(this.currentSub, data.submission);
        this.editingOcr = false;
        this.$dispatch('toast', { message: '已保存', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
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
        }, 50);
        this.currentSub.total_score = parseFloat(total.toFixed(1));
        this.currentSub.status = 'reviewed';
        this.editingScores = false;
        this.$dispatch('toast', { message: '评分已更新', type: 'success' }, 50);
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' }, 50);
      }
    },

    // ===== Helpers =====
    formatOcrText(text) {
      if (!text) return '';
      if (text.includes('\\n')) return text;
      // Auto-split by sentence endings if no newlines present
      return text.replace(/([.!?])(\s+)(?=[A-Z])/g, '$1\\n\\n');
    },
    toggleChatDrawer() {
      this.chatDrawerOpen = !this.chatDrawerOpen;
      if (this.chatDrawerOpen) {
        setTimeout(() => {
          const container = document.querySelector('.chat-drawer-messages');
          if (container) container.scrollTop = container.scrollHeight;
        }, 50);
      }
    },
    toggleChatPanel() {
      this.chatPanelOpen = !this.chatPanelOpen;
      if (this.chatPanelOpen) {
        setTimeout(() => {
          const container = document.querySelector('.chat-panel-messages');
          if (container) container.scrollTop = container.scrollHeight;
        }, 50);
      }
    },
    scrollChatToBottom(selector) {
      setTimeout(() => {
        const container = document.querySelector(selector);
        if (container) container.scrollTop = container.scrollHeight;
      }, 50);
    },
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
}, 50);
