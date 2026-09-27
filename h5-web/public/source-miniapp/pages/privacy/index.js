const i18n = require('../../utils/i18n/index');

const NS = 'mp.privacy.';

Page({
  data: { t: {} },

  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({ t: { docTitle: t('docTitle'), docDate: t('docDate'),
      h1: t('h1'), p1: t('p1'), h2: t('h2'), h21: t('h21'), p21: t('p21'),
      h22: t('h22'), p22: t('p22'), h23: t('h23'), p23: t('p23'), h24: t('h24'), p24: t('p24'),
      h3: t('h3'), p31: t('p31'), p32: t('p32'), p33: t('p33'), p34: t('p34'),
      h4: t('h4'), p4: t('p4'), h5: t('h5'), p5: t('p5'), h6: t('h6'), p6: t('p6'),
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
