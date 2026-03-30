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
    styleIsolation: 'apply-shared',
  },
  lifetimes: {
    attached() {
      const lang = i18n.getLanguage();
      const currentText = this.data.list && this.data.list[0] && this.data.list[0].text;
      const expectedText = i18n.t('tabbar.home', lang);
      if (currentText !== expectedText) {
        setTimeout(() => { this.refreshLanguage(lang); }, 0);
      }
    },
  },
  pageLifetimes: {
    show() {
      this.refreshLanguage(i18n.getLanguage());
      this.syncSelected();
    },
  },
  data: {
    selected: 0,
    list: buildTabList(i18n.getLanguage()),
  },

  _lastTapTime: 0,
  _navigating: false,

  methods: {
    syncSelected() {
      if (this._navigating) return;
      
      try {
        const pages = getCurrentPages();
        const curPage = pages && pages.length ? pages[pages.length - 1] : null;
        const curRoute = curPage && curPage.route ? `/${curPage.route}` : '';
        const idx = this.data.list.findIndex(t => t.pagePath === curRoute);
        
        if (idx >= 0 && this.data.selected !== idx) {
          this.setData({ selected: idx });
        }
      } catch (e) { /* 容错 */ }
    },

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

      const now = Date.now();
      if (now - this._lastTapTime < 500) {
        return;
      }
      this._lastTapTime = now;

      const pages = getCurrentPages();
      const current = pages && pages.length ? pages[pages.length - 1] : null;
      const currentRoute = current && current.route ? `/${current.route}` : '';

      if (currentRoute === item.pagePath) {
        this.setData({ selected: idx });
        return;
      }

      this.setData({ selected: idx });
      this._navigating = true;

      wx.switchTab({
        url: item.pagePath,
        complete: () => {
          setTimeout(() => {
            this._navigating = false;
            this.syncSelected();
          }, 100);
        },
      });
    },
  },
});
