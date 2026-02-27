const { safeNavigate } = require('../utils/uiHelper');

Component({
  options: {
    styleIsolation: 'apply-shared', // 继承 page 级 CSS 变量（--color-primary 等）
  },
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
