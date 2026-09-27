const i18n = require('../../../utils/i18n/index');

const NS = 'mp.privacyService.';

Page({
  data: { t: {} },

  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({ t: {
      docTitle: t('docTitle'), docDate: t('docDate'),
      h1: t('h1'), p1: t('p1'), h2: t('h2'), p2: t('p2'),
      h3: t('h3'), p3: t('p3'), h4: t('h4'), p4: t('p4'),
      h5: t('h5'), p5: t('p5'), h6: t('h6'), p6: t('p6'),
      h7: t('h7'), p7: t('p7'), copyright: t('copyright') } });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onLoad() {
    this.applyLanguage(i18n.getLanguage());
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },
});
