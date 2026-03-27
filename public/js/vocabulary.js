/**
 * SSY Vocabulary Management
 * Alpine.js component: search/filter words, admin add/delete, stats display
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('vocabularyTab', () => ({
    words: [],
    stats: { total: 0, byGrade: {} },
    searchQuery: '',
    filterGrade: '',
    grades: ['7a', '7b', '8a', '8b', '9'],
    loading: false,
    showAddForm: false,
    showOcr: false,
    showDoc: false,
    importMode: '',  // 'ocr' | 'doc' | 'manual' | ''
    newWord: { word: '', phonetic: '', meaning: '', grade: '', unit: '', pos: '' },
    searchTimeout: null,
    batchMode: false,
    selectedIds: [],

    async init() {
      await Promise.all([this.load(), this.loadStats()]);
    },

    async load() {
      this.loading = true;
      try {
        const data = await API.getVocabulary(this.filterGrade, this.searchQuery);
        this.words = data.words || [];
      } catch (e) {
        this.words = [];
      }
      this.loading = false;
    },

    async loadStats() {
      try {
        this.stats = await API.getVocabStats();
      } catch (e) {
        this.stats = { total: 0, byGrade: {} };
      }
    },

    onSearchInput() {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.load(), 300);
    },

    async search() {
      await this.load();
    },

    setGrade(grade) {
      this.filterGrade = this.filterGrade === grade ? '' : grade;
      this.load();
    },

    isActiveGrade(grade) {
      return this.filterGrade === grade;
    },

    clearFilters() {
      this.searchQuery = '';
      this.filterGrade = '';
      this.load();
    },

    toggleAddForm() {
      this.showAddForm = !this.showAddForm;
      if (!this.showAddForm) this.resetNewWord();
    },

    resetNewWord() {
      this.newWord = { word: '', phonetic: '', meaning: '', grade: '', unit: '', pos: '' };
    },

    async addWord() {
      if (!this.newWord.word.trim() || !this.newWord.meaning.trim()) {
        this.$dispatch('toast', { message: '请输入单词和释义', type: 'warning' });
        return;
      }
      try {
        await API.addWord({
          word: this.newWord.word.trim(),
          phonetic: this.newWord.phonetic.trim() || null,
          meaning: this.newWord.meaning.trim(),
          grade: this.newWord.grade || null,
          unit: this.newWord.unit.trim() || null,
          pos: this.newWord.pos.trim() || null,
        });
        this.resetNewWord();
        this.showAddForm = false;
        await Promise.all([this.load(), this.loadStats()]);
        this.$dispatch('toast', { message: '单词已添加', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '添加失败', type: 'error' });
      }
    },

    async deleteWord(id) {
      if (!confirm('确定删除该单词？')) return;
      try {
        await API.deleteWord(id);
        this.words = this.words.filter(w => w.id !== id);
        await this.loadStats();
        this.$dispatch('toast', { message: '已删除', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '删除失败', type: 'error' });
      }
    },

    getPosLabel(pos) {
      const map = { n: '名词', v: '动词', adj: '形容词', adv: '副词', prep: '介词', conj: '连词', pron: '代词', int: '感叹词' };
      return map[pos] || pos || '';
    },

    getGradeLabel(grade) {
      const map = { '7a': '七上', '7b': '七下', '8a': '八上', '8b': '八下', '9': '九年级' };
      return map[grade] || grade || '未分类';
    },

    getGradeColor(grade) {
      const map = { '7a': '#60a5fa', '7b': '#34d399', '8a': '#fb923c', '8b': '#f472b6', '9': '#a78bfa' };
      return map[grade] || '#94a3b8';
    },

    toggleBatchMode() {
      this.batchMode = !this.batchMode;
      this.selectedIds = [];
    },

    toggleWordSelect(id) {
      const idx = this.selectedIds.indexOf(id);
      if (idx >= 0) this.selectedIds.splice(idx, 1);
      else this.selectedIds.push(id);
    },

    isWordSelected(id) {
      return this.selectedIds.includes(id);
    },

    selectAllWords() {
      if (this.selectedIds.length === this.words.length) {
        this.selectedIds = [];
      } else {
        this.selectedIds = this.words.map(w => w.id);
      }
    },

    async batchDelete() {
      if (!this.selectedIds.length) return;
      if (!confirm(`确定删除选中的 ${this.selectedIds.length} 个单词？`)) return;
      try {
        const res = await API._fetch('/api/vocabulary/batch', {
          method: 'DELETE',
          body: JSON.stringify({ ids: this.selectedIds }),
        });
        this.selectedIds = [];
        this.batchMode = false;
        await Promise.all([this.load(), this.loadStats()]);
        this.$dispatch('toast', { message: `已删除 ${res.deleted} 个单词`, type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '删除失败', type: 'error' });
      }
    },

    get filteredCount() {
      return this.words.length;
    },

    get hasFilters() {
      return this.searchQuery || this.filterGrade;
    },
  }));
});
