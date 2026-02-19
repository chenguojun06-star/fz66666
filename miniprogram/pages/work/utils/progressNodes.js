/**
 * 进度节点计算与解析工具
 * 从 work/index.js 提取的纯函数
 */
const { normalizeText } = require('./orderTransform');

/**
 * 过滤掉出货/发货节点
 * @param {Array} list - 节点列表
 * @returns {Array} 过滤后的节点列表
 */
function stripWarehousingNode(list) {
  const items = Array.isArray(list) ? list : [];
  return items.filter(n => {
    const id = normalizeText(n && n.id).toLowerCase();
    const name = normalizeText(n && n.name);
    return !(id === 'shipment' || name === '出货' || name === '发货' || name === '发运');
  });
}

const defaultNodes = [
  { id: 'cutting', name: '裁剪' },
  { id: 'production', name: '生产' },
  { id: 'quality', name: '质检' },
  { id: 'packaging', name: '包装' },
];

/**
 * 限制百分比在 0-100 之间
 * @param {number} value - 原始值
 * @returns {number} 限制后的百分比
 */
function clampPercent(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * 根据进度百分比计算节点索引
 * @param {Array} nodes - 节点列表
 * @param {number} progress - 进度百分比
 * @returns {number} 节点索引
 */
function getNodeIndexFromProgress(nodes, progress) {
  if (!nodes || nodes.length <= 1) {
    return 0;
  }
  const idx = Math.round((clampPercent(progress) / 100) * (nodes.length - 1));
  return Math.max(0, Math.min(nodes.length - 1, idx));
}

/**
 * 根据节点索引计算进度百分比
 * @param {Array} nodes - 节点列表
 * @param {number} index - 节点索引
 * @returns {number} 进度百分比
 */
function getProgressFromNodeIndex(nodes, index) {
  if (!nodes || nodes.length <= 1) {
    return 0;
  }
  const idx = Math.max(0, Math.min(nodes.length - 1, index));
  return clampPercent((idx / (nodes.length - 1)) * 100);
}

/**
 * 解析进度节点 JSON 字符串
 * @param {string} raw - 原始 JSON 字符串
 * @returns {Array} 解析后的节点列表
 */
function parseProgressNodes(raw) {
  const text = normalizeText(raw);
  if (!text) {
    return [];
  }
  try {
    const obj = JSON.parse(text);
    const nodesRaw = obj && Array.isArray(obj.nodes) ? obj.nodes : [];
    return stripWarehousingNode(
      nodesRaw
        .map(n => {
          const name = normalizeText(n && n.name);
          const id = normalizeText(n && n.id) || name;
          return name ? { id, name } : null;
        })
        .filter(n => n && n.name),
    );
  } catch (e) {
    return [];
  }
}

/**
 * 从订单数据解析进度节点
 * @param {Object} order - 订单数据
 * @returns {Array} 进度节点列表
 */
function resolveNodesFromOrder(order) {
  const raw = normalizeText(order && order.progressWorkflowJson);
  const parsed = parseProgressNodes(raw);
  return parsed.length ? parsed : defaultNodes;
}

module.exports = {
  stripWarehousingNode,
  defaultNodes,
  clampPercent,
  getNodeIndexFromProgress,
  getProgressFromNodeIndex,
  parseProgressNodes,
  resolveNodesFromOrder,
};
