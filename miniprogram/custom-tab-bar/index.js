Component({
  data: {
    selected: 0,
    color: '#999999',
    selectedColor: '#3b82f6',
    list: [
      {
        pagePath: '/pages/home/index',
        text: '首页',
        iconPath: '/assets/tabbar/home.png',
        selectedIconPath: '/assets/tabbar/home-active.png',
      },
      {
        pagePath: '/pages/work/index',
        text: '生产',
        iconPath: '/assets/tabbar/work.png',
        selectedIconPath: '/assets/tabbar/work-active.png',
      },
      {
        pagePath: '/pages/scan/index',
        text: '扫码',
        iconPath: '/assets/tabbar/scan.png',
        selectedIconPath: '/assets/tabbar/scan-active.png',
      },
      {
        pagePath: '/pages/admin/index',
        text: '我的',
        iconPath: '/assets/tabbar/admin.png',
        selectedIconPath: '/assets/tabbar/admin-active.png',
      },
    ],
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url: url });
    },
  },
});
