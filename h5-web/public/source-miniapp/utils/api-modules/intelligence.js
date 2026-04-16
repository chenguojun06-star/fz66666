const { ok } = require('./helpers');
const { getToken } = require('../storage');
const config = require('../../config');

const intelligence = {
  precheckScan(payload) {
    return ok('/api/intelligence/scan-advisor/precheck', 'POST', payload || {});
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

    var requestTask = wx.request({
      url: config.getBaseUrl() + url,
      method: 'GET',
      header: { 'Authorization': token ? 'Bearer ' + token : '' },
      enableChunked: true,
      responseType: 'text',
      timeout: 120000,
      success: function () {
        if (!doneCalled) { doneCalled = true; if (onDone) onDone(); }
      },
      fail: function (err) {
        if (onError) onError(err);
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
                  if (!doneCalled) { doneCalled = true; if (onDone) onDone(); }
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
    return ok('/api/intelligence/execution-engine/execute', 'POST', payload || {});
  },
  getPendingCommands() {
    return ok('/api/intelligence/execution-engine/pending', 'GET', {});
  },
  approveCommand(commandId) {
    return ok('/api/intelligence/execution-engine/' + commandId + '/approve', 'POST', {});
  },
  rejectCommand(commandId) {
    return ok('/api/intelligence/execution-engine/' + commandId + '/reject', 'POST', {});
  },
  visualAnalyze(payload) {
    return ok('/api/intelligence/visual/analyze', 'POST', payload || {}, { timeout: 60000 });
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
