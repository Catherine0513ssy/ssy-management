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
    PLANE_CONFIG: {
      easy:   { grade: '7a', time: 90, spawnRate: 2200, speedMin: 0.9, speedMax: 1.5, enemyCount: 3, enemyHp: 1 },
      medium: { grade: '8a', time: 120, spawnRate: 2000, speedMin: 1.1, speedMax: 1.8, enemyCount: 3, enemyHp: 2 },
      hard:   { grade: '8b', time: 150, spawnRate: 1800, speedMin: 1.3, speedMax: 2.2, enemyCount: 3, enemyHp: 3 }
    },

    // State
    page: 'home',         // 'home' | 'game' | 'result'
    mode: 'single',       // 'single' | 'dual'
    diff: 'easy',
    wordPool: [],
    loading: false,
    gameMenu: 'main',     // 'main' | 'match' | 'plane'

    // Single game state
    gameState: null,
    // Dual game state
    dualState: null,
    // Timer
    timerInterval: null,
    timerElapsed: 0,
    dualTimerLastTime: 0,
    isPaused: false,

    // Plane game state
    planeState: null,
    planeLoopId: null,
    planeLastTime: 0,
    planeTimerInterval: null,
    planeElapsed: 0,

    init() {
      this.$nextTick(() => this.createBg());
      window.addEventListener('ssy:tab-change', (e) => {
        if (e.detail?.tabId !== 'wordgame') {
          this.goHome();
        }
      });
      window.addEventListener('resize', () => {
        if (this.gameMenu === 'plane' && this.page === 'game' && this.planeState) {
          this.resizePlaneCanvas();
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
    selectGameType(type) {
      this.gameMenu = type;
      if (type === 'match') {
        this.mode = 'single';
      }
    },
    backToMenu() {
      this.gameMenu = 'main';
      this.page = 'home';
      this.clearPlaneGame();
    },

    async startGame() {
      this.loading = true;
      try {
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
      this.planeState = null;
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
      this.planeState = null;
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
      let cleaned = String(text).replace(/^[a-z]+\.(?:\s*&\s*[a-z]+\.)*\s*/i, '').trim();
      cleaned = cleaned.replace(/\([^)]*\)|（[^）]*）/g, '').trim();
      const first = cleaned.split(/[;；,/|]/)[0];
      return first.trim();
    },

    renderGrid(containerId, cards, prefix) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const n = cards.length;
      const isDual = prefix === 'p1' || prefix === 'p2';
      const w = window.innerWidth || 1200;
      let extraCols = 0;
      if (w < 850) extraCols = 2;
      else if (w < 1100) extraCols = 1;
      else if (w >= 1600) extraCols = -1;
      let cols = isDual
        ? (n <= 10 ? 3 : n <= 14 ? 4 : n <= 24 ? 5 : n <= 36 ? 6 : n <= 50 ? 7 : 8)
        : (n <= 10 ? 3 : n <= 16 ? 4 : n <= 26 ? 5 : n <= 40 ? 6 : n <= 56 ? 7 : 8);
      cols = Math.max(3, cols + extraCols);
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
        if (this.gameMenu === 'plane' && this.planeLoopId) {
          cancelAnimationFrame(this.planeLoopId);
          this.planeLoopId = null;
        }
      } else {
        if (this.gameMenu === 'match') {
          if (this.mode === 'single') {
            this.startTimer();
          } else {
            this.dualTimerLastTime = Date.now();
            this.startDualTimer();
          }
        } else if (this.gameMenu === 'plane') {
          this.startPlaneTimer();
          if (!this.planeLoopId) {
            this.planeLastTime = performance.now();
            this.planeLoopId = requestAnimationFrame((t) => this.planeTick(t));
          }
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
        if (this.gameMenu === 'match') {
          if (this.mode === 'single') this.startSingleGame();
          else this.startDualGame();
        } else if (this.gameMenu === 'plane') {
          this.startPlaneGame();
        }
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
      this.clearPlaneGame();
      this.gameMenu = 'main';
      this.$nextTick(() => this.createBg());
    },

    fitScreen() {
      if (this.page !== 'game') return;
      this.$nextTick(() => {
        if (this.gameMenu === 'match' && this.mode === 'single' && this.gameState) {
          const words = this.gameState.words;
          const all = this.shuffle([
            ...words.map(w => ({...w, uid: w.id + '_en', isEnglish: true})),
            ...words.map(w => ({...w, uid: w.id + '_cn', isEnglish: false}))
          ]);
          this.renderGrid('wg-grid-single', all, 's');
          this.$nextTick(() => {
            const matched = this.gameState.matched || 0;
            const grid = document.getElementById('wg-grid-single');
            if (grid && matched > 0) {
              const cards = Array.from(grid.children);
              const matchedSet = new Set();
              for (let i = 0; i < words.length; i++) {
                if (i < matched) matchedSet.add(words[i].id + '_en');
                if (i < matched) matchedSet.add(words[i].id + '_cn');
              }
              cards.forEach((c, idx) => {
                const cardData = all[idx];
                if (matchedSet.has(cardData.uid)) {
                  c.classList.add('wg-matched');
                }
              });
            }
          });
        } else if (this.gameMenu === 'match' && this.mode === 'dual' && this.dualState) {
          this.renderArenaDual(this.dualState.p1.words);
          this.$nextTick(() => {
            ['p1','p2'].forEach(p => {
              const st = this.dualState[p === 'p1' ? 'p1' : 'p2'];
              const grid = document.getElementById('wg-grid-' + p);
              if (!grid || !st.words) return;
              const cards = Array.from(grid.children);
              const matched = st.matched || 0;
              cards.forEach(c => {
                const text = c.textContent;
                const isEn = c.classList.contains('wg-english');
                const found = st.words.slice(0, matched).some(w => {
                  return isEn ? (w.word === text) : (this.getPrimaryMeaning(w.meaning) === text);
                });
                if (found) c.classList.add('wg-matched');
              });
            });
          });
        }
      });
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

    // ========== Plane Game ==========
    async startPlaneGame() {
      if (!this.wordPool.length) {
        this.loading = true;
        try {
          const data = await API.getAllVocabulary();
          this.wordPool = data.flatWords || [];
        } catch (e) {
          alert('无法加载单词库，请检查网络');
          this.loading = false;
          return;
        }
        this.loading = false;
      }
      this.isPaused = false;
      this.planeElapsed = 0;
      this.page = 'game';
      this.gameMenu = 'plane';
      this.$nextTick(() => {
        const cfg = this.PLANE_CONFIG[this.diff];
        const words = this.pickWords(cfg.grade, 60);
        this.initPlaneGame(words);
      });
    },

    initPlaneGame(words) {
      const canvas = document.getElementById('wg-plane-canvas');
      if (!canvas) return;
      this.resizePlaneCanvas();
      const ctx = canvas.getContext('2d');
      const cfg = this.PLANE_CONFIG[this.diff];
      const dpr = window.devicePixelRatio || 1;

      this.planeState = {
        canvas, ctx, words,
        width: canvas.width / dpr,
        height: canvas.height / dpr,
        score: 0,
        playerHp: 3,
        maxPlayerHp: 3,
        plane: { x: (canvas.width / dpr) / 2, y: (canvas.height / dpr) - 80, width: 46, height: 46 },
        planeTargetX: (canvas.width / dpr) / 2,
        bullets: [],
        enemies: [],
        items: [],
        particles: [],
        target: null,
        targetIsEnglish: false,
        targetHitsRequired: 0,
        targetHitsCurrent: 0,
        spawnTimer: 0,
        lastShot: 0,
        combo: 0,
        gameOver: false,
        correctHits: 0,
        frozenUntil: 0
      };

      this.updatePlaneHpUI();
      this.setPlaneTarget();
      this.bindPlaneInput();
      this.startPlaneTimer();
      this.planeLastTime = performance.now();
      this.planeLoopId = requestAnimationFrame((t) => this.planeTick(t));
    },

    resizePlaneCanvas() {
      const canvas = document.getElementById('wg-plane-canvas');
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      if (this.planeState) {
        this.planeState.width = canvas.width / dpr;
        this.planeState.height = canvas.height / dpr;
        this.planeState.plane.y = (canvas.height / dpr) - 80;
        this.planeState.planeTargetX = Math.min(this.planeState.planeTargetX, this.planeState.width - 30);
      }
    },

    bindPlaneInput() {
      const canvas = document.getElementById('wg-plane-canvas');
      if (!canvas) return;
      const track = (clientX) => {
        if (!this.planeState || this.planeState.gameOver || this.isPaused) return;
        const rect = canvas.getBoundingClientRect();
        let x = clientX - rect.left;
        x = Math.max(30, Math.min(rect.width - 30, x));
        this.planeState.planeTargetX = x;
      };
      canvas.ontouchstart = (e) => { e.preventDefault(); if (e.touches[0]) track(e.touches[0].clientX); };
      canvas.ontouchmove = (e) => { e.preventDefault(); if (e.touches[0]) track(e.touches[0].clientX); };
      canvas.onmousedown = (e) => { track(e.clientX); };
      canvas.onmousemove = (e) => { track(e.clientX); };
    },

    startPlaneTimer() {
      this.clearPlaneTimer();
      const fill = document.getElementById('wg-timer-fill');
      const cfg = this.PLANE_CONFIG[this.diff];
      const txt = document.getElementById('wg-timer-text');
      if (txt) txt.textContent = '剩余 ' + Math.ceil(cfg.time - this.planeElapsed) + ' 秒';
      this.planeTimerInterval = setInterval(() => {
        if (this.isPaused || !this.planeState || this.planeState.gameOver) return;
        this.planeElapsed += 0.1;
        const remaining = Math.max(0, cfg.time - this.planeElapsed);
        const pct = (remaining / cfg.time) * 100;
        if (fill) fill.style.width = pct + '%';
        if (fill) fill.className = 'wg-timer-fill' + (pct < 20 ? ' wg-danger' : pct < 50 ? ' wg-warning' : '');
        if (txt) txt.textContent = '剩余 ' + Math.ceil(remaining) + ' 秒';
        if (remaining <= 0) {
          this.clearPlaneTimer();
          this.endPlaneGame('timeout');
        }
      }, 100);
    },

    clearPlaneTimer() {
      if (this.planeTimerInterval) { clearInterval(this.planeTimerInterval); this.planeTimerInterval = null; }
    },

    clearPlaneGame() {
      if (this.planeLoopId) { cancelAnimationFrame(this.planeLoopId); this.planeLoopId = null; }
      this.clearPlaneTimer();
      this.planeState = null;
    },

    setPlaneTarget() {
      if (!this.planeState || this.planeState.words.length === 0) return;
      const pool = this.planeState.words;
      const word = pool[Math.floor(Math.random() * pool.length)];
      this.planeState.target = word;
      this.planeState.targetIsEnglish = Math.random() < 0.5;
      this.planeState.targetHitsRequired = 1;
      this.planeState.targetHitsCurrent = 0;
      const targetEl = document.getElementById('wg-plane-target');
      if (targetEl) {
        targetEl.textContent = this.planeState.targetIsEnglish ? (word.word || '') : this.getPrimaryMeaning(word.meaning);
        targetEl.className = (this.planeState.targetIsEnglish ? 'wg-plane-target-en' : 'wg-plane-target-cn') + ' wg-pulse';
        setTimeout(() => {
          if (targetEl) targetEl.classList.remove('wg-pulse');
        }, 400);
      }
      this.updateTargetProgressUI();
    },

    updateTargetProgressUI() {
      const el = document.getElementById('wg-target-progress-fill');
      if (!this.planeState || !el) return;
      const pct = this.planeState.targetHitsRequired ? (this.planeState.targetHitsCurrent / this.planeState.targetHitsRequired) * 100 : 0;
      el.style.width = pct + '%';
    },

    updatePlaneHpUI() {
      const el = document.getElementById('wg-hearts');
      if (!this.planeState || !el) return;
      let hearts = '';
      for (let i = 0; i < this.planeState.maxPlayerHp; i++) {
        hearts += i < this.planeState.playerHp ? '❤️' : '🖤';
      }
      el.textContent = hearts;
    },

    planeTick(timestamp) {
      if (!this.planeState || this.planeState.gameOver || this.isPaused || this.page !== 'game') return;
      const dt = Math.min(32, timestamp - this.planeLastTime);
      this.planeLastTime = timestamp;
      this.planeUpdate(dt);
      this.planeDraw();
      this.planeLoopId = requestAnimationFrame((t) => this.planeTick(t));
    },

    planeUpdate(dt) {
      const st = this.planeState;
      const cfg = this.PLANE_CONFIG[this.diff];
      const now = performance.now();
      const frozen = now < st.frozenUntil;

      // Smooth plane follow
      st.plane.x += (st.planeTargetX - st.plane.x) * 0.12;

      // Auto shoot
      if (now - st.lastShot > 180) {
        st.bullets.push({ x: st.plane.x, y: st.plane.y - 20, width: 6, height: 16, speed: 10 });
        st.lastShot = now;
      }

      // Update bullets
      for (let i = st.bullets.length - 1; i >= 0; i--) {
        const b = st.bullets[i];
        b.y -= b.speed * (dt / 16);
        if (b.y < -30) st.bullets.splice(i, 1);
      }

      // Spawn enemies
      st.spawnTimer += dt;
      if (st.spawnTimer >= cfg.spawnRate) {
        this.planeSpawnWave();
        st.spawnTimer = 0;
      }

      // Update enemies
      for (let i = st.enemies.length - 1; i >= 0; i--) {
        const e = st.enemies[i];
        if (!frozen) {
          e.y += e.speed * (dt / 16);
        }
        // Pass bottom line
        if (e.y > st.height - 20) {
          st.enemies.splice(i, 1);
          // Only correct answer falling to bottom damages player
          if (e.isCorrect) {
            st.playerHp = Math.max(0, st.playerHp - 1);
            this.updatePlaneHpUI();
            if (st.playerHp <= 0) {
              this.endPlaneGame('hp');
              return;
            }
          }
          continue;
        }
        // Collision with bullets
        let hit = false;
        for (let j = st.bullets.length - 1; j >= 0; j--) {
          const b = st.bullets[j];
          if (this.rectIntersect(b.x - b.width/2, b.y - b.height/2, b.width, b.height,
                                 e.x - e.radius, e.y - e.radius, e.radius*2, e.radius*2)) {
            st.bullets.splice(j, 1);
            e.hp -= 1;
            // Hit flash
            e.flash = 5;
            if (e.hp <= 0) {
              this.planeDestroyEnemy(e);
              st.enemies.splice(i, 1);
            }
            hit = true;
            break;
          }
        }
        if (!hit && e.flash > 0) e.flash -= dt;
      }

      // Update items
      for (let i = st.items.length - 1; i >= 0; i--) {
        const it = st.items[i];
        it.y += it.speed * (dt / 16);
        // Collect by plane
        const px = st.plane.x, py = st.plane.y;
        const pr = 28;
        const dx = it.x - px, dy = it.y - py;
        if (dx*dx + dy*dy < (pr + it.radius)*(pr + it.radius)) {
          this.applyItem(it.type);
          st.items.splice(i, 1);
          continue;
        }
        if (it.y > st.height + 30) {
          st.items.splice(i, 1);
        }
      }

      // Update particles
      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i];
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.life -= dt;
        if (p.life <= 0) st.particles.splice(i, 1);
      }
    },

    applyItem(type) {
      const st = this.planeState;
      if (!st) return;
      if (type === 'heart') {
        st.playerHp = Math.min(st.maxPlayerHp, st.playerHp + 1);
        this.updatePlaneHpUI();
        this.showFloatingText('+1生命', st.plane.x, st.plane.y - 30, '#ef4444');
      } else if (type === 'clock') {
        this.planeElapsed = Math.max(0, this.planeElapsed - 15);
        this.showFloatingText('+10秒', st.plane.x, st.plane.y - 30, '#f59e0b');
      } else if (type === 'freeze') {
        st.frozenUntil = performance.now() + 3000;
        this.showFloatingText('冰冻!', st.plane.x, st.plane.y - 30, '#38bdf8');
      }
    },

    showFloatingText(text, x, y, color) {
      const st = this.planeState;
      if (!st) return;
      for (let i = 0; i < 1; i++) {
        st.particles.push({
          x, y, vx: 0, vy: -1.5,
          life: 800, size: 0,
          color, text
        });
      }
    },

    planeDraw() {
      const st = this.planeState;
      const ctx = st.ctx;
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, st.width, st.height);

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, st.height);
      grad.addColorStop(0, '#0b1220');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, st.width, st.height);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 24; i++) {
        const sx = ((i * 97) % st.width);
        const sy = ((i * 53 + performance.now() * 0.015) % st.height);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Frozen effect overlay
      if (performance.now() < st.frozenUntil) {
        ctx.fillStyle = 'rgba(56,189,248,0.08)';
        ctx.fillRect(0, 0, st.width, st.height);
      }

      // Draw plane
      ctx.save();
      ctx.translate(st.plane.x, st.plane.y);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(16, 14);
      ctx.lineTo(0, 7);
      ctx.lineTo(-16, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.moveTo(-6, 14);
      ctx.lineTo(0, 26 + Math.sin(performance.now() / 40) * 3);
      ctx.lineTo(6, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Draw bullets
      ctx.fillStyle = '#facc15';
      for (const b of st.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.width/2, 0, Math.PI*2);
        ctx.fill();
      }

      // Draw enemies
      for (const e of st.enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);
        // Monster body (统一颜色与形状，不暴露正确答案)
        ctx.fillStyle = e.flash > 0 ? '#c4b5fd' : '#8b5cf6';
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI / 3) * k - Math.PI / 2;
          const px = Math.cos(ang) * e.radius;
          const py = Math.sin(ang) * e.radius;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#4c1d95';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Label box (black bg, white text)
        const padX = 14, padY = 9;
        const fs = e.fontSize + 4;
        ctx.font = 'bold ' + fs + 'px system-ui, -apple-system, Segoe UI, Microsoft YaHei, sans-serif';
        const tm = ctx.measureText(e.text);
        const boxW = tm.width + padX * 2;
        const boxH = fs + padY * 2 + 2;
        const bx = e.x - boxW / 2;
        const by = e.y - e.radius - boxH - 10;
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        this.roundRectPath(ctx, bx, by, boxW, boxH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, e.x, by + boxH / 2 + 1);

        // HP bar below monster
        const barW = 44, barH = 5;
        const hx = e.x - barW / 2;
        const hy = e.y + e.radius + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(hx, hy, barW, barH);
        const hpPct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = hpPct > 0.5 ? '#4ade80' : '#f87171';
        ctx.fillRect(hx + 1, hy + 1, (barW - 2) * hpPct, barH - 2);
      }

      // Draw items
      for (const it of st.items) {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.beginPath();
        ctx.arc(0, 0, it.radius, 0, Math.PI * 2);
        ctx.fillStyle = it.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.emoji, 0, 0);
        ctx.restore();
      }

      // Draw particles + floating text
      for (const p of st.particles) {
        if (p.text) {
          ctx.globalAlpha = Math.max(0, p.life / 800);
          ctx.fillStyle = p.color;
          ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.text, p.x, p.y);
        } else {
          ctx.globalAlpha = Math.max(0, p.life / 400);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      ctx.restore();
    },

    roundRectPath(ctx, x, y, w, h, r) {
      const rx = Math.min(r, w/2), ry = Math.min(r, h/2);
      ctx.beginPath();
      ctx.moveTo(x + rx, y);
      ctx.lineTo(x + w - rx, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + ry);
      ctx.lineTo(x + w, y + h - ry);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rx, y + h);
      ctx.lineTo(x + rx, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - ry);
      ctx.lineTo(x, y + ry);
      ctx.quadraticCurveTo(x, y, x + rx, y);
      ctx.closePath();
    },

    planeSpawnWave() {
      const st = this.planeState;
      const cfg = this.PLANE_CONFIG[this.diff];
      if (!st.target) this.setPlaneTarget();
      const target = st.target;
      const targetIsEn = st.targetIsEnglish;

      const count = cfg.enemyCount; // 4 or 5
      const distractorCount = count - 1;
      const distractors = this.shuffle(st.words.filter(w => w.id !== target.id)).slice(0, distractorCount);
      const wave = [];

      wave.push({
        word: target,
        text: targetIsEn ? this.getPrimaryMeaning(target.meaning) : (target.word || ''),
        isCorrect: true,
        isEnglish: !targetIsEn
      });

      for (const w of distractors) {
        const showEn = Math.random() < 0.5;
        wave.push({
          word: w,
          text: showEn ? (w.word || '') : this.getPrimaryMeaning(w.meaning),
          isCorrect: false,
          isEnglish: showEn
        });
      }

      const margin = 80;
      const usableW = Math.max(100, st.width - margin * 2);
      const correctIdx = wave.findIndex(w => w.isCorrect);
      const positions = [];
      for (let i = 0; i < wave.length; i++) {
        if (i === correctIdx) continue;
        positions.push(margin + (usableW / (wave.length + 1)) * (i + 1));
      }
      this.shuffle(positions);

      // 正确答案刻意远离飞机，强制放在对侧
      const planeX = st.plane.x;
      const correctX = planeX < st.width / 2
        ? margin + usableW * (0.65 + Math.random() * 0.25)
        : margin + usableW * (0.10 + Math.random() * 0.25);

      for (let i = 0; i < wave.length; i++) {
        const item = wave[i];
        const x = item.isCorrect ? correctX : positions.pop();
        st.enemies.push({
          x: x,
          y: -60,
          radius: 24,
          speed: cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin),
          text: item.text,
          isCorrect: item.isCorrect,
          wordId: item.word.id,
          fontSize: item.text.length > 8 ? 17 : 19,
          hp: cfg.enemyHp,
          maxHp: cfg.enemyHp,
          flash: 0
        });
      }
    },

    playPopSound(pitch = 'normal') {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!this._audioCtx) this._audioCtx = new AudioContext();
        const ctx = this._audioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const baseFreq = pitch === 'high' ? 750 : (pitch === 'low' ? 350 : 600);
        osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.3, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } catch (e) {}
    },

    planeDestroyEnemy(enemy) {
      const st = this.planeState;
      this.playPopSound(enemy.isCorrect ? 'high' : 'low');
      // Particles
      for (let i = 0; i < 14; i++) {
        st.particles.push({
          x: enemy.x, y: enemy.y,
          vx: (Math.random() - 0.5) * 7,
          vy: (Math.random() - 0.5) * 7,
          life: 350 + Math.random() * 250,
          size: 2 + Math.random() * 3,
          color: enemy.isCorrect ? '#4ade80' : '#f87171'
        });
      }
      // Score
      if (enemy.isCorrect) {
        st.combo++;
        const pts = 10 + Math.min(20, st.combo * 2);
        st.score += pts;
        st.correctHits++;
        st.targetHitsCurrent++;
        // Time reward for correct hit
        this.planeElapsed = Math.max(0, this.planeElapsed - 3);
        if (st.targetHitsCurrent >= st.targetHitsRequired) {
          this.setPlaneTarget();
        } else {
          this.updateTargetProgressUI();
        }
        st.combo = Math.min(st.combo, 10);
      } else {
        st.combo = 0;
        st.score = Math.max(0, st.score - 5);
      }
      const scoreEl = document.getElementById('wg-score-display');
      if (scoreEl) scoreEl.textContent = '得分: ' + st.score;
      // Drop item only for correct enemy
      if (enemy.isCorrect && Math.random() < 0.35) {
        const types = [
          { type: 'heart', color: '#ef4444', emoji: '❤️' },
          { type: 'clock', color: '#f59e0b', emoji: '⏰' },
          { type: 'freeze', color: '#38bdf8', emoji: '⏸️' }
        ];
        const it = types[Math.floor(Math.random() * types.length)];
        st.items.push({
          x: enemy.x, y: enemy.y,
          radius: 18, speed: 2.8,
          ...it
        });
      }
    },

    endPlaneGame(reason) {
      if (!this.planeState) return;
      this.planeState.gameOver = true;
      if (this.planeLoopId) { cancelAnimationFrame(this.planeLoopId); this.planeLoopId = null; }
      this.clearPlaneTimer();
      this.page = 'result';
      const st = this.planeState;
      this.$nextTick(() => {
        const emoji = document.getElementById('wg-result-emoji');
        const title = document.getElementById('wg-result-title');
        const sub = document.getElementById('wg-result-subtitle');
        if (emoji) emoji.textContent = reason === 'timeout' ? '⏰' : (reason === 'hp' ? '💔' : '🏆');
        if (title) title.textContent = reason === 'timeout' ? '时间到！' : (reason === 'hp' ? '生命值耗尽！' : '游戏结束！');
        if (sub) sub.textContent = '你击中了 ' + st.correctHits + ' 个目标，得分 ' + st.score;
        this.setStat('wg-stat-score', st.score);
        this.setStat('wg-stat-time', Math.ceil(this.planeElapsed) + '秒');
        this.setStat('wg-stat-correct', st.correctHits + '个');
      });
    },

    rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
      return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
    },
  }));
});

function timestampNow() { return performance.now(); }
