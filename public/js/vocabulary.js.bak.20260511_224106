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
    filterUnit: '',
    grades: ['7a', '7b', '8a', '8b', '9'],
    loading: false,
    showAddForm: false,
    showOcr: false,
    showDoc: false,
    importMode: '',  // 'ocr' | 'doc' | 'manual' | ''
    newWord: { word: '', phonetic: '', meaning: '', grade: '', unit: '', pos: '' },
    searchTimeout: null,
    loaded: false,

    async init() {
      const ensureLoaded = async () => {
        if (this.loaded) return;
        this.loaded = true;
        await Promise.all([this.load(), this.loadStats()]);
      };
      window.addEventListener('ssy:tab-change', async (event) => {
        if (event.detail?.tabId === 'vocabulary') {
          await ensureLoaded();
        }
      });
      if (document.body.dataset.activeTab === 'vocabulary') {
        await ensureLoaded();
      }
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
      this.filterUnit = '';
      this.load();
    },

    isActiveGrade(grade) {
      return this.filterGrade === grade;
    },

    clearFilters() {
      this.searchQuery = '';
      this.filterGrade = '';
      this.filterUnit = '';
      this.load();
    },

    setUnit(unit) {
      this.filterUnit = this.filterUnit === unit ? '' : unit;
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

    getUnitLabel(unit) {
      if (!unit) return '';
      return unit.toUpperCase();
    },

    compareUnits(a, b) {
      const parse = (value) => {
        const match = String(value || '').match(/^([A-Z]+)(\d+)$/i);
        if (!match) return { prefix: String(value || ''), num: 0 };
        return { prefix: match[1].toUpperCase(), num: Number(match[2]) };
      };
      const left = parse(a);
      const right = parse(b);
      if (left.prefix !== right.prefix) return left.prefix.localeCompare(right.prefix);
      return left.num - right.num;
    },

    get availableUnits() {
      const source = this.filterGrade
        ? this.words.filter((w) => w.grade === this.filterGrade)
        : this.words;
      return [...new Set(source.map((w) => w.unit).filter(Boolean))].sort((a, b) => this.compareUnits(a, b));
    },

    get visibleWords() {
      let source = this.words;
      if (this.filterGrade) {
        source = source.filter((w) => w.grade === this.filterGrade);
      }
      if (this.filterUnit) {
        source = source.filter((w) => w.unit === this.filterUnit);
      }
      return source;
    },

    get groupedWordSections() {
      const gradeOrder = this.grades;
      const grouped = new Map();

      for (const word of this.visibleWords) {
        const grade = word.grade || 'unknown';
        const unit = word.unit || 'unknown';
        if (!grouped.has(grade)) {
          grouped.set(grade, new Map());
        }
        const units = grouped.get(grade);
        if (!units.has(unit)) {
          units.set(unit, []);
        }
        units.get(unit).push(word);
      }

      return [...grouped.entries()]
        .sort((a, b) => {
          const left = gradeOrder.indexOf(a[0]);
          const right = gradeOrder.indexOf(b[0]);
          return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
        })
        .map(([grade, units]) => ({
          grade,
          gradeLabel: this.getGradeLabel(grade),
          units: [...units.entries()]
            .sort((a, b) => this.compareUnits(a[0], b[0]))
            .map(([unit, words]) => ({
              unit,
              unitLabel: this.getUnitLabel(unit),
              words,
            })),
        }));
    },

    get filteredCount() {
      return this.visibleWords.length;
    },

    get hasFilters() {
      return this.searchQuery || this.filterGrade;
    },
  }));
});
