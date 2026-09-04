Page({
  /**
   * 无资料下单直达内部下单页（用户拍板 D-291）：
   * 点击入口 → 直接进订单表单填写下单；款式图在表单页内选填上传，不再强制。
   * 原中转逻辑（跳 create 列表页 → 选图 → 再进表单）已下线——
   * 列表页选图入口在真机上点击无反应且必须传图才能下一步，两处都是痛点。
   */
  onLoad: function () {
    wx.redirectTo({ url: '/pages/order/create/form/index?noData=true' });
  },
});
