/**
 * SSY Quiz (Dictation) Display
 * Alpine.js component: word quiz for classroom dictation
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('quizTab', () => ({
    // Setup
    vocab: [],
    vocabTree: {},
    unitsByGrade: {},
    grade: 'all',
    selectedUnits: [],
    mode: 'cn2en',
    count: 20,
    interval: 5,         // 自动跳转间隔（秒）
    autoPlay: true,       // 自动朗读
    repeatCount: 1,       // 每个单词朗读次数
    autoNext: false,      // 自动跳转
    grades: ['all', '7a', '7b', '8a', '8b', '9'],

    // Quiz state
    words: [],
    index: 0,
    answerShown: false,
    quizStarted: false,
    fullscreen: false,
    showSidebar: true,
    showAllAnswers: false, // 默写完成后显示所有答案
    quizFinished: false,   // 是否已默写完最后一个
    _autoTimer: null,
    countdown: 0,         // 倒计时显示

    async init() {
      await this.loadVocab();
    },

    async loadVocab() {
      try {
        const data = await API.getAllVocabulary();
        if (data.words) {
          this.vocabTree = data.words;
          this.unitsByGrade = data.unitsByGrade || {};
          if (Array.isArray(data.flatWords)) {
            this.vocab = data.flatWords;
          } else {
            const grades = Object.values(data.words || {});
            this.vocab = grades.flatMap((units) => Array.isArray(units) ? units : Object.values(units || {}).flat());
          }
        }
      } catch (e) {
        try {
          const data = await API.getVocabulary();
          this.vocab = data.words || [];
        } catch (_) {}
      }
    },

    generate() {
      const filtered = this.filteredVocab;
      if (filtered.length === 0) {
        this.$dispatch('toast', { message: '当前年级/单元下暂无单词', type: 'error' });
        return;
      }
      const n = Math.min(parseInt(this.count) || 20, filtered.length);
      const shuffled = [...filtered].sort(() => Math.random() - 0.5);
      this.words = shuffled.slice(0, n);
      this.index = 0;
      this.answerShown = false;
      this.quizStarted = true;
      this.$nextTick(() => this._onWordChange());
    },

    get filteredVocab() {
      let filtered = this.vocab;
      if (this.grade !== 'all') {
        filtered = filtered.filter((w) => w.grade === this.grade);
      }
      if (this.selectedUnits.length > 0) {
        filtered = filtered.filter((w) => this.selectedUnits.includes(w.unit || 'unknown'));
      }
      return filtered;
    },

    get availableUnits() {
      if (this.grade === 'all') return [];
      const units = this.unitsByGrade[this.grade] || [];
      return [...units].sort((a, b) => this.compareUnits(a, b));
    },

    setGrade(grade) {
      this.grade = grade;
      this.selectedUnits = [];
    },

    toggleUnit(unit) {
      const index = this.selectedUnits.indexOf(unit);
      if (index >= 0) {
        this.selectedUnits.splice(index, 1);
      } else {
        this.selectedUnits.push(unit);
      }
    },

    isUnitSelected(unit) {
      return this.selectedUnits.includes(unit);
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

    get currentWord() {
      if (!this.words.length) return null;
      const w = this.words[this.index];
      const meaning = w.meaning || '';
      // 解析词性: "n. 鞋" → pos="n.", cleanMeaning="鞋"
      // 也处理 "v. & n. 游泳" 这种复合词性
      const posMatch = meaning.match(/^([a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*)/);
      const pos = posMatch ? posMatch[1].trim() : '';
      const cleanMeaning = posMatch ? meaning.slice(posMatch[0].length).trim() : meaning;
      return {
        en: w.en || w.word || '',
        phonetic: w.phonetic || '',
        meaning: meaning,
        pos: pos,
        cleanMeaning: cleanMeaning,
      };
    },

    get prompt() {
      if (!this.currentWord) return '';
      if (this.mode === 'cn2en') return this.currentWord.cleanMeaning;
      if (this.mode === 'en2cn') return this.currentWord.en;
      return '🔊';
    },

    get promptHint() {
      if (!this.currentWord) return '';
      const pos = this.currentWord.pos;
      const posLabel = pos ? `【${this._posFullName(pos)}】` : '';
      if (this.mode === 'cn2en') return `请写出英文单词 ${posLabel}`;
      if (this.mode === 'en2cn') return `请写出中文释义 ${posLabel}`;
      return `听写模式 ${posLabel}`;
    },

    // 词性全称
    _posFullName(pos) {
      const map = {
        'n.': '名词', 'v.': '动词', 'adj.': '形容词', 'adv.': '副词',
        'prep.': '介词', 'conj.': '连词', 'pron.': '代词', 'int.': '感叹词',
        'num.': '数词', 'art.': '冠词',
      };
      // 处理复合词性 "v. & n."
      return pos.split('&').map(p => map[p.trim()] || p.trim()).join(' & ');
    },

    get progress() {
      return `${this.index + 1} / ${this.words.length}`;
    },

    getWordPrompt(w) {
      const meaning = (w.meaning || '').replace(/^[a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*/, '');
      if (this.mode === 'cn2en') return meaning;
      if (this.mode === 'en2cn') return w.en || w.word || '';
      return '🔊 ' + (w.en || w.word || '');
    },

    // === 朗读 ===
    speakText(text, lang, times) {
      speechSynthesis.cancel();
      const n = times || 1;
      let i = 0;
      const speakOnce = () => {
        if (i >= n) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.8;
        u.onend = () => { i++; if (i < n) setTimeout(speakOnce, 500); };
        speechSynthesis.speak(u);
      };
      speakOnce();
    },

    speak() {
      if (!this.currentWord) return;
      const times = parseInt(this.repeatCount) || 1;
      if (this.mode === 'cn2en') {
        this.speakText(this.currentWord.cleanMeaning, 'zh-CN', times);
      } else {
        this.speakText(this.currentWord.en, 'en-US', times);
      }
    },

    // === 自动朗读 + 自动跳转 ===
    _onWordChange() {
      this._clearAutoTimer();
      // 自动朗读当前提示
      if (this.autoPlay) {
        setTimeout(() => this.speak(), 300);
      }
      // 自动跳转倒计时
      if (this.autoNext) {
        this.countdown = this.interval;
        this._autoTimer = setInterval(() => {
          this.countdown--;
          if (this.countdown <= 0) {
            this._clearAutoTimer();
            if (this.index < this.words.length - 1) {
              this.index++;
              this.answerShown = false;
              this.$nextTick(() => this._onWordChange());
            } else {
              this.countdown = 0;
              this.quizFinished = true;
            }
          }
        }, 1000);
      }
    },

    _clearAutoTimer() {
      if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
      this.countdown = 0;
    },

    toggleSidebar() { this.showSidebar = !this.showSidebar; },
    toggleAnswer() { this.answerShown = !this.answerShown; },

    prev() {
      if (this.index > 0) { this.index--; this.answerShown = false; this.quizFinished = false; this.showAllAnswers = false; this._onWordChange(); }
    },
    next() {
      if (this.index < this.words.length - 1) {
        this.index++; this.answerShown = false; this._onWordChange();
      }
      // 到最后一个了，标记完成
      if (this.index === this.words.length - 1 && !this.quizFinished) {
        this.quizFinished = true;
      }
    },
    reset() {
      this._clearAutoTimer();
      speechSynthesis.cancel();
      this.quizStarted = false; this.quizFinished = false; this.showAllAnswers = false;
      this.words = []; this.index = 0; this.answerShown = false;
    },

    // 获取单词的答案文本
    getWordAnswer(w) {
      const en = w.en || w.word || '';
      const meaning = (w.meaning || '').replace(/^[a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*/, '');
      if (this.mode === 'cn2en') return en;
      if (this.mode === 'en2cn') return meaning;
      return en;
    },

    toggleAutoNext() {
      this.autoNext = !this.autoNext;
      if (this.autoNext) { this._onWordChange(); } else { this._clearAutoTimer(); }
    },

    toggleFullscreen() {
      this.fullscreen = !this.fullscreen;
      if (this.fullscreen) {
        document.documentElement.requestFullscreen?.() || document.documentElement.webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.() || document.webkitExitFullscreen?.();
      }
    },

    handleKey(e) {
      if (!this.quizStarted) return;
      if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); }
      else if (e.key === 'Enter') this.toggleAnswer();
      else if (e.key === 'a' || e.key === 'A') this.speak();
      else if (e.key === 'Escape') this.fullscreen ? this.toggleFullscreen() : this.reset();
    },

    getGradeLabel(g) {
      const m = { 'all': '全部', '7a': '七上', '7b': '七下', '8a': '八上', '8b': '八下', '9': '九年级' };
      return m[g] || g;
    },
    getUnitLabel(unit) {
      return String(unit || '').toUpperCase();
    },
    getModeLabel(m) {
      const map = { 'cn2en': '中→英', 'en2cn': '英→中', 'audio': '听写' };
      return map[m] || m;
    },
  }));
});
