const i18n = require('../../../utils/i18n/index');

const NS = 'mp.orderNoDataCreate.';

Page({
  data: {
    t: {},
  },

  /** 应用语言（本页 onLoad 即 redirect，但渲染前仍要把 t 填好，避免闪一帧中文） */
  applyLanguage: function (language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        basicInfo: t('basicInfo'),
        styleNoLabel: t('styleNoLabel'),
        styleNoPlaceholder: t('styleNoPlaceholder'),
        searching: t('searching'),
        styleNameLabel: t('styleNameLabel'),
        styleNamePlaceholder: t('styleNamePlaceholder'),
        orderDateLabel: t('orderDateLabel'),
        deliveryDateLabel: t('deliveryDateLabel'),
        customerLabel: t('customerLabel'),
        customerPlaceholder: t('customerPlaceholder'),
        categoryLabel: t('categoryLabel'),
        urgencyLabel: t('urgencyLabel'),
        normalOption: t('normalOption'),
        urgentOption: t('urgentOption'),
        producerTitle: t('producerTitle'),
        internalFactory: t('internalFactory'),
        externalFactory: t('externalFactory'),
        orgUnitLabel: t('orgUnitLabel'),
        externalFactoryLabel: t('externalFactoryLabel'),
        factorySearchPlaceholder: t('factorySearchPlaceholder'),
        selectFactoryHint: t('selectFactoryHint'),
        styleImageTitle: t('styleImageTitle'),
        tapUploadImage: t('tapUploadImage'),
        orderLinesTitle: t('orderLinesTitle'),
        addLineBtn: t('addLineBtn'),
        colorLabel: t('colorLabel'),
        sizeLabel: t('sizeLabel'),
        quantityLabel: t('quantityLabel'),
        requiredPlaceholder: t('requiredPlaceholder'),
        remarksLabel: t('remarksLabel'),
        remarksPlaceholder: t('remarksPlaceholder'),
        createOrderBtn: t('createOrderBtn'),
        pleaseSelect: i18n.t('common.pleaseSelect', lang),
      },
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  /**
   * 无资料下单直达内部下单页（用户拍板 D-291）：
   * 点击入口 → 直接进订单表单填写下单；款式图在表单页内选填上传，不再强制。
   * 原中转逻辑（跳 create 列表页 → 选图 → 再进表单）已下线——
   * 列表页选图入口在真机上点击无反应且必须传图才能下一步，两处都是痛点。
   */
  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    wx.redirectTo({ url: '/pages/order/create/form/index?noData=true' });
  },
});
