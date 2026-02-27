const { safeNavigate } = require('../utils/uiHelper');
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
      const pages = getCurrentPages();
      const current = pages && pages.length ? pages[pages.length - 1] : null;
      const currentRoute = current && current.route ? `/${current.route}` : '';

      // 已在当前页：只同步选中态，不导航
      if (currentRoute === item.pagePath) {
        this.setData({ selected: idx });
        return;
      }

      // 不提前改 selected：让目标页 onShow 里的 setTabSelected 来更新，
      // 避免导航被锁（连续快速点击）时 selected 停在错误 Tab 造成"乱跳"。
      safeNavigate({ url: item.pagePath }, 'switchTab').catch(() => {
        // 导航失败（通常是重复点击被锁）：不改 selected，保持现有状态
      });
    },
  },
});
