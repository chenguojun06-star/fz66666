/**
 * 进度节点计算与解析工具
 * 从 work/index.js 提取的纯函数
 */
function _normalizeText(v) {
  return (v || '').toString().trim();
}

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

function clampPercent(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getNodeIndexFromProgress(nodes, progress) {
  if (!nodes || nodes.length <= 1) {
    return 0;
  }
  const idx = Math.round((clampPercent(progress) / 100) * (nodes.length - 1));
  return Math.max(0, Math.min(nodes.length - 1, idx));
}

function getProgressFromNodeIndex(nodes, index) {
  if (!nodes || nodes.length <= 1) {
    return 0;
  }
  const idx = Math.max(0, Math.min(nodes.length - 1, index));
  return clampPercent((idx / (nodes.length - 1)) * 100);
}

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
        var name = _normalizeText(n && n.name);
        var id = _normalizeText(n && n.id) || name;
        return name ? { id: id, name: name } : null;
      })
      .filter(n => n && n.name),
  );
}

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
        var raw = order[entry.fields[j]];
        if (raw !== undefined && raw !== null && raw !== '') {
          var val = Number(raw);
          if (!isNaN(val)) return clampPercent(val);
        }
      }
    }
  }
  return -1;
}

function extractChildrenMap(wfRaw) {
  if (!wfRaw) return {};
  try {
    var wf = typeof wfRaw === 'string' ? JSON.parse(wfRaw) : wfRaw;
    var pbn = wf && wf.processesByNode;
    if (!pbn || typeof pbn !== 'object') return {};
    var result = {};
    Object.keys(pbn).forEach(function (stageKey) {
      var subList = pbn[stageKey];
      if (!Array.isArray(subList)) return;
      result[stageKey] = subList.map(function (sp) {
        return {
          name: sp.name || sp.processName || '',
          unitPrice: Number(sp.unitPrice || sp.price || 0)
        };
      }).filter(function (sp) { return sp.name; });
    });
    return result;
  } catch (e) { return {}; }
}

function buildProcessNodesWithRates(order) {
  var nodes = resolveNodesFromOrder(order);
  if (!nodes || !nodes.length) return [];

  var childrenMap = extractChildrenMap(order.progressWorkflowJson);

  var orderStatus = (order.status || '').trim().toLowerCase();
  var isCompletedOrClosed = orderStatus === 'completed' || orderStatus === 'closed';
  var progress = Number(order.productionProgress) || 0;
  var hasAnyRate = false;
  var hasRealRate = false;
  var totalBundles = Number(order.cuttingBundleCount) || 0;
  var processScannedMap = order.stageScannedBundleCount || {};
  var result = nodes.map(function (n) {
    var name = n.name || n;
    var rate = getNodeRateFromOrder(name, order);
    var scannedBundles = Number(processScannedMap[name]) || 0;
    var bundleInfo = null;
    if (totalBundles > 0 && scannedBundles > 0) {
      bundleInfo = {
        total: totalBundles,
        scanned: scannedBundles,
        remaining: Math.max(0, totalBundles - scannedBundles)
      };
    }
    var children = childrenMap[name] || [];
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
    var allHundred = result.every(function (r) { return r.percent === 100 || r.percent < 0; });
    if (allHundred) {
      return result.map(function (r) {
        return { name: r.name, percent: r.percent >= 0 ? r.percent : 0, bundleInfo: r.bundleInfo, children: r.children };
      });
    }
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
    var name2 = n.name || n;
    var scannedBundles2 = Number(processScannedMap[name2]) || 0;
    var bundleInfo2 = null;
    if (totalBundles > 0 && scannedBundles2 > 0) {
      bundleInfo2 = {
        total: totalBundles,
        scanned: scannedBundles2,
        remaining: Math.max(0, totalBundles - scannedBundles2)
      };
    }
    return { name: name2, percent: clampPercent(pct), bundleInfo: bundleInfo2, children: childrenMap[name2] || [] };
  });
}

function calcOrderProgress(order) {
  if (!order) return 0;
  var dbProgress = clampPercent(Number(order.productionProgress) || 0);
  var status = (order.status || '').trim().toLowerCase();
  if (status === 'completed' || status === 'closed') {
    var completedQty = Number(order.completedQuantity) || 0;
    var totalQty = Number(order.cuttingQuantity) || Number(order.cuttingQty)
                   || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
    if (completedQty > 0 || totalQty === 0) return 100;
  }

  var orderNo = (order.orderNo || '').trim().toUpperCase();
  var orderBizType = (order.orderBizType || '').trim().toUpperCase();
  var isDirectCutting = orderBizType === 'CUTTING_DIRECT' || orderNo.indexOf('CUT') === 0;

  var hasProcurement = !isDirectCutting && (
    (Number(order.procurementCompletionRate) || 0) > 0
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
  stripWarehousingNode: stripWarehousingNode,
  defaultNodes: defaultNodes,
  clampPercent: clampPercent,
  getNodeIndexFromProgress: getNodeIndexFromProgress,
  getProgressFromNodeIndex: getProgressFromNodeIndex,
  parseProgressNodes: parseProgressNodes,
  resolveNodesFromOrder: resolveNodesFromOrder,
  getNodeRateFromOrder: getNodeRateFromOrder,
  buildProcessNodesWithRates: buildProcessNodesWithRates,
  extractChildrenMap: extractChildrenMap,
  calcOrderProgress: calcOrderProgress,
  STAGE_RATE_MAP: STAGE_RATE_MAP,
};