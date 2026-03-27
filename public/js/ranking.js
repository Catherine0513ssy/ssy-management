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

    async init() {
      await this.load();
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

    getMedal(rank) {
      if (rank === 1) return '\u{1F947}';
      if (rank === 2) return '\u{1F948}';
      if (rank === 3) return '\u{1F949}';
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
        // Find the student's index from the rankings array position
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

    get maxPoints() {
      return this.rankings.length > 0 ? this.rankings[0].points : 0;
    },

    getBarWidth(points) {
      if (this.maxPoints === 0) return '0%';
      return Math.round((points / this.maxPoints) * 100) + '%';
    },
  }));
});
