document.addEventListener('alpine:init', () => {
  Alpine.data('choicefillTab', () => ({
    today: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
    currentDate: null,
    question: null,
    loading: true,
    error: null,
    showAnswers: false,
    allDates: [],
    hasPrev: false,
    hasNext: false,

    async init() {
      await this.loadDates();
      await this.loadQuestion();
    },

    async loadDates() {
      try {
        const res = await fetch('/api/choice-fill/dates');
        const data = await res.json();
        if (res.ok) {
          this.allDates = data.dates || [];
        }
      } catch (e) {
        console.error('加载日期列表失败', e);
      }
    },

    async loadQuestion(date) {
      this.loading = true;
      this.error = null;
      this.showAnswers = false;

      try {
        const url = date ? `/api/choice-fill/daily?date=${date}` : '/api/choice-fill/daily';
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok) {
          this.question = data;
          this.currentDate = data.scheduled_date;
          this.hasPrev = !!data.prev_date;
          this.hasNext = !!data.next_date;

          if (data.explanations) {
            this.question.explanationMap = this.parseExplanations(data.explanations);
          }
        } else if (data.error === 'NO_QUESTION_AVAILABLE') {
          this.error = data.message || '没有找到选词填空题目';
        } else {
          this.error = data.error || '加载失败';
        }
      } catch (e) {
        this.error = '网络错误，请稍后重试';
        console.error('加载题目失败:', e);
      } finally {
        this.loading = false;
      }
    },

    async loadPrev() {
      if (this.question?.prev_date) {
        await this.loadQuestion(this.question.prev_date);
      }
    },

    async loadNext() {
      if (this.question?.next_date) {
        await this.loadQuestion(this.question.next_date);
      }
    },

    async onDateSelect(event) {
      const selectedDate = event.target.value;
      if (selectedDate) {
        await this.loadQuestion(selectedDate);
      }
    },

    formatPassage(passage) {
      if (!passage) return '';
      return passage.replace(/(\d+)\.?\s*____/g, '<span class="choicefill-blank">$1</span>');
    },

    parseExplanations(exps) {
      const map = {};
      if (!exps) return map;
      
      const newFormatRegex = /(\d+)\.\s*([^\d]+?)(?=\s*\d+\.\s|$)/g;
      let match;
      let found = false;
      
      while ((match = newFormatRegex.exec(exps)) !== null) {
        map[match[1]] = match[2].trim();
        found = true;
      }
      
      if (!found && exps.includes('|')) {
        exps.split('|').forEach(item => {
          const parts = item.split(':');
          if (parts.length >= 2) {
            map[parts[0]] = parts.slice(1).join(':');
          }
        });
      }
      
      return map;
    },

    getExplanation(num) {
      if (this.question?.explanationMap && this.question.explanationMap[num]) {
        return this.question.explanationMap[num];
      }
      return '';
    }
  }));
});
