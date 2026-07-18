Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: {
      type: String,
      value: '',
    },
    showSearch: {
      type: Boolean,
      value: false,
    },
    searchPlaceholder: {
      type: String,
      value: '搜索订单号/款号',
    },
    searchKeyword: {
      type: String,
      value: '',
    },
    showBack: {
      type: Boolean,
      value: false,
    },
    interceptBack: {
      type: Boolean,
      value: false,
    },
    bgColor: {
      type: String,
      value: '#007aff', /* @design-system: 统一蓝色导航栏，调用方可覆盖 */
    },
  },
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
  },
  lifetimes: {
    attached() {
      // wx.getSystemInfoSync 已废弃，改用 wx.getWindowInfo()
      const windowInfo = wx.getWindowInfo();
      const menuButton = wx.getMenuButtonBoundingClientRect();
      const statusBarHeight = windowInfo.statusBarHeight || 20;
      const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height || 44;

      this.setData({
        statusBarHeight,
        navBarHeight,
      });
    },
  },
  methods: {
    onSearchInput(e) {
      this.triggerEvent('searchinput', { value: e.detail.value });
    },
    onSearchConfirm() {
      this.triggerEvent('searchconfirm');
    },
    onSearchClear() {
      this.triggerEvent('searchclear');
    },
    onBack() {
      if (this.data.interceptBack) {
        this.triggerEvent('back');
        return;
      }
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.switchTab({ url: '/pages/home/index' });
      }
    },
  },
});
