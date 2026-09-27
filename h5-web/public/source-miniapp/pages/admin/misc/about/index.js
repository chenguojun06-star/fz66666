const api = require('../../../../utils/api');
const { getUserInfo } = require('../../../../utils/storage');
const i18n = require('../../../../utils/i18n/index');

const NS = 'mp.about.';

Page({
  data: {
    loading: true,
    appName: '',
    version: '',
    javaVersion: '',
    osName: '',
    uptime: '',
    startTime: '',
    currentTime: '',
    heapUsedMb: '',
    heapMaxMb: '',
    heapUsedPercent: 0,
    database: '',
    tenantName: '',
    onlineCount: 0,
    isSuperAdmin: false,
    dbError: false,
    t: {},
  },

  /** 应用语言（切语言后回页重刷） */
  applyLanguage: function (language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        appNameFallback: t('appNameFallback'),
        slogan: t('slogan'),
        sysInfoTitle: t('sysInfoTitle'),
        appNameLabel: t('appNameLabel'),
        factoryLabel: t('factoryLabel'),
        onlineCountLabel: t('onlineCountLabel'),
        peopleUnit: t('peopleUnit'),
        runStatusTitle: t('runStatusTitle'),
        javaVersionLabel: t('javaVersionLabel'),
        osLabel: t('osLabel'),
        uptimeLabel: t('uptimeLabel'),
        startTimeLabel: t('startTimeLabel'),
        memUsageLabel: t('memUsageLabel'),
        memPercentLabel: t('memPercentLabel'),
        dbLabel: t('dbLabel'),
        copyVersionBtn: t('copyVersionBtn'),
        copyrightSub: t('copyrightSub'),
      },
      // 数据库状态是 i18n 值，切语言后要跟着重算（用 dbError 布尔判断，不比对文案）
      database: t(this.data.dbError ? 'dbError' : 'dbNormal'),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow: function () {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    const userInfo = getUserInfo() || {};
    const isSuperAdmin = userInfo.role === 'super_admin' || userInfo.role === 'admin';
    this.setData({ isSuperAdmin });
    this.loadSystemInfo();
  },

  onPullDownRefresh: function () {
    this.loadSystemInfo().finally(function () { wx.stopPullDownRefresh(); });
  },

  loadSystemInfo: function () {
    const that = this;
    const promises = [];
    if (this.data.isSuperAdmin) {
      promises.push(api.get('/api/system/status/overview', 'GET', {}).catch(function () { return null; }));
    } else {
      promises.push(Promise.resolve({ status: 'fulfilled', value: null }));
    }
    promises.push(api.system.getMe().catch(function () { return null; }));
    promises.push(api.system.getOnlineCount().catch(function () { return 0; }));

    return Promise.allSettled(promises).then(function (results) {
      const statusData = that._unwrap(results[0]);
      const me = that._unwrap(results[1]);
      const onlineCount = that._unwrap(results[2]);

      const d = {
        loading: false,
      };

      if (statusData) {
        d.appName = statusData.applicationName || i18n.t(NS + 'appNameFallback', that._lang);
        d.javaVersion = statusData.javaVersion || '--';
        d.osName = (statusData.osName || '--') + ' / ' + (statusData.osArch || '');
        d.uptime = statusData.uptime || '--';
        d.startTime = statusData.startTime || '--';
        d.currentTime = statusData.currentTime || '--';
        d.heapUsedMb = (statusData.heapUsedMb || 0) + ' MB';
        d.heapMaxMb = (statusData.heapMaxMb > 0 ? statusData.heapMaxMb : '--') + (statusData.heapMaxMb > 0 ? ' MB' : '');
        d.heapUsedPercent = statusData.heapUsedPercent || 0;
        const db = statusData.database;
        if (typeof db === 'string') {
          d.database = db;
        } else if (db && db.status) {
          d.database = i18n.t(NS + (db.status === 'UP' ? 'dbNormal' : 'dbError'), that._lang);
        d.dbError = db.status !== 'UP';
        } else {
          d.database = '--';
        }
      }

      if (me) {
        d.tenantName = me.factoryName || me.tenantName || '';
      }

      d.onlineCount = Number(onlineCount) || 0;
      that.setData(d);
    }).catch(function () {
      that.setData({ loading: false });
    });
  },

  _unwrap: function (result) {
    if (!result || result.status !== 'fulfilled') return null;
    var val = result.value;
    if (val && val.data) return val.data;
    return val;
  },

  onCopyVersion: function () {
    const text = [
      i18n.tf(NS + 'appPrefixFmt', { name: this.data.appName || '--' }, this._lang),
      'Java：' + (this.data.javaVersion || '--'),
      i18n.tf(NS + 'uptimePrefixFmt', { value: this.data.uptime || '--' }, this._lang),
      i18n.tf(NS + 'startTimePrefixFmt', { value: this.data.startTime || '--' }, this._lang),
    ].join('\n');
    wx.setClipboardData({
      data: text,
      success: function () { wx.showToast({ title: i18n.t(NS + 'copied'), icon: 'success' }); },
    });
  },
});
