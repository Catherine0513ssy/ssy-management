/**
 * SSY Quiz (Dictation) Display
 * Alpine.js component: word quiz for classroom dictation
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('quizTab', () => ({
    // Setup
    vocab: [],
    grade: 'all',
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
    showAllAnswers: false,
    quizFinished: false,
    _autoTimer: null,
    countdown: 0,
    _speechReady: false,  // speechSynthesis 是否已激活

    async init() {
      await this.loadVocab();
      // 页面关闭/刷新时：提示确认 + 停止朗读
      window.addEventListener('beforeunload', (e) => {
        if (this.quizStarted) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      // 从 app.js switchTab 发来的停止信号
      window.addEventListener('ssy:quiz-stop', () => {
        this.reset();
      });
    },

    async loadVocab() {
      try {
        const data = await API.getAllVocabulary();
        if (data.words) {
          const w = data.words;
          this.vocab = Array.isArray(w) ? w : Object.values(w).flat();
        }
      } catch (e) {
        try {
          const data = await API.getVocabulary();
          this.vocab = data.words || [];
        } catch (_) {}
      }
    },

    generate() {
      let filtered = this.vocab;
      if (this.grade !== 'all') {
        filtered = filtered.filter(w => w.grade === this.grade);
      }
      if (filtered.length === 0) {
        this.$dispatch('toast', { message: '该年级暂无单词', type: 'error' });
        return;
      }
      const n = Math.min(parseInt(this.count) || 20, filtered.length);
      const shuffled = [...filtered].sort(() => Math.random() - 0.5);
      this.words = shuffled.slice(0, n);
      this.index = 0;
      this.answerShown = false;
      this.quizStarted = true;
      window._ssyQuizActive = true;
      // 在用户点击时预热 speechSynthesis，确保后续自动朗读可用
      this._warmUpSpeech();
      this.$nextTick(() => this._onWordChange());
    },

    // 预热 speechSynthesis：用户手势触发一次静音播放，解锁浏览器限制
    _warmUpSpeech() {
      if (this._speechReady) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        u.lang = 'en-US';
        speechSynthesis.speak(u);
        this._speechReady = true;
      } catch (_) {}
    },

    get currentWord() {
      if (!this.words.length) return null;
      const w = this.words[this.index];
      const meaning = w.meaning || '';
      // 匹配词性：支持 "n." "adj. & n." "modal v." 等格式
      const posMatch = meaning.match(/^((?:[a-z]+\s+)?[a-z]+\.(?:\s*&\s*(?:[a-z]+\s+)?[a-z]+\.)*)\s+/);
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

    _posFullName(pos) {
      const map = {
        'n.': '名词', 'v.': '动词', 'adj.': '形容词', 'adv.': '副词',
        'prep.': '介词', 'conj.': '连词', 'pron.': '代词', 'int.': '感叹词',
        'interj.': '感叹词', 'num.': '数词', 'art.': '冠词', 'modal v.': '情态动词',
      };
      // 先尝试整体匹配（如 "modal v."），再按 & 拆分
      if (map[pos]) return map[pos];
      return pos.split('&').map(p => map[p.trim()] || p.trim()).join(' & ');
    },

    get progress() {
      return `${this.index + 1} / ${this.words.length}`;
    },

    getWordPrompt(w) {
      const meaning = (w.meaning || '').replace(/^(?:[a-z]+\s+)?[a-z]+\.(?:\s*&\s*(?:[a-z]+\s+)?[a-z]+\.)*\s*/, '');
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
        u.onerror = () => { i++; if (i < n) setTimeout(speakOnce, 500); };
        speechSynthesis.speak(u);
        // Chrome bug: 长时间不操作后 speechSynthesis 会暂停，需要 resume
        clearTimeout(this._resumeTimer);
        this._resumeTimer = setTimeout(() => {
          if (speechSynthesis.speaking && speechSynthesis.paused) {
            speechSynthesis.resume();
          }
        }, 300);
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
        this._startAutoTimer();
      }
    },

    _startAutoTimer() {
      this._clearAutoTimer();
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
      if (this.index === this.words.length - 1 && !this.quizFinished) {
        this.quizFinished = true;
      }
    },
    reset() {
      this._clearAutoTimer();
      speechSynthesis.cancel();
      this.quizStarted = false; this.quizFinished = false; this.showAllAnswers = false;
      this.words = []; this.index = 0; this.answerShown = false;
      window._ssyQuizActive = false;
    },

    getWordAnswer(w) {
      const en = w.en || w.word || '';
      const meaning = (w.meaning || '').replace(/^(?:[a-z]+\s+)?[a-z]+\.(?:\s*&\s*(?:[a-z]+\s+)?[a-z]+\.)*\s*/, '');
      if (this.mode === 'cn2en') return en;
      if (this.mode === 'en2cn') return meaning;
      return en;
    },

    toggleAutoPlay() {
      this.autoPlay = !this.autoPlay;
      if (this.autoPlay) {
        this.speak();
      } else {
        speechSynthesis.cancel();
      }
    },

    toggleAutoNext() {
      this.autoNext = !this.autoNext;
      if (this.autoNext) { this._startAutoTimer(); } else { this._clearAutoTimer(); }
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
    getModeLabel(m) {
      const map = { 'cn2en': '中→英', 'en2cn': '英→中', 'audio': '听写' };
      return map[m] || m;
    },
  }));
});
