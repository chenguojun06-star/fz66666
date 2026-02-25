/**
 * 隐私保护授权弹窗组件
 *
 * 用法：在需要使用摄像头、相册等隐私功能的页面 WXML 中放置：
 *   <privacy-dialog id="privacy-dialog" />
 *
 * 微信要求（基础库 2.32.3+，2023-09-15 生效）：
 *   当用户触发需要隐私授权的 API（扫码/选图/获取手机号等）时，
 *   必须通过含 open-type="agreePrivacyAuthorization" 按钮的完成授权，
 *   wx.showModal / wx.alert 不可替代该按钮。
 */
Component({
  properties: {},

  data: {
    show: false,
  },

  methods: {
    /**
     * 由宿主页面调用，展示弹窗并绑定 resolve 函数
     * @param {Function} resolve - wx.onNeedPrivacyAuthorization 的回调参数
     */
    showDialog(resolve) {
      this._resolve = resolve;
      this.setData({ show: true });
    },

    /**
     * 用户点击「同意」
     * button 的 open-type="agreePrivacyAuthorization" 会让微信框架
     * 自动调用 resolve({ event: 'agree' })，此处只做 UI 收尾
     */
    onAgreePrivacy() {
      this.setData({ show: false });
      this._resolve = null;
    },

    /** 用户点击「暂不同意」 */
    onDisagree() {
      this.setData({ show: false });
      if (typeof this._resolve === 'function') {
        this._resolve({ event: 'disagree' });
        this._resolve = null;
      }
    },

    /** 查看完整隐私政策：优先打开平台配置的协议，失败则跳转内置页 */
    onViewPrivacy() {
      wx.openPrivacyContract({
        fail: () => {
          // 平台隐私协议未配置时，跳转小程序内置隐私政策页
          wx.navigateTo({ url: '/pages/privacy/index' });
        },
      });
    },
  },
});
