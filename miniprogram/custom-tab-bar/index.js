const { safeNavigate } = require('../utils/uiHelper');

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index', text: '首页' },
      { pagePath: '/pages/work/index', text: '生产' },
      { pagePath: '/pages/scan/index', text: '扫码' },
      { pagePath: '/pages/admin/index', text: '我的' },
    ],
  },

  methods: {
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
      this.setData({ selected: idx });
      if (currentRoute === item.pagePath) {
        return;
      }
      // 使用安全导航防止快速点击导致路由错误
      safeNavigate({ url: item.pagePath }, 'switchTab').catch(() => {
        // 导航失败忽略（通常是重复点击）
      });
    },
  },
});
