document.addEventListener('alpine:init', () => {
  Alpine.data('docUpload', () => ({
    docFile: null,
    fileName: '',
    parsedWords: [],
    parseFormat: '',
    parseErrors: [],
    loading: false,
    showResults: false,
    selectAll: true,
    selected: [],

    onFileSelect(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['md', 'txt'].includes(ext)) {
        this.$dispatch('toast', { message: '仅支持 .md 和 .txt 文件', type: 'error' });
        return;
      }
      this.docFile = file;
      this.fileName = file.name;
    },

    async parse() {
      if (!this.docFile) return;
      this.loading = true;
      try {
        const fd = new FormData();
        fd.append('document', this.docFile);
        const res = await fetch('/api/upload/document', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${API.token}` },
          body: fd
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        this.parsedWords = data.words || [];
        this.parseFormat = data.format || '';
        this.parseErrors = data.errors || [];
        this.selected = this.parsedWords.map((_, i) => i);
        this.showResults = true;
      } catch (e) {
        this.$dispatch('toast', { message: '解析失败: ' + e.message, type: 'error' });
      }
      this.loading = false;
    },

    toggleAll() {
      this.selectAll = !this.selectAll;
      this.selected = this.selectAll ? this.parsedWords.map((_, i) => i) : [];
    },

    toggleWord(index) {
      const idx = this.selected.indexOf(index);
      if (idx >= 0) this.selected.splice(idx, 1);
      else this.selected.push(index);
    },

    async saveSelected() {
      const words = this.selected.map(i => this.parsedWords[i]);
      if (!words.length) return;
      try {
        const result = await API.addWordsBatch(words);
        this.$dispatch('toast', { message: `已添加 ${result.inserted} 个单词（跳过 ${result.skipped} 个重复）`, type: 'success' });
        this.reset();
        this.$dispatch('vocab-refresh');
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    reset() {
      this.docFile = null;
      this.fileName = '';
      this.parsedWords = [];
      this.parseFormat = '';
      this.parseErrors = [];
      this.showResults = false;
    }
  }));
});
