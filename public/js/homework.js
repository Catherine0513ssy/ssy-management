/**
 * SSY Homework Tab — Alpine.js component
 *
 * Manages:
 *   - Loading homework items for a selected date
 *   - Date list sidebar with search/filter
 *   - Calendar view with month navigation and data indicators
 *   - Add homework form (admin only) with image upload
 *   - Delete homework item (admin only)
 *
 * Depends on: Alpine.js, global API object (api.js)
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('homeworkTab', () => ({
    items: [],
    previewImage: null,
    allDates: [],
    filteredDates: [],
    selectedDate: new Date().toISOString().split('T')[0],
    searchText: '',
    newText: '',
    newImage: null,
    imagePreview: null,
    loading: false,

    // Calendar state
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    calendarDays: [],
    datesWithData: new Set(),

    async init() {
      await this.loadDates();
      await this.loadHomework();
      this.buildCalendar();
    },

    // ------------------------------------------------------------------
    // Data loading
    // ------------------------------------------------------------------

    async loadDates() {
      try {
        const { dates } = await API.getHomeworkDates();
        // dates = [{ date: 'YYYY-MM-DD', count: N }, ...]
        this.allDates = dates;
        this.datesWithData = new Set(dates.map(d => d.date));
        this.filterDates();
      } catch (e) { console.error('loadDates:', e); }
    },

    async loadHomework() {
      this.loading = true;
      try {
        const data = await API.getHomework(this.selectedDate);
        this.items = data.items || [];
      } catch (e) { console.error('loadHomework:', e); }
      this.loading = false;
    },

    async selectDate(date) {
      this.selectedDate = date;
      await this.loadHomework();
      this.buildCalendar();          // refresh selection highlight
    },

    // ------------------------------------------------------------------
    // Sidebar date filter
    // ------------------------------------------------------------------

    filterDates() {
      if (!this.searchText) {
        this.filteredDates = this.allDates;
        return;
      }
      const q = this.searchText.toLowerCase();
      this.filteredDates = this.allDates.filter(d => d.date.includes(q));
    },

    // ------------------------------------------------------------------
    // Calendar
    // ------------------------------------------------------------------

    buildCalendar() {
      const year = this.calendarYear;
      const month = this.calendarMonth;       // 0-indexed
      const firstDayOfWeek = new Date(year, month, 1).getDay();  // 0=Sun
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = new Date().toISOString().split('T')[0];

      this.calendarDays = [];

      // Previous month fill
      const prevMonthDays = new Date(year, month, 0).getDate();
      const prevMonth = month === 0 ? 12 : month;          // 1-indexed for string
      const prevYear  = month === 0 ? year - 1 : year;
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        const date = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        this.calendarDays.push({
          day: d, date, isCurrentMonth: false,
          isToday: false, isSelected: false,
          hasData: this.datesWithData.has(date),
        });
      }

      // Current month
      const mm = String(month + 1).padStart(2, '0');
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${mm}-${String(d).padStart(2, '0')}`;
        this.calendarDays.push({
          day: d, date, isCurrentMonth: true,
          isToday: date === today,
          isSelected: date === this.selectedDate,
          hasData: this.datesWithData.has(date),
        });
      }

      // Next month fill (pad to 42 cells = 6 weeks)
      const nextMonth = month === 11 ? 1 : month + 2;      // 1-indexed
      const nextYear  = month === 11 ? year + 1 : year;
      const remaining = 42 - this.calendarDays.length;
      for (let d = 1; d <= remaining; d++) {
        const date = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        this.calendarDays.push({
          day: d, date, isCurrentMonth: false,
          isToday: false, isSelected: false,
          hasData: this.datesWithData.has(date),
        });
      }
    },

    prevMonth() {
      if (this.calendarMonth === 0) { this.calendarMonth = 11; this.calendarYear--; }
      else this.calendarMonth--;
      this.buildCalendar();
    },

    nextMonth() {
      if (this.calendarMonth === 11) { this.calendarMonth = 0; this.calendarYear++; }
      else this.calendarMonth++;
      this.buildCalendar();
    },

    get calendarTitle() {
      return `${this.calendarYear}年${this.calendarMonth + 1}月`;
    },

    // ------------------------------------------------------------------
    // Image upload
    // ------------------------------------------------------------------

    onImageSelect(e) {
      const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        this.$dispatch('toast', { message: '图片不能超过5MB', type: 'error' });
        return;
      }
      this.newImage = file;
      const reader = new FileReader();
      reader.onload = (ev) => { this.imagePreview = ev.target.result; };
      reader.readAsDataURL(file);
    },

    clearImage() {
      this.newImage = null;
      this.imagePreview = null;
    },

    // ------------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------------

    async addHomework() {
      if (!this.newText.trim()) return;
      try {
        await API.addHomework(this.selectedDate, this.newText.trim(), this.newImage);
        this.newText = '';
        this.clearImage();
        await this.loadHomework();
        await this.loadDates();
        this.buildCalendar();
        this.$dispatch('toast', { message: '作业已添加', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    async deleteHomework(id) {
      if (!confirm('确定删除这条作业？')) return;
      try {
        await API.deleteHomework(id);
        await this.loadHomework();
        await this.loadDates();
        this.buildCalendar();
        this.$dispatch('toast', { message: '已删除', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },
  }));
});
