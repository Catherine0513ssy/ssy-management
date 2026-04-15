/**
 * Word Match Game (English Word Matching)
 * Alpine.js component for the main SSY site
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('wordGameTab', () => ({
    // Game config
    CONFIG: {
      easy:   { grade: '7a', pairs: 28, time: 120 },
      medium: { grade: '8a', pairs: 35, time: 150 },
      hard:   { grade: '8b', pairs: 42, time: 180 }
    },

    // State
    page: 'home',         // 'home' | 'game' | 'result'
    mode: 'single',       // 'single' | 'dual'
    diff: 'easy',
    wordPool: [],
    loading: false,

    // Single game state
    gameState: null,
    // Dual game state
    dualState: null,
    // Timer
    timerInterval: null,
    timerElapsed: 0,
    dualTimerLastTime: 0,
    isPaused: false,

    init() {
      this.$nextTick(() => this.createBg());
      window.addEventListener('ssy:tab-change', (e) => {
        if (e.detail?.tabId !== 'wordgame') {
          this.goHome();
        }
      });
    },

    createBg() {
      const container = document.getElementById('wg-bgAnim');
      if (!container) return;
      container.innerHTML = '';
      for (let i = 0; i < 30; i++) {
        const star = document.createElement('div');
        star.className = 'wordgame-star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDuration = (1.5 + Math.random() * 2) + 's';
        star.style.animationDelay = Math.random() * 3 + 's';
        container.appendChild(star);
      }
      for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'wordgame-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.width = (4 + Math.random() * 8) + 'px';
        p.style.height = p.style.width;
        p.style.animationDuration = (8 + Math.random() * 6) + 's';
        p.style.animationDelay = Math.random() * 10 + 's';
        container.appendChild(p);
      }
    },

    selectMode(mode) { this.mode = mode; },
    selectDiff(diff) { this.diff = diff; },

    async startGame() {
      this.loading = true;
      try {
        // Use cached vocab if available, otherwise fetch
        const data = await API.getAllVocabulary();
        this.wordPool = data.flatWords || [];
      } catch (e) {
        alert('无法加载单词库，请检查网络');
        this.loading = false;
        return;
      }
      this.loading = false;
      this.isPaused = false;
      this.timerElapsed = 0;
      this.dualTimerLastTime = 0;
      this.page = 'game';
      this.$nextTick(() => {
        if (this.mode === 'single') this.startSingleGame();
        else this.startDualGame();
      });
    },

    startSingleGame() {
      const cfg = this.CONFIG[this.diff];
      const words = this.pickWords(cfg.grade, cfg.pairs);
      this.gameState = {
        score: 0, matched: 0, total: cfg.pairs,
        timeLeft: cfg.time, words, selected: null, combo: 0
      };
      this.dualState = null;
      this.renderArenaSingle(words);
      this.startTimer();
    },

    renderArenaSingle(words) {
      const arena = document.getElementById('wg-arena');
      if (!arena) return;
      const all = this.shuffle([
        ...words.map(w => ({...w, uid: w.id + '_en', isEnglish: true})),
        ...words.map(w => ({...w, uid: w.id + '_cn', isEnglish: false}))
      ]);
      arena.innerHTML = `<div class="wg-arena-single"><div class="wg-card-grid" id="wg-grid-single"></div></div>`;
      this.renderGrid('wg-grid-single', all, 's');
    },

    startDualGame() {
      const cfg = this.CONFIG[this.diff];
      const words = this.pickWords(cfg.grade, cfg.pairs);
      this.dualState = {
        p1: { score: 0, matched: 0, timeLeft: cfg.time, words, selected: null, combo: 0, done: false },
        p2: { score: 0, matched: 0, timeLeft: cfg.time, words: [...words], selected: null, combo: 0, done: false },
        winner: null
      };
      this.gameState = null;
      this.renderArenaDual(words);
      this.startDualTimer();
    },

    renderArenaDual(words) {
      const arena = document.getElementById('wg-arena');
      if (!arena) return;
      arena.innerHTML = `
        <div class="wg-arena-dual">
          <div class="wg-player-side">
            <h4>玩家1</h4>
            <div class="wg-card-grid" id="wg-grid-p1"></div>
          </div>
          <div class="wg-vs-divider">VS</div>
          <div class="wg-player-side">
            <h4>玩家2</h4>
            <div class="wg-card-grid" id="wg-grid-p2"></div>
          </div>
        </div>
      `;
      const cards = (ws) => this.shuffle([
        ...ws.map(w => ({...w, uid: w.id + '_en', isEnglish: true})),
        ...ws.map(w => ({...w, uid: w.id + '_cn', isEnglish: false}))
      ]);
      this.renderGrid('wg-grid-p1', cards(words), 'p1');
      this.renderGrid('wg-grid-p2', cards(words), 'p2');
    },

    getPrimaryMeaning(text) {
      if (!text) return '';
      // Remove POS prefix like "v.", "n.", "adj.", "adv.", "prep.", "conj.", "pron.", "interj.", "art.", "num.", "abbr."
      let cleaned = String(text).replace(/^[a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*/i, '').trim();
      // Remove bracketed content like (英文) or （=organise）
      cleaned = cleaned.replace(/\([^)]*\)|（[^）]*）/g, '').trim();
      // Take only the first meaning before separators like ; ； , / |
      const first = cleaned.split(/[;；,/|]/)[0];
      return first.trim();
    },

    renderGrid(containerId, cards, prefix) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const n = cards.length;
      const isDual = prefix === 'p1' || prefix === 'p2';
      // Dual mode needs more columns because each side is only ~50% width
      const cols = isDual
        ? (n <= 10 ? 3 : n <= 14 ? 4 : n <= 24 ? 5 : n <= 36 ? 6 : n <= 50 ? 7 : 8)
        : (n <= 10 ? 3 : n <= 16 ? 4 : n <= 26 ? 5 : n <= 40 ? 6 : n <= 56 ? 7 : 8);
      container.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
      container.style.display = 'grid';
      container.innerHTML = '';
      cards.forEach(card => {
        const el = document.createElement('div');
        const text = card.isEnglish ? (card.word || '') : this.getPrimaryMeaning(card.meaning);
        let sizeClass = '';
        if (card.isEnglish) {
          const len = text.length;
          if (len > 16) sizeClass = ' wg-xxl';
          else if (len > 12) sizeClass = ' wg-xl';
          else if (len > 8) sizeClass = ' wg-long';
        }
        el.className = `wg-card ${card.isEnglish ? 'wg-english' : 'wg-chinese'}${sizeClass}`;
        el.textContent = text;
        el.onclick = () => this.onCardClick(el, card, prefix);
        container.appendChild(el);
      });
    },

    onCardClick(el, card, prefix) {
      if (this.isPaused) return;
      if (el.classList.contains('wg-matched')) return;
      let pState;
      if (prefix === 'p1') pState = this.dualState.p1;
      else if (prefix === 'p2') pState = this.dualState.p2;
      else pState = this.gameState;

      if (el.classList.contains('wg-selected')) {
        el.classList.remove('wg-selected');
        pState.selected = null;
        return;
      }

      if (pState.selected) {
        const prev = pState.selected;
        const prevBase = prev.uid.replace('_en','').replace('_cn','');
        const currBase = card.uid.replace('_en','').replace('_cn','');
        if (prev.isEnglish !== card.isEnglish && prevBase === currBase) {
          prev.el.classList.remove('wg-selected');
          el.classList.add('wg-correct');
          setTimeout(() => { prev.el.classList.add('wg-matched'); el.classList.add('wg-matched'); }, 350);
          const pts = 10 + (pState.combo || 0) * 2;
          pState.score += pts;
          pState.matched++;
          pState.combo = (pState.combo || 0) + 1;
          this.showScorePopup(el, '+' + pts);
          this.updateScore(pState, prefix);
          pState.selected = null;
          const cfg = this.CONFIG[this.diff];
          if (pState.matched >= cfg.pairs) {
            if (this.mode === 'dual') {
              pState.done = true;
              if (!this.dualState.winner) {
                this.dualState.winner = prefix === 'p1' ? 1 : 2;
                clearInterval(this.timerInterval);
                this.showDualResult(prefix);
              }
            } else {
              this.endGame(pState);
            }
          }
        } else {
          prev.el.classList.remove('wg-selected');
          el.classList.add('wg-wrong');
          pState.score = Math.max(0, pState.score - 3);
          pState.combo = 0;
          this.updateScore(pState, prefix);
          setTimeout(() => el.classList.remove('wg-wrong'), 350);
          pState.selected = null;
        }
      } else {
        el.classList.add('wg-selected');
        pState.selected = { el, isEnglish: card.isEnglish, uid: card.uid };
        pState.combo = 0;
      }
    },

    updateScore(state, prefix) {
      if (this.mode === 'dual') {
        const el = document.getElementById('wg-score-' + prefix);
        if (el) el.textContent = state.score;
      } else {
        const el = document.getElementById('wg-score-display');
        if (el) el.textContent = '得分: ' + state.score;
      }
    },

    startTimer() {
      this.clearTimer();
      const fill = document.getElementById('wg-timer-fill');
      const cfg = this.CONFIG[this.diff];
      this.timerInterval = setInterval(() => {
        this.timerElapsed += 0.1;
        const pct = Math.max(0, (cfg.time - this.timerElapsed) / cfg.time * 100);
        if (fill) fill.style.width = pct + '%';
        if (fill) fill.className = 'wg-timer-fill' + (pct < 20 ? ' wg-danger' : pct < 50 ? ' wg-warning' : '');
        const txt = document.getElementById('wg-timer-text');
        if (txt) txt.textContent = '剩余 ' + Math.ceil(cfg.time - this.timerElapsed) + ' 秒';
        if (this.timerElapsed >= cfg.time) {
          this.clearTimer();
          this.endGameTimeout();
        }
      }, 100);
    },

    startDualTimer() {
      this.clearTimer();
      const fill = document.getElementById('wg-timer-fill');
      const cfg = this.CONFIG[this.diff];
      this.dualTimerLastTime = Date.now();
      this.timerInterval = setInterval(() => {
        const now = Date.now();
        const delta = (now - this.dualTimerLastTime) / 1000;
        this.dualTimerLastTime = now;
        if (this.dualState.p1.timeLeft > 0) this.dualState.p1.timeLeft -= delta;
        if (this.dualState.p2.timeLeft > 0) this.dualState.p2.timeLeft -= delta;
        const remaining = Math.max(this.dualState.p1.timeLeft, this.dualState.p2.timeLeft);
        const pct = Math.max(0, remaining / cfg.time * 100);
        if (fill) fill.style.width = pct + '%';
        if (fill) fill.className = 'wg-timer-fill' + (pct < 20 ? ' wg-danger' : pct < 50 ? ' wg-warning' : '');
        const txt = document.getElementById('wg-timer-text');
        if (txt) txt.textContent = '剩余 ' + Math.ceil(remaining) + ' 秒';
        if (this.dualState.p1.timeLeft <= 0 && this.dualState.p2.timeLeft <= 0) {
          this.clearTimer();
          this.showDualResult(null);
        }
      }, 100);
    },

    clearTimer() {
      if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    },

    togglePause() {
      if (this.page !== 'game') return;
      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        this.clearTimer();
      } else {
        if (this.mode === 'single') {
          this.startTimer();
        } else {
          this.dualTimerLastTime = Date.now();
          this.startDualTimer();
        }
      }
    },

    quitGame() {
      if (confirm('确定要退出当前游戏吗？')) {
        this.goHome();
      }
    },

    endGame(state) {
      this.clearTimer();
      this.page = 'result';
      this.$nextTick(() => {
        const emoji = document.getElementById('wg-result-emoji');
        const title = document.getElementById('wg-result-title');
        const sub = document.getElementById('wg-result-subtitle');
        if (emoji) emoji.textContent = '🎉';
        if (title) title.textContent = '通关成功！';
        if (sub) sub.textContent = '太棒了！';
        this.setStat('wg-stat-score', state.score);
        this.setStat('wg-stat-time', (this.CONFIG[this.diff].time - Math.ceil(state.timeLeft)) + '秒');
        this.setStat('wg-stat-correct', state.matched + '对');
      });
    },

    endGameTimeout() {
      this.clearTimer();
      const state = this.gameState;
      this.page = 'result';
      this.$nextTick(() => {
        const emoji = document.getElementById('wg-result-emoji');
        const title = document.getElementById('wg-result-title');
        const sub = document.getElementById('wg-result-subtitle');
        if (emoji) emoji.textContent = '⏰';
        if (title) title.textContent = '时间到！';
        if (sub) sub.textContent = '完成了 ' + state.matched + ' / ' + state.total + ' 对';
        this.setStat('wg-stat-score', state.score);
        this.setStat('wg-stat-time', this.CONFIG[this.diff].time + '秒');
        this.setStat('wg-stat-correct', state.matched + '对');
      });
    },

    showDualResult(winnerKey) {
      this.clearTimer();
      const p1 = this.dualState.p1, p2 = this.dualState.p2;
      let winner, msg;
      if (this.dualState.winner) {
        winner = this.dualState.winner;
        msg = winner === 1 ? '玩家1领先一步！' : '玩家2领先一步！';
      } else if (p1.matched > p2.matched) {
        winner = 1; msg = '玩家1配对更多！';
      } else if (p2.matched > p1.matched) {
        winner = 2; msg = '玩家2配对更多！';
      } else {
        winner = p1.timeLeft > p2.timeLeft ? 1 : 2;
        msg = winner === 1 ? '玩家1剩余时间更多！' : '玩家2剩余时间更多！';
      }
      this.page = 'result';
      this.$nextTick(() => {
        const emoji = document.getElementById('wg-result-emoji');
        const title = document.getElementById('wg-result-title');
        const sub = document.getElementById('wg-result-subtitle');
        if (emoji) emoji.textContent = '🏆';
        if (title) title.textContent = '玩家' + winner + ' 获胜！';
        if (sub) sub.textContent = msg;
        this.setStat('wg-stat-score', p1.score + ' vs ' + p2.score);
        this.setStat('wg-stat-time', Math.ceil(p1.timeLeft) + '秒 vs ' + Math.ceil(p2.timeLeft) + '秒');
        this.setStat('wg-stat-correct', p1.matched + '对 vs ' + p2.matched + '对');
      });
    },

    setStat(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    },

    retryGame() {
      this.isPaused = false;
      this.timerElapsed = 0;
      this.dualTimerLastTime = 0;
      this.page = 'game';
      this.$nextTick(() => {
        if (this.mode === 'single') this.startSingleGame();
        else this.startDualGame();
      });
    },

    goHome() {
      this.page = 'home';
      this.clearTimer();
      this.isPaused = false;
      this.timerElapsed = 0;
      this.dualTimerLastTime = 0;
      this.gameState = null;
      this.dualState = null;
      this.$nextTick(() => this.createBg());
    },

    showScorePopup(el, text) {
      const rect = el.getBoundingClientRect();
      const popup = document.createElement('div');
      popup.className = 'wg-score-popup';
      popup.textContent = text;
      popup.style.left = rect.left + rect.width / 2 - 15 + 'px';
      popup.style.top = rect.top + 'px';
      document.body.appendChild(popup);
      setTimeout(() => popup.remove(), 800);
    },

    pickWords(grade, count) {
      const filtered = this.wordPool.filter(w => w.grade === grade);
      const verbs = filtered.filter(w => w.pos === 'verb');
      const adjNouns = filtered.filter(w => w.pos === 'adjective' || w.pos === 'noun');
      const others = filtered.filter(w => w.pos !== 'verb' && w.pos !== 'adjective' && w.pos !== 'noun');
      const verbCount = Math.floor(count * 0.7);
      const adjNounCount = Math.floor(count * 0.2);
      const randomCount = count - verbCount - adjNounCount;
      const selectedVerbs = this.shuffle(verbs).slice(0, Math.min(verbCount, verbs.length));
      const selectedAdjNouns = this.shuffle(adjNouns).slice(0, Math.min(adjNounCount, adjNouns.length));
      const selectedOthers = this.shuffle(others).slice(0, Math.min(randomCount, others.length));
      let selected = [...selectedVerbs, ...selectedAdjNouns, ...selectedOthers];
      if (selected.length < count) {
        const remaining = filtered.filter(w => !selected.includes(w));
        const needed = count - selected.length;
        selected.push(...this.shuffle(remaining).slice(0, needed));
      }
      return this.shuffle(selected);
    },

    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  }));
});
