/**
 * 物料出库（独立页 D-514）
 *
 * 表单本体已抽成通用组件 components/material-outbound-form
 * —— 同一张表单在物料中心「出库」tab 里内联复用，避免两份逻辑各改各的。
 * 本页只负责：
 *   ① 从 URL 取 materialCode 传给组件（物料库存页点「出库」会带）
 *   ② 组件提交成功后刷新上一页列表并返回
 */
Page({
  data: {
    materialCode: '',
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: '物料出库' });
    if (options && options.materialCode) {
      this.setData({ materialCode: options.materialCode });
    }
  },

  /** 组件提交成功 → 刷新上一页并返回 */
  onFormSuccess() {
    var pages = getCurrentPages();
    var prev = pages[pages.length - 2];
    if (prev && typeof prev.loadList === 'function') prev.loadList(true);
    if (prev && typeof prev.loadData === 'function') prev.loadData();
    setTimeout(function () { wx.navigateBack(); }, 800);
  },
});
