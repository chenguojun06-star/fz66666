/**
 * D-280：工序进度时间线共享工具（生产管理/外发管理 对齐样衣开发跟进的时间线样式）
 * - 节点状态推导（completed/in_progress/pending）
 * - 开始/结束时间懒加载合并（复用订单 flow 接口的 stages，避免列表页批量请求）
 * - 时间/单价 显示开关（仅管理层可切换，本地持久化）
 */
const { isManagerLevel } = require('./permission');

const META_TOGGLE_KEY = 'proc_meta_visible';

/** 时间/单价开关当前状态：管理层默认开，非管理层恒 false */
function getShowProcMeta() {
  if (!isManagerLevel()) return false;
  const stored = wx.getStorageSync(META_TOGGLE_KEY);
  return stored === '' || stored === undefined ? true : !!stored;
}

function setShowProcMeta(visible) {
  try { wx.setStorageSync(META_TOGGLE_KEY, !!visible); } catch (e) { /* 存储失败不阻断 */ }
}

/** 进度百分比 → 时间线节点状态 */
function nodeStatus(percent) {
  const p = Number(percent) || 0;
  if (p >= 100) return 'completed';
  if (p > 0) return 'in_progress';
  return 'pending';
}

/** 给 processNodes 补时间线渲染字段（_status） */
function applyTimelineStatus(nodes) {
  (Array.isArray(nodes) ? nodes : []).forEach(n => {
    n._status = nodeStatus(n.percent);
  });
  return nodes;
}

function formatShortTime(t) {
  const text = String(t || '').trim();
  // "2026-09-01 15:15:00" → "09-01 15:15"（与样衣跟进 meta 同款短格式）
  return text.length >= 16 ? text.substring(5, 16) : text;
}

/**
 * 把订单 flow 接口返回的 stages（含 processName/startTime/completeTime）按节点归并：
 * - 匹配优先级：子工序名精确匹配 > 工序名互含
 * - startTime = 归并阶段最早开始时间；endTime = 最晚完成时间（短格式）
 */
function mergeStageMetaIntoNodes(processNodes, stages) {
  if (!Array.isArray(processNodes) || !Array.isArray(stages)) return processNodes;
  const cleanStages = stages.filter(s => s && String(s.processName || '').trim());
  return processNodes.map(node => {
    const childNames = (node.children || []).map(c => String(c.name || '').trim()).filter(Boolean);
    const matched = cleanStages.filter(s => {
      const pn = String(s.processName || '').trim();
      if (childNames.indexOf(pn) >= 0) return true;
      if (!pn || !node.name) return false;
      return pn.indexOf(node.name) >= 0 || (node.name.indexOf(pn) >= 0 && pn.length >= 2);
    });
    let startTime = '';
    let endTime = '';
    matched.forEach(s => {
      const st = formatShortTime(s.startTime);
      const ct = formatShortTime(s.completeTime);
      if (st && (!startTime || st < startTime)) startTime = st;
      if (ct && (!endTime || ct > endTime)) endTime = ct;
    });
    // 单价：子工序单价（工作流配置），展示"子工序名¥x/件"，多个用 · 连接
    const prices = (node.children || [])
      .filter(c => Number(c.unitPrice) > 0)
      .map(c => `${c.name}¥${Number(c.unitPrice)}/件`);
    return {
      ...node,
      _status: nodeStatus(node.percent),
      startTime,
      endTime,
      priceText: prices.join(' · '),
    };
  });
}

module.exports = {
  META_TOGGLE_KEY,
  getShowProcMeta,
  setShowProcMeta,
  nodeStatus,
  applyTimelineStatus,
  mergeStageMetaIntoNodes,
  formatShortTime,
};
