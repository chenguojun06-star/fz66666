const api = require('../../../../utils/api');

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
  },

  onLoad: function () {
    this.loadSystemInfo();
  },

  onPullDownRefresh: function () {
    this.loadSystemInfo().finally(function () { wx.stopPullDownRefresh(); });
  },

  loadSystemInfo: function () {
    const that = this;
    return Promise.allSettled([
      api.get('/api/system/status/overview', 'GET', {}).catch(function () { return null; }),
      api.system.getMe().catch(function () { return null; }),
      api.system.getOnlineCount().catch(function () { return 0; }),
    ]).then(function (results) {
      const statusData = that._unwrap(results[0]);
      const me = that._unwrap(results[1]);
      const onlineCount = that._unwrap(results[2]);

      const d = {
        loading: false,
      };

      if (statusData) {
        d.appName = statusData.applicationName || '服装供应链管理系统';
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
          d.database = db.status === 'UP' ? '正常' : '异常';
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
      '应用：' + (this.data.appName || '--'),
      'Java：' + (this.data.javaVersion || '--'),
      '运行时长：' + (this.data.uptime || '--'),
      '启动时间：' + (this.data.startTime || '--'),
    ].join('\n');
    wx.setClipboardData({
      data: text,
      success: function () { wx.showToast({ title: '已复制', icon: 'success' }); },
    });
  },
});
