const i18n = require('../utils/i18n/index');

function buildTabList(language) {
  return [
    { pagePath: '/pages/home/index', text: i18n.t('tabbar.home', language) },
    { pagePath: '/pages/work/index', text: i18n.t('tabbar.work', language) },
    { pagePath: '/pages/scan/index', text: i18n.t('tabbar.scan', language) },
    { pagePath: '/pages/admin/index', text: i18n.t('tabbar.admin', language) },
  ];
}

Component({
  options: {
    styleIsolation: 'apply-shared', // 继承 page 级 CSS 变量（--color-primary 等）
  },
  lifetimes: {
    attached() {
      this.refreshLanguage(i18n.getLanguage());
    },
  },
  pageLifetimes: {
    show() {
      this.refreshLanguage(i18n.getLanguage());
    },
  },
  data: {
    selected: 0,
    list: buildTabList(i18n.getLanguage()),
  },

  // 防重复点击时间戳
  _lastTapTime: 0,

  methods: {
    refreshLanguage(language) {
      this.setData({ list: buildTabList(language) });
    },

    onTap(e) {
      const idx = Number(
        e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.index : -1
      );
      if (!Number.isFinite(idx) || idx < 0 || idx >= this.data.list.length) {
        return;
      }
      const item = this.data.list[idx];
      if (!item || !item.pagePath) {
        return;
      }

      // 300ms 内重复点击同一 tab 不再触发（防误触，不用全局锁）
      const now = Date.now();
      if (now - this._lastTapTime < 300) {
        return;
      }
      this._lastTapTime = now;

      const pages = getCurrentPages();
      const current = pages && pages.length ? pages[pages.length - 1] : null;
      const currentRoute = current && current.route ? `/${current.route}` : '';

      // 已在当前页：只同步选中态，不导航
      if (currentRoute === item.pagePath) {
        this.setData({ selected: idx });
        return;
      }

      // 立即更新选中态，给用户即时视觉反馈
      this.setData({ selected: idx });

      // 直接调用 wx.switchTab（不使用 safeNavigate 全局锁，避免被 app 内其他导航阻断）
      wx.switchTab({
        url: item.pagePath,
        fail: () => {
          // 导航失败：恢复到之前的选中态
          const prevPages = getCurrentPages();
          const prevPage = prevPages && prevPages.length ? prevPages[prevPages.length - 1] : null;
          const prevRoute = prevPage && prevPage.route ? `/${prevPage.route}` : '';
          const prevIdx = this.data.list.findIndex(t => t.pagePath === prevRoute);
          if (prevIdx >= 0) this.setData({ selected: prevIdx });
        },
      });
    },
  },
});
