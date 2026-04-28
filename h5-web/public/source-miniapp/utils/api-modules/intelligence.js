const { ok } = require('./helpers');
const { getToken } = require('../storage');
const config = require('../../config');

const intelligence = {
  precheckScan(payload) {
    return ok('/api/intelligence/precheck/scan', 'POST', payload || {});
  },
  getScanTips(payload) {
    return ok('/api/intelligence/scan-advisor/tips', 'POST', payload || {});
  },
  aiAdvisorChat(payload) {
    return ok('/api/intelligence/ai-advisor/chat', 'POST', payload || {}, { timeout: 90000 });
  },
  aiAdvisorChatStream(payload, onEvent, onDone, onError) {
    var doneCalled = false;
    var token = getToken();
    var question = encodeURIComponent(payload.question || '');
    var pageContext = payload.pageContext ? encodeURIComponent(payload.pageContext) : '';
    var conversationId = payload.conversationId || '';
    var url = '/api/intelligence/ai-advisor/chat/stream?question=' + question;
    if (pageContext) url += '&pageContext=' + pageContext;
    if (conversationId) url += '&conversationId=' + encodeURIComponent(conversationId);
    if (payload.imageUrl) url += '&imageUrl=' + encodeURIComponent(payload.imageUrl);
    if (payload.orderNo) url += '&orderNo=' + encodeURIComponent(payload.orderNo);
    if (payload.processName) url += '&processName=' + encodeURIComponent(payload.processName);
    if (payload.stage) url += '&stage=' + encodeURIComponent(payload.stage);

    var safeDone = function () {
      if (doneCalled) return;
      doneCalled = true;
      if (onDone) onDone();
    };
    var safeError = function (err) {
      if (doneCalled) return;
      doneCalled = true;
      if (onError) onError(err);
    };

    var requestTask = wx.request({
      url: config.getBaseUrl() + url,
      method: 'GET',
      header: { 'Authorization': token ? 'Bearer ' + token : '' },
      enableChunked: true,
      responseType: 'text',
      timeout: 180000,
      success: function () {
        safeDone();
      },
      fail: function (err) {
        safeError(err);
      },
    });

    if (requestTask && requestTask.onChunkReceived) {
      var buf = '';
      var eventName = '';
      requestTask.onChunkReceived(function (res) {
        try {
          var str = '';
          if (res.data && res.data instanceof ArrayBuffer) {
            var arr = new Uint8Array(res.data);
            for (var i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
            try {
              var bytes = new Uint8Array(str.length);
              for (var j = 0; j < str.length; j++) bytes[j] = str.charCodeAt(j);
              str = new TextDecoder('utf-8').decode(bytes);
            } catch (_de) {
              str = decodeURIComponent(escape(str));
            }
          } else if (typeof res.data === 'string') {
            str = res.data;
          }
          if (!str) return;
          buf += str;
          var lines = buf.split('\n');
          buf = lines.pop() || '';
          for (var li = 0; li < lines.length; li++) {
            var line = lines[li];
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:') && eventName) {
              var dataStr = line.slice(5).trim();
              try {
                var parsed = JSON.parse(dataStr);
                if (eventName === 'done') {
                  safeDone();
                } else {
                    if (onEvent) onEvent({ type: eventName, data: parsed });
                }
              } catch (_pe) {
                if (onEvent) onEvent({ type: eventName, data: { content: dataStr } });
              }
              eventName = '';
            }
          }
        } catch (e) {
          console.warn('[SSE] chunk parse error:', e);
        }
      });
    }
    return requestTask;
  },
  naturalLanguageExecute(payload) {
    return ok('/api/intelligence/crew/nl-execute', 'POST', payload || {}, { timeout: 90000 });
  },
  executeCommand(payload) {
    return ok('/api/intelligence/commands/execute', 'POST', payload || {});
  },
  getPendingCommands() {
    return ok('/api/intelligence/commands/pending', 'GET', {});
  },
  approveCommand(commandId) {
    return ok('/api/intelligence/commands/' + commandId + '/approve', 'POST', {});
  },
  rejectCommand(commandId) {
    return ok('/api/intelligence/commands/' + commandId + '/reject', 'POST', {});
  },
  getAgentActivityList() {
    return ok('/api/intelligence/agent-activity/agents', 'GET', {});
  },
  getAgentAlerts() {
    return ok('/api/intelligence/agent-activity/alerts', 'GET', {});
  },
  getMyPendingTaskSummary() {
    return ok('/api/intelligence/pending-tasks/summary', 'GET', {});
  },
  aiAdvisorScenario(key, payload) {
    return ok('/api/intelligence/ai-advisor/scenario/' + key, 'POST', payload || {}, { timeout: 90000 });
  },
  getBrainSnapshot() {
    return ok('/api/intelligence/brain/snapshot', 'GET', {});
  },
  getProfitEstimation(payload) {
    return ok('/api/intelligence/profit-estimation', 'POST', payload || {});
  },
  getFactoryLeaderboard() {
    return ok('/api/intelligence/factory-leaderboard', 'POST', {});
  },
  getFinanceAudit() {
    return ok('/api/intelligence/finance-audit', 'POST', {});
  },
  getMonthlyBizSummary(payload) {
    return ok('/api/intelligence/monthly-biz-summary', 'GET', payload || {});
  },
  runAiPatrol() {
    return ok('/api/intelligence/ai-patrol/run', 'POST', {});
  },
  getSupplierScorecard() {
    return ok('/api/intelligence/supplier-scorecard', 'GET', {});
  },
  getForecast(payload) {
    return ok('/api/intelligence/forecast', 'POST', payload || {});
  },
  getLivePulse() {
    return ok('/api/intelligence/live-pulse', 'POST', {});
  },
  getHealthIndex() {
    return ok('/api/intelligence/health-index', 'POST', {});
  },
  getSmartNotifications() {
    return ok('/api/intelligence/smart-notification', 'POST', {});
  },
  getWorkerEfficiency() {
    return ok('/api/intelligence/worker-efficiency', 'POST', {});
  },
  getDefectHeatmap() {
    return ok('/api/intelligence/defect-heatmap', 'POST', {});
  },
  getFactoryBottleneck() {
    return ok('/api/intelligence/factory-bottleneck', 'GET', {});
  },
  getActionCenter() {
    return ok('/api/intelligence/action-center', 'GET', {});
  },
  getMaterialShortage() {
    return ok('/api/intelligence/material-shortage', 'GET', {});
  },
  runSelfHealing() {
    return ok('/api/intelligence/self-healing', 'POST', {});
  },
};

const notice = {
  myList(params) {
    return ok('/api/production/notice/my', 'GET', params || {});
  },
  unreadCount() {
    return ok('/api/production/notice/unread-count', 'GET', {});
  },
  markRead(id) {
    return ok('/api/production/notice/' + id + '/read', 'POST', {});
  },
};

module.exports = { intelligence, notice };
