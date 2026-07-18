/**
 * 进度节点计算与解析工具
 * 从 work/index.js 提取的纯函数
 */
function _normalizeText(v) {
  return (v || '').toString().trim();
}

/**
 * 过滤掉出货/发货节点
 * @param {Array} list - 节点列表
 * @returns {Array} 过滤后的节点列表
 */
function stripWarehousingNode(list) {
  const items = Array.isArray(list) ? list : [];
  return items.filter(n => {
    const id = _normalizeText(n && n.id).toLowerCase();
    const name = _normalizeText(n && n.name);
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
  let obj = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return [];
    }
  }
  if (typeof obj !== 'object' || obj === null) return [];
  const nodesRaw = Array.isArray(obj.nodes) ? obj.nodes : [];
  return stripWarehousingNode(
    nodesRaw
      .map(n => {
        const name = _normalizeText(n && n.name);
        const id = _normalizeText(n && n.id) || name;
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
          const name = _normalizeText(n && n.name);
          const id = _normalizeText(n && n.id) || name;
          return name ? { id, name } : null;
        })
        .filter(n => n && n.name),
    );
    return parsed.length ? parsed : defaultNodes;
  }
  const parsed = parseProgressNodes(_normalizeText(raw));
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
        const raw = order[entry.fields[j]];
        if (raw !== undefined && raw !== null && raw !== '') {
          const val = Number(raw);
          if (!isNaN(val)) return clampPercent(val);
        }
      }
    }
  }
  return -1;
}

/**
 * 从 progressWorkflowJson 提取各父节点的子工序列表
 * @param {Object|string} wfRaw - progressWorkflowJson 原始值
 * @returns {Object} { 父节点名: [{name, unitPrice}] }
 */
function extractChildrenMap(wfRaw) {
  if (!wfRaw) return {};
  try {
    const wf = typeof wfRaw === 'string' ? JSON.parse(wfRaw) : wfRaw;
    const pbn = wf && wf.processesByNode;
    if (!pbn || typeof pbn !== 'object') return {};
    const result = {};
    Object.keys(pbn).forEach(function (stageKey) {
      const subList = pbn[stageKey];
      if (!Array.isArray(subList)) return;
      result[stageKey] = subList.map(function (sp) {
        return {
          name: sp.name || sp.processName || '',
          unitPrice: Number(sp.unitPrice || sp.price || 0),
        };
      }).filter(function (sp) { return sp.name; });
    });
    return result;
  } catch (e) { return {}; }
}

function buildProcessNodesWithRates(order) {
  const nodes = resolveNodesFromOrder(order);
  if (!nodes || !nodes.length) return [];

  // 预先提取子工序 map，附加到每个父节点
  const childrenMap = extractChildrenMap(order.progressWorkflowJson);

  const orderStatus = (order.status || '').trim().toLowerCase();
  const isCompletedOrClosed = orderStatus === 'completed' || orderStatus === 'closed';
  const progress = Number(order.productionProgress) || 0;
  let hasAnyRate = false;
  let hasRealRate = false;
  const totalBundles = Number(order.cuttingBundleCount) || 0;
  const processScannedMap = order.stageScannedBundleCount || {};
  const result = nodes.map(function (n) {
    const name = n.name || n;
    const rate = getNodeRateFromOrder(name, order);
    const scannedBundles = Number(processScannedMap[name]) || 0;
    let bundleInfo = null;
    if (totalBundles > 0 && scannedBundles > 0) {
      bundleInfo = {
        total: totalBundles,
        scanned: scannedBundles,
        remaining: Math.max(0, totalBundles - scannedBundles),
      };
    }
    const children = childrenMap[name] || [];
    if (rate >= 0) {
      hasAnyRate = true;
      if (rate > 0 && rate < 100) hasRealRate = true;
      return { name: name, percent: rate, bundleInfo: bundleInfo, children: children };
    }
    return { name: name, percent: -1, bundleInfo: bundleInfo, children: children };
  });
  if (isCompletedOrClosed) {
    return result.map(function (r) {
      return { name: r.name, percent: 100, bundleInfo: r.bundleInfo, children: r.children };
    });
  }
  if (hasAnyRate && hasRealRate) {
    return result.map(function (r) {
      return { name: r.name, percent: r.percent >= 0 ? r.percent : 0, bundleInfo: r.bundleInfo, children: r.children };
    });
  }
  if (hasAnyRate && !hasRealRate) {
    const allHundred = result.every(function (r) { return r.percent === 100 || r.percent < 0; });
    if (allHundred) {
      return result.map(function (r) {
        return { name: r.name, percent: r.percent >= 0 ? r.percent : 0, bundleInfo: r.bundleInfo, children: r.children };
      });
    }
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
    const name2 = n.name || n;
    const scannedBundles2 = Number(processScannedMap[name2]) || 0;
    let bundleInfo2 = null;
    if (totalBundles > 0 && scannedBundles2 > 0) {
      bundleInfo2 = {
        total: totalBundles,
        scanned: scannedBundles2,
        remaining: Math.max(0, totalBundles - scannedBundles2),
      };
    }
    return { name: name2, percent: clampPercent(pct), bundleInfo: bundleInfo2, children: childrenMap[name2] || [] };
  });
}

function calcOrderProgress(order) {
  if (!order) return 0;
  const dbProgress = clampPercent(Number(order.productionProgress) || 0);
  const status = (order.status || '').trim().toLowerCase();
  if (status === 'completed' || status === 'closed') {
    const completedQty = Number(order.completedQuantity) || 0;
    const totalQty = Number(order.cuttingQuantity) || Number(order.cuttingQty)
                   || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
    // 有已完成数量（或无总数可参照）→ 真实完成，返回100%
    if (completedQty > 0 || totalQty === 0) return 100;
    // completedQty=0 且有 totalQty → 仓库数量尚未录入，继续按工序完成率计算
    // 避免进度条100%但「已完成数量」显示0的视觉矛盾
  }

  const orderNo = (order.orderNo || '').trim().toUpperCase();
  const orderBizType = (order.orderBizType || '').trim().toUpperCase();
  const isDirectCutting = orderBizType === 'CUTTING_DIRECT' || orderNo.indexOf('CUT') === 0;

  const hasProcurement = !isDirectCutting && (
    (Number(order.procurementCompletionRate) || 0) > 0
    || Boolean(order.procurementManuallyCompleted)
    || Boolean(order.procurementConfirmedAt)
  );
  const pipeline = hasProcurement
    ? ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库']
    : ['裁剪', '二次工艺', '车缝', '尾部', '入库'];

  let rateSum = 0;
  let rateCount = 0;
  for (let i = 0; i < pipeline.length; i++) {
    const rate = getNodeRateFromOrder(pipeline[i], order);
    if (rate >= 0) {
      rateSum += rate;
      rateCount++;
    }
  }
  const rateProgress = rateCount > 0 ? Math.round(rateSum / rateCount) : 0;

  const hasCuttingAction = (Number(order.cuttingCompletionRate) || 0) > 0
    && (Number(order.cuttingBundleCount) || 0) > 0;
  const hasRateAction = rateProgress > 0;
  const hasRealAction = hasProcurement || hasCuttingAction || hasRateAction;
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
  extractChildrenMap,
  calcOrderProgress,
  STAGE_RATE_MAP,
};
