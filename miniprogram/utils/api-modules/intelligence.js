const { ok } = require('./helpers');

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
    let token = '';
    try { token = wx.getStorageSync('authToken') || wx.getStorageSync('token') || ''; } catch (_e) { /* ignore */ }
    const question = encodeURIComponent(payload.question || '');
    const pageContext = payload.pageContext ? encodeURIComponent(payload.pageContext) : '';
    const conversationId = payload.conversationId || '';
    let url = '/api/intelligence/ai-advisor/chat/stream?question=' + question;
    if (pageContext) url += '&pageContext=' + pageContext;
    if (conversationId) url += '&conversationId=' + encodeURIComponent(conversationId);

    const requestTask = wx.request({
      url: (getApp().globalData && getApp().globalData.baseUrl || '') + url,
      method: 'GET',
      header: { 'Authorization': token ? 'Bearer ' + token : '' },
      enableChunked: true,
      responseType: 'text',
      timeout: 120000,
      success: function () {
        if (onDone) onDone();
      },
      fail: function (err) {
        if (onError) onError(err);
      },
    });

    if (requestTask && requestTask.onChunkReceived) {
      let buf = '';
      let eventName = '';
      requestTask.onChunkReceived(function (res) {
        try {
          let str = '';
          if (res.data && res.data instanceof ArrayBuffer) {
            const arr = new Uint8Array(res.data);
            for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
            str = decodeURIComponent(escape(str));
          } else if (typeof res.data === 'string') {
            str = res.data;
          }
          if (!str) return;
          buf += str;
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:') && eventName) {
              const dataStr = line.slice(5).trim();
              try {
                const parsed = JSON.parse(dataStr);
                if (eventName === 'done') {
                  if (onDone) onDone();
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
