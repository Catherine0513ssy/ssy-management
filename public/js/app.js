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
      { id: 'choicefill', label: '选词填空', icon: '\u{1F4D6}' },
      { id: 'quiz',       label: '默写',    icon: '\u{1F3AF}' },
      { id: 'wordgame',   label: '英语游戏', icon: '\u{1F36C}' },
      { id: 'essay',      label: '作文',    icon: '✍️' },
    ],
    isAdmin: false,
    sidebarOpen: false,
    toasts: [],
    currentDate: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '-'),
    loginModalOpen: false,
    loginPassword: '',
    showLoginPassword: false,

    // Init
    async init() {
      const auth = await API.checkAuth().catch(() => ({ loggedIn: false }));
      this.isAdmin = auth.loggedIn;
      window.addEventListener('ssy:logout', () => { this.isAdmin = false; });
      document.body.dataset.activeTab = this.activeTab;
      window.dispatchEvent(new CustomEvent('ssy:tab-change', { detail: { tabId: this.activeTab, initial: true } }));
    },

    // Tab switching
    switchTab(tabId) {
      if (window.Alpine?.store('homeworkPresentation')?.active) {
        window.Alpine.store('homeworkPresentation').reset();
      }
      // 如果正在默写中，切换 tab 前确认
      if (this.activeTab === 'quiz' && tabId !== 'quiz' && window._ssyQuizActive) {
        if (!confirm('默写正在进行中，确定要离开吗？')) return;
        window.dispatchEvent(new Event('ssy:quiz-stop'));
      }
      this.activeTab = tabId;
      document.body.dataset.activeTab = tabId;
      window.dispatchEvent(new CustomEvent('ssy:tab-change', { detail: { tabId } }));
      this.sidebarOpen = false;
    },

    // Auth
    login() {
      console.log('login button clicked');
      this.loginPassword = '';
      this.showLoginPassword = false;
      this.loginModalOpen = true;
      this.$nextTick(() => {
        const el = document.getElementById('loginPasswordInput');
        if (el) el.focus();
      });
    },
    closeLoginModal() {
      this.loginModalOpen = false;
      this.loginPassword = '';
      this.showLoginPassword = false;
    },
    async submitLogin() {
      const pw = this.loginPassword;
      if (!pw) return;
      try {
        const { token } = await API.login(pw);
        API.token = token;
        this.isAdmin = true;
        this.loginModalOpen = false;
        this.loginPassword = '';
        this.toast('登录成功', 'success');
      } catch (e) {
        this.toast(e.message, 'error');
        this.loginPassword = '';
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
      const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '-');
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '-');
      if (dateStr === today) return '今天';
      if (dateStr === yesterday) return '昨天';
      const [, m, d] = dateStr.split('-');
      return `${parseInt(m)}月${parseInt(d)}日`;
    },
  }));
});
