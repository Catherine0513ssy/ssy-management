document.addEventListener('alpine:init', () => {
  Alpine.data('rankingTab', () => ({
    rankings: [],
    loading: false,
    selectedStudent: null,
    details: [],
    detailLoading: false,
    loaded: false,
    period: 'current',
    periods: { 1: { start: '3.23', end: '4.3', name: '第1周期', status: 'ended' }, 2: { start: '4.6', end: '4.17', name: '第2周期', status: 'active' } },
    async init() { const ensureLoaded = async () => { if (this.loaded) return; this.loaded = true; await this.load(); }; window.addEventListener('ssy:tab-change', async (e) => { if (e.detail?.tabId === 'ranking') await ensureLoaded(); }); if (document.body.dataset.activeTab === 'ranking') await ensureLoaded(); },
    async load() { this.loading = true; try { const data = await API.getRanking(this.period); this.rankings = data.rankings || []; } catch (e) { this.rankings = []; } this.loading = false; },
    async loadRanking(period) { this.period = period; await this.load(); },
    get periodInfo() { if (this.period === 'all') return '📊 显示所有历史累计积分'; const pid = this.period === 'current' ? '2' : this.period; const p = this.periods[pid]; if (!p) return ''; return `${p.name} (${p.start}-${p.end}) - ${p.status === 'ended' ? '已结束' : '进行中'}`; },
    get groupedRankings() {
      const map = new Map();
      for (const s of this.rankings) {
        const gi = s.groupIndex || 1;
        if (!map.has(gi)) {
          map.set(gi, { groupIndex: gi, groupName: s.group || ('第' + gi + '组'), rankings: [] });
        }
        map.get(gi).rankings.push(s);
      }
      const groups = Array.from(map.values()).sort((a, b) => a.groupIndex - b.groupIndex);

      for (const g of groups) {
        // 按分数降序，同分按姓名排序
        g.rankings.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh'));

        // 计算并列名次（紧凑排名法：相同分数相同名次，下一名次不顺延）
        // 例如：100分(第1名), 90分(第2名), 90分(第2名), 80分(第3名)
        let currentRank = 1;
        for (let i = 0; i < g.rankings.length; i++) {
          if (i === 0) {
            g.rankings[i].rank = 1;
          } else {
            if (g.rankings[i].points !== g.rankings[i-1].points) {
              currentRank++;
            }
            g.rankings[i].rank = currentRank;
          }
        }

        // 排名已计算好，每组独立排名
        // g.rankings 中每个人的 rank 属性已设置正确

        g.maxPoints = g.rankings.length > 0 ? g.rankings[0].points : 0;

        // 获取前3个不同的分数（用于显示前三名）
        const uniquePoints = [...new Set(g.rankings.map(r => r.points))].sort((a, b) => b - a);
        g.top3Points = uniquePoints.slice(0, 3);
      }
      return groups;
    },
    getMedal(rank) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank; },
    isTopThree(rank) { return rank >= 1 && rank <= 3; },
    getRankClass(rank) { return rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : ''; },
    async showDetail(student) { if (this.selectedStudent?.name === student.name) { this.selectedStudent = null; this.details = []; return; } this.selectedStudent = student; this.detailLoading = true; try { const idx = this.rankings.indexOf(student); const data = await API.getRankingDetail(idx >= 0 ? idx : undefined); this.details = data.details || []; } catch (e) { this.details = []; } this.detailLoading = false; },
    closeDetail() { this.selectedStudent = null; this.details = []; },
    getTypeLabel(type) { return type === 'word' ? '单词' : type === 'essay' ? '课文' : type; },
    getRoundLabel(round) { return round === 1 ? '第一轮 (+2分)' : round === 2 ? '第二轮 (+1分)' : '第' + round + '轮'; },
    formatDate(dateStr) { if (!dateStr) return ''; const [, m, d] = dateStr.split('-'); return parseInt(m) + '月' + parseInt(d) + '日'; },
    get totalStudents() { return this.rankings.length; },
    getBarWidth(points, maxPoints) { const max = maxPoints || 0; return max === 0 ? '0%' : Math.round((points / max) * 100) + '%'; },
  }));
});
