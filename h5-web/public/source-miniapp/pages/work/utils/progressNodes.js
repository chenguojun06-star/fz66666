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
  if (!raw) return [];
  var obj = raw;
  if (typeof raw === 'string') {
    var text = raw.trim();
    if (!text) return [];
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return [];
    }
  }
  if (typeof obj !== 'object' || obj === null) return [];
  var nodesRaw = Array.isArray(obj.nodes) ? obj.nodes : [];
  return stripWarehousingNode(
    nodesRaw
      .map(n => {
        var name = normalizeText(n && n.name);
        var id = normalizeText(n && n.id) || name;
        return name ? { id: id, name: name } : null;
      })
      .filter(n => n && n.name),
  );
}

/**
 * 从订单数据解析进度节点
 * @param {Object} order - 订单数据
 * @returns {Array} 进度节点列表
 */
function resolveNodesFromOrder(order) {
  if (!order) return defaultNodes;
  const raw = order.progressWorkflowJson;
  if (!raw) return defaultNodes;
  if (typeof raw === 'object') {
    const nodesRaw = raw && Array.isArray(raw.nodes) ? raw.nodes : [];
    const parsed = stripWarehousingNode(
      nodesRaw
        .map(n => {
          const name = normalizeText(n && n.name);
          const id = normalizeText(n && n.id) || name;
          return name ? { id, name } : null;
        })
        .filter(n => n && n.name),
    );
    return parsed.length ? parsed : defaultNodes;
  }
  const parsed = parseProgressNodes(normalizeText(raw));
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
  var nodes = resolveNodesFromOrder(order);
  if (!nodes || !nodes.length) return [];
  var progress = Number(order.productionProgress) || 0;
  var hasAnyRate = false;
  var result = nodes.map(function (n) {
    var name = n.name || n;
    var rate = getNodeRateFromOrder(name, order);
    if (rate >= 0) {
      hasAnyRate = true;
      return { name: name, percent: rate };
    }
    return { name: name, percent: -1 };
  });
  if (hasAnyRate) {
    return result.map(function (r) {
      return { name: r.name, percent: r.percent >= 0 ? r.percent : 0 };
    });
  }
  var len = nodes.length;
  var perNode = 100 / len;
  return nodes.map(function (n, i) {
    var nodeStart = i * perNode;
    var nodeEnd = (i + 1) * perNode;
    var pct = 0;
    if (progress >= nodeEnd) {
      pct = 100;
    } else if (progress > nodeStart) {
      pct = Math.round(((progress - nodeStart) / perNode) * 100);
    }
    return { name: n.name || n, percent: clampPercent(pct) };
  });
}

function calcOrderProgress(order) {
  if (!order) return 0;
  var dbProgress = clampPercent(Number(order.productionProgress) || 0);
  var status = (order.status || '').trim().toLowerCase();
  if (status === 'completed') return 100;

  var orderNo = (order.orderNo || '').trim().toUpperCase();
  var orderBizType = (order.orderBizType || '').trim().toUpperCase();
  var isDirectCutting = orderBizType === 'CUTTING_DIRECT' || orderNo.indexOf('CUT') === 0;

  var hasProcurement = !isDirectCutting && (
    (Number(order.materialArrivalRate) || 0) > 0
    || Boolean(order.procurementManuallyCompleted)
    || Boolean(order.procurementConfirmedAt)
  );
  var pipeline = hasProcurement
    ? ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库']
    : ['裁剪', '二次工艺', '车缝', '尾部', '入库'];

  var rateSum = 0;
  var rateCount = 0;
  for (var i = 0; i < pipeline.length; i++) {
    var rate = getNodeRateFromOrder(pipeline[i], order);
    if (rate >= 0) {
      rateSum += rate;
      rateCount++;
    }
  }
  var rateProgress = rateCount > 0 ? Math.round(rateSum / rateCount) : 0;

  var hasCuttingAction = (Number(order.cuttingCompletionRate) || 0) > 0
    && (Number(order.cuttingBundleCount) || 0) > 0;
  var hasRateAction = rateProgress > 0;
  var hasRealAction = hasProcurement || hasCuttingAction || hasRateAction;
  if (!hasRealAction) return 0;

  return clampPercent(Math.max(dbProgress, rateProgress));
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
  calcOrderProgress,
  STAGE_RATE_MAP,
};
