/**
 * SSY Quiz (Dictation) Display
 * Alpine.js component: word quiz for classroom dictation
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('quizTab', () => ({
    // Setup
    totalVocabCount: 0,
    unitsByGrade: {},
    countsByGradeUnit: {},
    grade: 'all',
    selectedUnits: [],
    mode: 'cn2en',
    count: 20,
    // 固定词性比例：动词80%，名词10%，形容词5%，其他5%
    POS_RATIOS: { verb: 0.8, noun: 0.1, adjective: 0.05, other: 0.05 },
    interval: 13,         // 自动跳转间隔（秒）
    autoPlay: true,       // 自动朗读
    repeatCount: 1,       // 每个单词朗读次数
    autoNext: true,      // 自动跳转
    grades: ['all', '7a', '7b', '8a', '8b', '9'],

    // Quiz state
    words: [],
    index: 0,
    answerShown: false,
    quizStarted: false,
    fullscreen: false,
    showHistoryModal: false,
    historyDate: '',
    historyData: { daily: { words: [], count: 0 }, generated: { words: [], count: 0 } },
    historyLoading: false,
    showSidebar: true,
    showAllAnswers: false, // 默写完成后显示所有答案
    quizFinished: false,   // 是否已默写完最后一个
    quizSource: null,      // 'daily' | 'generated' | null
    _autoTimer: null,
    countdown: 0,         // 倒计时显示
    loaded: false,
    _allVocabCache: null, // 缓存全部词汇（用于本地筛选）

    async init() {
      const ensureLoaded = async () => {
        if (this.loaded) return;
        this.loaded = true;
        await this.loadVocab();
        this.historyDate = new Date().toISOString().split('T')[0];
        // 尝试恢复上次进度
        this._restoreProgress();
      };
      window.addEventListener('ssy:tab-change', async (event) => {
        if (event.detail?.tabId === 'quiz') {
          await ensureLoaded();
        }
      });
      if (document.body.dataset.activeTab === 'quiz') {
        await ensureLoaded();
      }
    },

    // 保存当前进度到 localStorage
    _saveProgress() {
      if (!this.quizStarted || this.words.length === 0) return;
      const progress = {
        words: this.words,
        index: this.index,
        answerShown: this.answerShown,
        mode: this.mode,
        quizSource: this.quizSource,
        timestamp: Date.now()
      };
      localStorage.setItem('ssy_quiz_progress', JSON.stringify(progress));
    },

    // 从 localStorage 恢复进度
    _restoreProgress() {
      try {
        const saved = localStorage.getItem('ssy_quiz_progress');
        if (!saved) return;
        const progress = JSON.parse(saved);
        // 检查是否超过24小时
        if (Date.now() - progress.timestamp > 24 * 60 * 60 * 1000) {
          localStorage.removeItem('ssy_quiz_progress');
          return;
        }
        // 恢复状态
        this.words = progress.words || [];
        this.index = progress.index || 0;
        this.answerShown = progress.answerShown || false;
        this.mode = progress.mode || 'cn2en';
        this.quizSource = progress.quizSource || null;
        if (this.words.length > 0) {
          this.quizStarted = true;
        }
      } catch (e) {
        localStorage.removeItem('ssy_quiz_progress');
      }
    },

    // 清除保存的进度
    _clearSavedProgress() {
      localStorage.removeItem('ssy_quiz_progress');
    },

    async loadVocab() {
      try {
        const data = await API.getQuizMeta();
        if (data) {
          this.totalVocabCount = data.total || 0;
          this.unitsByGrade = data.unitsByGrade || {};
          this.countsByGradeUnit = data.countsByGradeUnit || {};
        }
      } catch (e) {
        this.unitsByGrade = {};
        this.countsByGradeUnit = {};
        this.totalVocabCount = 0;
      }
    },

    // 本地筛选词汇：按词性比例选择
    _selectWordsLocally(allWords, targetCount) {
      // 筛选符合年级和单元的词
      let filtered = allWords;
      if (this.grade !== 'all') {
        filtered = filtered.filter(w => w.grade === this.grade);
      }
      if (this.selectedUnits.length > 0) {
        filtered = filtered.filter(w => this.selectedUnits.includes(w.unit));
      }

      // 分离四类词性
      const verbs = filtered.filter(w => w.pos === 'verb');
      const nouns = filtered.filter(w => w.pos === 'noun');
      const adjs = filtered.filter(w => w.pos === 'adjective');
      // 其他词性（副词、代词、介词等）
      const others = filtered.filter(w => !['verb', 'noun', 'adjective'].includes(w.pos));

      // 打乱顺序
      const shuffle = arr => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };

      // 使用固定比例：动词80%，名词10%，形容词5%，其他5%
      const ratios = this.POS_RATIOS;
      let verbCount = Math.floor(targetCount * ratios.verb);
      let nounCount = Math.floor(targetCount * ratios.noun);
      let adjCount = Math.floor(targetCount * ratios.adjective);
      let otherCount = Math.floor(targetCount * ratios.other);

      // 调整因取整导致的总数差异
      let total = verbCount + nounCount + adjCount + otherCount;
      if (total < targetCount) {
        // 优先从动词补（因为占比最大）
        verbCount += targetCount - total;
      }

      // 选择各类词
      let selected = [];
      selected.push(...shuffle(verbs).slice(0, Math.min(verbCount, verbs.length)));
      selected.push(...shuffle(nouns).slice(0, Math.min(nounCount, nouns.length)));
      selected.push(...shuffle(adjs).slice(0, Math.min(adjCount, adjs.length)));
      selected.push(...shuffle(others).slice(0, Math.min(otherCount, others.length)));

      // 如果某类词不足，从其他类补
      if (selected.length < targetCount) {
        const remaining = targetCount - selected.length;
        const usedIds = new Set(selected.map(w => w.id));
        const pool = filtered.filter(w => !usedIds.has(w.id));
        selected.push(...shuffle(pool).slice(0, remaining));
      }

      return shuffle(selected).slice(0, targetCount);
    },

    async generate() {
      if (this.availableWordCount === 0) {
        this.$dispatch('toast', { message: '当前年级/单元下暂无单词', type: 'error' });
        return;
      }
      try {
        // 动词比例 > 0 时，先预加载全部词汇
        if (this.verbRatio > 0 || this.nounRatio > 0 || this.adjRatio > 0) {
          await this._preloadAllVocab();
        }
        // 优先使用本地缓存的全部词汇进行筛选（支持动词比例控制）
        if (this._allVocabCache) {
          const selectedWords = this._selectWordsLocally(this._allVocabCache, this.count);
          if (selectedWords.length > 0) {
            this.words = selectedWords;
            this.index = 0;
            this.answerShown = false;
            this.quizStarted = true;
            this.quizSource = 'generated';
            this.quizFinished = false;
            this.showAllAnswers = false;
            this.$nextTick(() => this._onWordChange());
            this._saveProgress();
            return;
          }
        }
        // fallback: 使用API随机选词
        const data = await API.generateQuiz(this.grade === 'all' ? '' : this.grade, this.count, this.selectedUnits);
        this.words = data.words || [];
        if (this.words.length === 0) {
          this.$dispatch('toast', { message: '没有生成到可用单词', type: 'error' });
          return;
        }
        this.index = 0;
        this.answerShown = false;
        this.quizStarted = true;
        this.quizFinished = false;
        this.showAllAnswers = false;
        this.$nextTick(() => this._onWordChange());
        this._saveProgress();
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '生成默写失败', type: 'error' });
      }
    },

    // 预加载全部词汇（用于本地筛选）
    async _preloadAllVocab() {
      if (this._allVocabCache) return this._allVocabCache;
      try {
        const data = await API.getAllVocabulary();
        this._allVocabCache = data.flatWords || [];
      } catch (e) {
        this._allVocabCache = [];
      }
      return this._allVocabCache;
    },

    get availableWordCount() {
      if (this.grade === 'all') {
        return this.totalVocabCount;
      }
      if (this.selectedUnits.length > 0) {
        return this.selectedUnits.reduce((sum, unit) => sum + (this.countsByGradeUnit[`${this.grade}:${unit}`] || 0), 0);
      }
      return (this.unitsByGrade[this.grade] || []).reduce((sum, unit) => sum + (this.countsByGradeUnit[`${this.grade}:${unit}`] || 0), 0);
    },

    get availableUnits() {
      if (this.grade === 'all') return [];
      const units = this.unitsByGrade[this.grade] || [];
      return [...units].sort((a, b) => this.compareUnits(a, b));
    },

    setGrade(grade) {
      this.grade = grade;
      this.selectedUnits = [];
      // 切换年级时清除缓存
      this._allVocabCache = null;
    },

    toggleUnit(unit) {
      const index = this.selectedUnits.indexOf(unit);
      if (index >= 0) {
        this.selectedUnits.splice(index, 1);
      } else {
        this.selectedUnits.push(unit);
      }
      // 切换单元时清除缓存
      this._allVocabCache = null;
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
      const pos = w.pos || '';
      let cm = posMatch ? meaning.slice(posMatch[0].length).trim() : meaning; cm = cm.replace(/\([^(]*[a-zA-Z][^(]*\)/g, "").replace(/\/[^/]*\//g, "").replace(/\/[^/]*\]/g, "").replace(/^[，,\s]+/, "").replace(/^&\s*/, "").trim(); const cleanMeaning = cm;
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
      let m1 = (w.meaning || '').replace(/^[a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*/, ''); m1 = m1.replace(/\([^(]*[a-zA-Z][^(]*\)/g, '').replace(/\/[^/]*\//g, '').replace(/\/[^/]*\]/g, '').replace(/^[，,\s]+/, '').replace(/^&\s*/, '').trim();
      if (this.mode === 'cn2en') return m1;
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
      if (this.index > 0) { this.index--; this.answerShown = false; this.quizFinished = false; this.showAllAnswers = false; this._onWordChange(); this._saveProgress(); }
    },
    next() {
      if (this.index < this.words.length - 1) {
        this.index++; this.answerShown = false; this._onWordChange(); this._saveProgress();
      }
      // 到最后一个了，标记完成
      if (this.index === this.words.length - 1 && !this.quizFinished) {
        this.quizFinished = true;
        this._saveProgress();
        if (this.quizSource) {
          const today = new Date().toISOString().split('T')[0];
          API.logQuizComplete(today, this.quizSource, this.words.map(w => w.id)).catch(() => {});
        }
      }
    },
    reset() {
      this._clearAutoTimer();
      speechSynthesis.cancel();
      this.quizStarted = false; this.quizFinished = false; this.showAllAnswers = false;
      this.words = []; this.index = 0; this.answerShown = false; this.quizSource = null;
      this._clearSavedProgress();
    },
    toggleAnswer() { this.answerShown = !this.answerShown; this._saveProgress(); },

    // 获取单词的答案文本
    getWordAnswer(w) {
      const en = w.en || w.word || '';
      let m2 = (w.meaning || '').replace(/^[a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*/, ''); m2 = m2.replace(/\([^(]*[a-zA-Z][^(]*\)/g, '').replace(/\/[^/]*\//g, '').replace(/\/[^/]*\]/g, '').replace(/^[，,\s]+/, '').replace(/^&\s*/, '').trim();
      if (this.mode === 'cn2en') return en;
      if (this.mode === 'en2cn') return m2;
      return en;
    },

    toggleAutoNext() {
      this.autoNext = !this.autoNext;
      if (this.autoNext) { this._onWordChange(); } else { this._clearAutoTimer(); }
    },

    toggleAutoPlay() {
      this.autoPlay = !this.autoPlay;
    },

    toggleFullscreen() {
      this.fullscreen = !this.fullscreen;
      if (this.fullscreen) {
        document.documentElement.requestFullscreen?.() || document.documentElement.webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.() || document.webkitExitFullscreen?.();
      }
    },

    

    // === History Modal ===
    async loadHistory() {
      this.historyLoading = true;
      try {
        const data = await API.getQuizHistory(this.historyDate);
        this.historyData = {
          daily: data.daily || { words: [], count: 0 },
          generated: data.generated || { words: [], count: 0 },
        };
      } catch (e) {
        this.historyData = { daily: { words: [], count: 0 }, generated: { words: [], count: 0 } };
      } finally {
        this.historyLoading = false;
      }
    },
    openHistory() {
      this.showHistoryModal = true;
      this.loadHistory();
    },

    // === 智能每日50词 ===
    async loadSmartDaily() {
      try {
        const data = await API.get('/api/quiz-smart/daily');
        if (data.words && data.words.length > 0) {
          this.words = data.words;
          this.index = 0;
          this.answerShown = false;
          this.quizStarted = true;
          this.quizSource = 'daily';
          this.quizFinished = false;
          this.showAllAnswers = false;
          this.$nextTick(() => this._onWordChange());
          this._saveProgress();
          this.$dispatch('toast', { message: `已加载今日智能50词（${data.cached ? '缓存' : '新生成'}）`, type: 'success' });
        } else {
          this.$dispatch('toast', { message: '生成单词失败', type: 'error' });
        }
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '加载智能单词失败', type: 'error' });
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
