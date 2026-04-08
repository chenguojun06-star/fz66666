/**
 * 智能运营 API（intelligence / notice）
 * AI对话、NL执行引擎、消息通知
 */
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
    return ok(`/api/intelligence/execution-engine/${commandId}/approve`, 'POST', {});
  },
  rejectCommand(commandId) {
    return ok(`/api/intelligence/execution-engine/${commandId}/reject`, 'POST', {});
  },
  /** 视觉AI分析（拍照识别缺陷/款式/色差） */
  visualAnalyze(payload) {
    return ok('/api/intelligence/visual/analyze', 'POST', payload || {}, { timeout: 60000 });
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
    return ok(`/api/production/notice/${id}/read`, 'POST', {});
  },
};

module.exports = { intelligence, notice };
