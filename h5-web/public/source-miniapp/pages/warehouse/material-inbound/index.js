/**
 * 物料入库（独立页 D-514）
 *
 * 表单本体已抽成通用组件 components/material-inbound-form
 * —— 同一张表单在物料中心「入库」tab 里内联复用，避免两份逻辑各改各的。
 * 本页只负责：
 *   ① 从 URL 取 materialCode 传给组件（物料库存页点「入库」会带）
 *   ② 组件提交成功后刷新上一页列表并返回
 */
const { decodeParam } = require('../../../utils/urlParams');
const i18n = require('../../../utils/i18n/index');
Page({
  data: {
    materialCode: '',
    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    // ⚠️ decodeParam：跳转方用 encodeURIComponent 传参，小程序**不会**自动解码。
    //    物料编码含中文（如 M棉布-140CM-粉色），漏解码会拿 %E6%A3%89… 去查 → 「未查到该物料」。
    var code = decodeParam(options && options.materialCode);
    if (code) {
      this.setData({ materialCode: code });
    }
  },

  onShow() {
    // 从「我的 → 语言」切回时导航栏标题要跟着变，故每次显示都重刷
    this.applyLanguage(i18n.getLanguage());
  },

  /**
   * 按当前语言刷新文案。
   *
   * ⚠️ json 里的 navigationBarTitleText 是**静态**的，不会跟着语言变 ——
   *    要让它跟着切，只能在这里调 wx.setNavigationBarTitle。
   *    （本页表单本体在通用组件 material-inbound-form 里，组件自己也会刷文案）
   */
  applyLanguage(language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.materialInbound.title', lang) });
  },

  /** 组件提交成功 → 刷新上一页并返回 */
  onFormSuccess() {
    var pages = getCurrentPages();
    var prev = pages[pages.length - 2];
    if (prev && typeof prev.loadData === 'function') prev.loadData();
    if (prev && typeof prev.loadList === 'function') prev.loadList(true);
    setTimeout(function () { wx.navigateBack(); }, 800);
  },
});
