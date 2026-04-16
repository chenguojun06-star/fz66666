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
  { id: 'procurement', name: '采购' },
  { id: 'cutting', name: '裁剪' },
  { id: 'secondaryProcess', name: '二次工艺' },
  { id: 'carSewing', name: '车缝' },
  { id: 'tailProcess', name: '尾部' },
  { id: 'warehousing', name: '入库' },
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

const STAGE_RATE_MAP = [
  { match: '采购',   fields: ['procurementCompletionRate'] },
  { match: '裁剪',   fields: ['cuttingCompletionRate'] },
  { match: '二次工艺', fields: ['secondaryProcessRate', 'secondaryProcessCompletionRate'] },
  { match: '车缝',   fields: ['carSewingCompletionRate', 'sewingCompletionRate'] },
  { match: '尾部',   fields: ['tailProcessRate', 'ironingCompletionRate'] },
  { match: '入库',   fields: ['warehousingCompletionRate'] },
  { match: '质检',   fields: ['qualityCompletionRate'] },
  { match: '包装',   fields: ['packagingCompletionRate'] },
];

function getNodeRateFromOrder(nodeName, order) {
  const name = (nodeName || '').trim();
  for (let i = 0; i < STAGE_RATE_MAP.length; i++) {
    const entry = STAGE_RATE_MAP[i];
    if (name === entry.match || name.indexOf(entry.match) >= 0 || entry.match.indexOf(name) >= 0) {
      for (let j = 0; j < entry.fields.length; j++) {
        const val = Number(order[entry.fields[j]]) || 0;
        if (val > 0) return clampPercent(val);
      }
    }
  }
  return -1;
}

function buildProcessNodesWithRates(order) {
  const nodes = resolveNodesFromOrder(order);
  if (!nodes || !nodes.length) return [];
  const progress = Number(order.productionProgress) || 0;
  let hasAnyRate = false;
  const result = nodes.map(function (n, idx) {
    const name = n.name || n;
    const rate = getNodeRateFromOrder(name, order);
    if (rate >= 0) {
      hasAnyRate = true;
      return { name, percent: rate, label: (idx + 1) + '.' + name };
    }
    return { name, percent: -1, label: (idx + 1) + '.' + name };
  });
  if (hasAnyRate) {
    return result.map(function (r) {
      return { name: r.name, percent: r.percent >= 0 ? r.percent : 0, label: r.label };
    });
  }
  const len = nodes.length;
  const perNode = 100 / len;
  return nodes.map(function (n, i) {
    const nodeStart = i * perNode;
    const nodeEnd = (i + 1) * perNode;
    let pct = 0;
    if (progress >= nodeEnd) {
      pct = 100;
    } else if (progress > nodeStart) {
      pct = Math.round(((progress - nodeStart) / perNode) * 100);
    }
    return { name: n.name || n, percent: clampPercent(pct), label: (i + 1) + '.' + (n.name || n) };
  });
}

module.exports = {
  stripWarehousingNode,
  defaultNodes,
  clampPercent,
  getNodeIndexFromProgress,
  getProgressFromNodeIndex,
  parseProgressNodes,
  resolveNodesFromOrder,
  getNodeRateFromOrder,
  buildProcessNodesWithRates,
  STAGE_RATE_MAP,
};
