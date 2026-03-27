/**
 * SSY Main Application Controller
 * Alpine.js app store: tabs, sidebar, auth, class switching, toasts
 * Usage: <body x-data="app()">
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    // State
    activeTab: 'homework',
    tabs: [
      { id: 'homework', label: '作业列表', icon: '\u{1F4DD}' },
      { id: 'excellent', label: '优秀作业', icon: '\u2B50' },
      { id: 'checkin',   label: '打卡',     icon: '\u2705' },
      { id: 'ranking',   label: '排名',     icon: '\u{1F3C6}' },
      { id: 'vocabulary', label: '词汇',    icon: '\u{1F4D6}' },
      { id: 'quiz',       label: '默写',    icon: '\u{1F3AF}' },
      { id: 'essay',      label: '作文',    icon: '✍️' },
    ],
    isAdmin: false,
    sidebarOpen: false,
    toasts: [],
    currentDate: new Date().toISOString().split('T')[0],

    // Init
    async init() {
      const auth = await API.checkAuth().catch(() => ({ loggedIn: false }));
      this.isAdmin = auth.loggedIn;
      window.addEventListener('ssy:logout', () => { this.isAdmin = false; });
    },

    // Tab switching
    switchTab(tabId) {
      // 如果正在默写中，切换 tab 前确认
      if (this.activeTab === 'quiz' && tabId !== 'quiz' && window._ssyQuizActive) {
        if (!confirm('默写正在进行中，确定要离开吗？')) return;
        window.dispatchEvent(new Event('ssy:quiz-stop'));
      }
      this.activeTab = tabId;
      this.sidebarOpen = false;
    },

    // Auth
    async login() {
      const pw = prompt('请输入管理密码:');
      if (!pw) return;
      try {
        const { token } = await API.login(pw);
        API.token = token;
        this.isAdmin = true;
        this.toast('登录成功', 'success');
      } catch (e) {
        this.toast(e.message, 'error');
      }
    },
    async logout() {
      await API.logout().catch(() => {});
      API.token = null;
      this.isAdmin = false;
      this.toast('已退出登录', 'info');
    },

    // Class switching
    switchClass(id) {
      API.classId = id;
      location.reload();
    },
    get className() {
      return API.classId === '1' ? '2313班' : '2314班';
    },

    // Toast notifications
    toast(message, type = 'info') {
      const id = Date.now();
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 4000);
    },

    // Sidebar
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },

    // Date helpers
    formatDate(dateStr) {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (dateStr === today) return '今天';
      if (dateStr === yesterday) return '昨天';
      const [, m, d] = dateStr.split('-');
      return `${parseInt(m)}月${parseInt(d)}日`;
    },
  }));
});
