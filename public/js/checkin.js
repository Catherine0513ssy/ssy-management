/**
 * SSY Checkin Tab — Alpine.js component
 *
 * Manages word dictation and essay check-in tracking.
 *
 *   - Two modes: 'word' (听写) and 'essay' (作文)
 *   - Two rounds per mode (round 1 = 2pts, round 2 = 1pt)
 *   - Students displayed by group; toggle pass/fail per student
 *   - Date picker, save, and unsaved-changes guard
 *
 * Depends on: Alpine.js, global API object (api.js)
 *
 * Student list strategy:
 *   Calls getMissing with a sentinel date ('1970-01-01') where no session
 *   exists. The server returns ALL students as "missing", keyed by
 *   group_sort_order, in sort_order sequence — giving us the exact
 *   index-to-name mapping the checkin system uses.
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('checkinTab', () => ({
    mode: 'word',               // 'word' | 'essay'
    round: 1,                   // 1 | 2
    selectedDate: new Date().toISOString().split('T')[0],
    dates: [],                  // dates with existing sessions
    students: {},               // { '1': ['name0', 'name1', ...], '2': [...] }
    passed: {},                 // { '1': [idx, ...], '2': [idx, ...] }
    loading: false,
    saving: false,
    modified: false,

    async init() {
      await this.loadStudents();
      await this.loadDates();
      await this.loadCheckin();
    },

    // ------------------------------------------------------------------
    // Load the canonical student roster via the missing endpoint trick.
    // A date with no session means every student is "missing".
    // ------------------------------------------------------------------
    async loadStudents() {
      try {
        const { missing } = await API.getMissing('1970-01-01', this.mode, this.round);
        this.students = missing || {};
      } catch (e) { console.error('loadStudents:', e); }
    },

    // ------------------------------------------------------------------
    // Load dates that already have check-in sessions
    // ------------------------------------------------------------------
    async loadDates() {
      try {
        const { dates } = await API.getCheckinDates(this.mode, this.round);
        this.dates = dates || [];
      } catch (e) { console.error('loadDates:', e); }
    },

    // ------------------------------------------------------------------
    // Load check-in state for the currently selected date/mode/round
    // ------------------------------------------------------------------
    async loadCheckin() {
      this.loading = true;
      try {
        const data = await API.getCheckin(this.selectedDate, this.mode, this.round);
        this.passed = data.passed || {};
        this.modified = false;
      } catch (e) { console.error('loadCheckin:', e); }
      this.loading = false;
    },

    // ------------------------------------------------------------------
    // Toggle a student's pass state
    //   groupKey: '1' or '2' (group_sort_order as string)
    //   idx:      student's sort_order index within the group
    // ------------------------------------------------------------------
    toggleStudent(groupKey, idx) {
      const key = String(groupKey);
      const arr = [...(this.passed[key] || [])];
      const pos = arr.indexOf(idx);
      if (pos >= 0) arr.splice(pos, 1);
      else arr.push(idx);
      this.passed = { ...this.passed, [key]: arr };
      this.modified = true;
    },

    isStudentPassed(groupKey, idx) {
      return (this.passed[String(groupKey)] || []).includes(idx);
    },

    // ------------------------------------------------------------------
    // Persist
    // ------------------------------------------------------------------
    async save() {
      this.saving = true;
      try {
        await API.saveCheckin(this.selectedDate, this.mode, this.round, this.passed);
        this.modified = false;
        this.$dispatch('toast', { message: '保存成功', type: 'success' });
        // Refresh dates list in case a new session was created
        await this.loadDates();
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
      this.saving = false;
    },

    // ------------------------------------------------------------------
    // Mode / Round / Date switching (with unsaved-changes guard)
    // ------------------------------------------------------------------
    async _guardAndReload() {
      if (this.modified && !confirm('有未保存的修改，确定切换？')) return false;
      await this.loadDates();
      await this.loadCheckin();
      return true;
    },

    async setMode(mode) {
      if (mode === this.mode) return;
      const prev = this.mode;
      this.mode = mode;
      if (!(await this._guardAndReload())) { this.mode = prev; }
    },

    async setRound(round) {
      if (round === this.round) return;
      const prev = this.round;
      this.round = round;
      if (!(await this._guardAndReload())) { this.round = prev; }
    },

    async setDate(date) {
      if (date === this.selectedDate) return;
      const prev = this.selectedDate;
      this.selectedDate = date;
      if (!(await this._guardAndReload())) { this.selectedDate = prev; }
    },

    // ------------------------------------------------------------------
    // Computed helpers
    // ------------------------------------------------------------------
    get groupKeys() {
      return Object.keys(this.students).sort();
    },

    groupLabel(key) {
      return key === '1' ? '第一组' : key === '2' ? '第二组' : `第${key}组`;
    },

    get passedCount() {
      return Object.values(this.passed).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    },

    get totalStudents() {
      return Object.values(this.students).reduce((sum, arr) => sum + arr.length, 0);
    },

    get passRate() {
      const total = this.totalStudents;
      if (!total) return '0%';
      return Math.round((this.passedCount / total) * 100) + '%';
    },

    // Quick action: mark all students in a group as passed
    passAllInGroup(groupKey) {
      const key = String(groupKey);
      const names = this.students[key] || [];
      this.passed = { ...this.passed, [key]: names.map((_, i) => i) };
      this.modified = true;
    },

    // Quick action: clear all passes in a group
    clearGroup(groupKey) {
      this.passed = { ...this.passed, [String(groupKey)]: [] };
      this.modified = true;
    },
  }));
});
