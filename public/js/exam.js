/**
 * Exam Analysis Tab
 * Student enters studentNum to see their score curve + class average
 * Admin sees real names; students see anonymous (studentNum only)
 * Weakness analysis computed from score trends
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('examTab', () => ({
    loading: false,
    exams: [],
    students: {},
    searchNum: '',
    currentStudent: null,
    chartInstance: null,
    weaknesses: [],
    stats: {},

    async init() {
      await this.loadData();
      this.$watch('searchNum', (val) => {
        if (val && val.length >= 5) this.searchStudent();
      });
    },

    async loadData() {
      this.loading = true;
      try {
        const res = await fetch('/data/exams.json');
        const data = await res.json();
        this.exams = data.exams || [];
        this.students = data.students || {};
      } catch (e) {
        console.error('Failed to load exam data:', e);
      }
      this.loading = false;
    },

    searchStudent() {
      const num = this.searchNum.trim();
      if (!num || !this.students[num]) {
        this.currentStudent = null;
        this.weaknesses = [];
        this.stats = {};
        if (this.chartInstance) {
          this.chartInstance.dispose();
          this.chartInstance = null;
        }
        return;
      }
      this.currentStudent = this.students[num];
      this.analyze();
      this.$nextTick(() => this.renderChart());
    },

    analyze() {
      const num = this.searchNum.trim();
      const student = this.students[num];
      if (!student) return;

      const scores = [];
      const ranks = [];
      const exams = [];

      for (const exam of this.exams) {
        const s = student.scores[exam.id];
        if (s && s.score != null && !(s.score === 0 && s.classRank == null)) {
          scores.push(s.score);
          if (s.classRank != null) ranks.push(s.classRank);
          exams.push({ name: exam.name, date: exam.date, score: s.score, rank: s.classRank, avg: exam.classAverage });
        }
      }

      if (scores.length === 0) return;

      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      const classAvgs = exams.map(e => e.avg);
      const avgDiff = avgScore - (classAvgs.reduce((a, b) => a + b, 0) / classAvgs.length);

      this.stats = {
        examCount: scores.length,
        avgScore: avgScore.toFixed(1),
        avgRank: ranks.length > 0 ? (ranks.reduce((a,b) => a+b, 0) / ranks.length).toFixed(0) : '-',
        bestScore: scores.length > 0 ? Math.max(...scores) : 0,
        worstScore: scores.length > 0 ? Math.min(...scores) : 0,
        bestRank: ranks.length > 0 ? Math.min(...ranks) : '-',
        worstRank: ranks.length > 0 ? Math.max(...ranks) : '-',
        avgDiff: avgDiff.toFixed(1),
      };

      const w = [];

      if (scores.length >= 3) {
        const recentScores = scores.slice(-3);
        const recentRanks = ranks.slice(-3);
        if (recentScores[0] > recentScores[1] && recentScores[1] > recentScores[2]) {
          w.push({ type: '下降', desc: '最近3次考试分数连续下降', level: 'high' });
        }
        if (recentRanks[0] < recentRanks[1] && recentRanks[1] < recentRanks[2]) {
          w.push({ type: '退步', desc: '最近3次考试班级排名连续退步', level: 'high' });
        }
      }

      if (scores.length >= 3) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
        const std = Math.sqrt(variance);
        if (std > 15) {
          w.push({ type: '波动', desc: `分数波动较大(标准差${std.toFixed(1)}分)`, level: 'medium' });
        }
      }

      if (avgDiff < -5) {
        w.push({ type: '落后', desc: `个人均分低于班级平均${Math.abs(avgDiff).toFixed(1)}分`, level: 'medium' });
      }

      const downstream = ranks.filter(r => r > this.exams[0].studentCount * 0.7).length;
      if (downstream >= 3) {
        w.push({ type: '下游', desc: `${downstream}次考试排名在班级后30%`, level: 'medium' });
      }

      for (let i = 1; i < exams.length; i++) {
        const rankDrop = exams[i].rank - exams[i-1].rank;
        if (rankDrop >= 10) {
          w.push({ type: '暴跌', desc: `${exams[i].name}班级排名暴跌${rankDrop}名`, level: 'high' });
          break;
        }
      }

      if (avgDiff > 5) {
        w.push({ type: '优势', desc: `个人均分高于班级平均${avgDiff.toFixed(1)}分`, level: 'good' });
      }
      const top3Count = ranks.filter(r => r <= 3).length;
      if (top3Count >= 2) {
        w.push({ type: '尖子', desc: `${top3Count}次考试进入班级前3名`, level: 'good' });
      }

      this.weaknesses = w;
    },

    renderChart() {
      const container = document.getElementById('examChart');
      if (!container || !this.currentStudent) return;

      if (this.chartInstance) {
        this.chartInstance.dispose();
      }

      const dates = [];
      const scores = [];
      const avgs = [];

      for (const exam of this.exams) {
        const s = this.currentStudent.scores[exam.id];
        if (s) {
          dates.push(exam.date.slice(5));
          scores.push(s.score);
          avgs.push(exam.classAverage);
        }
      }

      this.chartInstance = echarts.init(container);
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['个人分数', '班级平均分'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 10, interval: 0 } },
        yAxis: { type: 'value', name: '分数', min: 0, max: 100 },
        series: [
          {
            name: '个人分数',
            type: 'line',
            data: scores,
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 3, color: '#5470c6' },
            itemStyle: { color: '#5470c6' },
            areaStyle: { color: 'rgba(84,112,198,0.1)' },
            label: { show: true, position: 'top', formatter: '{c}', fontSize: 10, distance: 4 }
          },
          {
            name: '班级平均分',
            type: 'line',
            data: avgs,
            smooth: true,
            symbol: 'diamond',
            symbolSize: 6,
            lineStyle: { width: 2, type: 'dashed', color: '#91cc75' },
            itemStyle: { color: '#91cc75' }
          }
        ]
      };
      this.chartInstance.setOption(option);

      window.addEventListener('resize', () => this.chartInstance && this.chartInstance.resize());
    },

    getStudentDisplayName() {
      if (!this.currentStudent) return '';
      const appEl = document.querySelector('[x-data="app()"]');
      const isAdmin = appEl && appEl._x_dataStack && appEl._x_dataStack[0] && appEl._x_dataStack[0].isAdmin;
      if (isAdmin) return `${this.currentStudent.name} (${this.searchNum})`;
      return this.searchNum;
    },

    getWeaknessClass(level) {
      return {
        'high': 'weakness-high',
        'medium': 'weakness-medium',
        'good': 'weakness-good'
      }[level] || '';
    }
  }));
});
