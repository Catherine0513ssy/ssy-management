/**
 * SSY Student Ranking Display
 * Alpine.js component: ranked list with medals, group info, score detail drill-down
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('rankingTab', () => ({
    rankings: [],
    loading: false,
    selectedStudent: null,
    details: [],
    detailLoading: false,
    loaded: false,

    async init() {
      const ensureLoaded = async () => {
        if (this.loaded) return;
        this.loaded = true;
        await this.load();
      };
      window.addEventListener('ssy:tab-change', async (event) => {
        if (event.detail?.tabId === 'ranking') {
          await ensureLoaded();
        }
      });
      if (document.body.dataset.activeTab === 'ranking') {
        await ensureLoaded();
      }
    },

    async load() {
      this.loading = true;
      try {
        const data = await API.getRanking();
        this.rankings = data.rankings || [];
      } catch (e) {
        this.rankings = [];
      }
      this.loading = false;
    },

    get groupedRankings() {
      const map = new Map();
      for (const s of this.rankings) {
        const gi = s.groupIndex || 1;
        if (!map.has(gi)) {
          map.set(gi, {
            groupIndex: gi,
            groupName: s.group || ('第' + gi + '组'),
            rankings: [],
          });
        }
        map.get(gi).rankings.push(s);
      }
      const groups = Array.from(map.values()).sort((a, b) => a.groupIndex - b.groupIndex);
      for (const g of groups) {
        g.rankings.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh'));
        let currentRank = 1;
        for (let i = 0; i < g.rankings.length; i++) {
          if (i > 0 && g.rankings[i].points < g.rankings[i - 1].points) {
            currentRank++;
          }
          g.rankings[i].rank = currentRank;
        }
        g.maxPoints = g.rankings.length > 0 ? g.rankings[0].points : 0;
      }
      return groups;
    },

    getMedal(rank) {
      if (rank === 1) return '🥇';
      if (rank === 2) return '🥈';
      if (rank === 3) return '🥉';
      return '#' + rank;
    },

    isTopThree(rank) {
      return rank >= 1 && rank <= 3;
    },

    getRankClass(rank) {
      if (rank === 1) return 'rank-gold';
      if (rank === 2) return 'rank-silver';
      if (rank === 3) return 'rank-bronze';
      return '';
    },

    async showDetail(student) {
      if (this.selectedStudent && this.selectedStudent.name === student.name) {
        this.selectedStudent = null;
        this.details = [];
        return;
      }
      this.selectedStudent = student;
      this.detailLoading = true;
      try {
        const idx = this.rankings.indexOf(student);
        const data = await API.getRankingDetail(idx >= 0 ? idx : undefined);
        this.details = data.details || [];
      } catch (e) {
        this.details = [];
      }
      this.detailLoading = false;
    },

    closeDetail() {
      this.selectedStudent = null;
      this.details = [];
    },

    getTypeLabel(type) {
      return type === 'word' ? '单词' : type === 'essay' ? '课文' : type;
    },

    getRoundLabel(round) {
      return round === 1 ? '第一轮 (+2分)' : round === 2 ? '第二轮 (+1分)' : '第' + round + '轮';
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const [, m, d] = dateStr.split('-');
      return parseInt(m) + '月' + parseInt(d) + '日';
    },

    get totalStudents() {
      return this.rankings.length;
    },

    getBarWidth(points, maxPoints) {
      const max = maxPoints !== undefined ? maxPoints : 0;
      if (max === 0) return '0%';
      return Math.round((points / max) * 100) + '%';
    },
  }));
});
