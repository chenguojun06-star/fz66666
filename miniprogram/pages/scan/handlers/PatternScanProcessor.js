/**
 * 样板生产扫码处理器（工序系统版）
 *
 * 样衣走独立的工序系统（6大父节点+子工序），逻辑与大货一模一样：
 * - 必须关联生产订单
 * - 构建父子工序操作选项（采购/裁剪/二次工艺/车缝/尾部/入库）
 * - 扫码提交走大货统一的 execute 接口
 *
 * @author GitHub Copilot
 * @date 2026-05-31
 */

const StageDetector = require('../services/StageDetector');

const PARENT_STAGES = [
  { key: 'procurement', label: '采购', color: '#1890ff' },
  { key: 'cutting', label: '裁剪', color: '#722ed1' },
  { key: 'secondary', label: '二次工艺', color: '#eb2f96' },
  { key: 'sewing', label: '车缝', color: '#fa8c16' },
  { key: 'tail', label: '尾部', color: '#13c2c2' },
  { key: 'warehousing', label: '入库', color: '#52c41a' },
];

const STAGE_KEY_MAP = {
  '采购': 'procurement', 'procurement': 'procurement',
  '裁剪': 'cutting', 'cutting': 'cutting',
  '二次工艺': 'secondary', 'secondary': 'secondary',
  '绣花': 'secondary', '印花': 'secondary', '洗水': 'secondary', '染色': 'secondary',
  '车缝': 'sewing', 'sewing': 'sewing',
  '尾部': 'tail', 'tail': 'tail',
  '整烫': 'tail', '包装': 'tail',
  '入库': 'warehousing', 'warehousing': 'warehousing',
};

function resolveStageKey(name) {
  if (!name) return 'tail';
  if (STAGE_KEY_MAP[name]) return STAGE_KEY_MAP[name];
  const lower = name.toLowerCase();
  for (const k in STAGE_KEY_MAP) {
    if (lower.indexOf(k.toLowerCase()) >= 0 || lower.indexOf(STAGE_KEY_MAP[k]) >= 0) {
      return STAGE_KEY_MAP[k];
    }
  }
  return 'tail';
}

async function handlePatternScan(handler, parsedData, manualScanType) {
  const patternId = parsedData.patternId || parsedData.scanCode;
  if (!patternId) {
    return handler._errorResult('无效的样板生产二维码');
  }

  try {
    const patternDetail = await getPatternDetail(handler, patternId);
    if (!patternDetail) {
      return handler._errorResult('样板生产记录不存在');
    }

    let linkedOrder = await getPatternLinkedOrder(handler, patternId);
    let orderId = linkedOrder && (linkedOrder.orderId || (linkedOrder.data && linkedOrder.data.orderId));
    let orderNo = linkedOrder && (linkedOrder.orderNo || (linkedOrder.data && linkedOrder.data.orderNo));

    // 如果没有生产订单，尝试自动创建一个
    if (!orderId && !orderNo) {
      try {
        await handler.api.post(`/production/pattern/${patternId}/create-sample-order`);
        // 重新查询订单信息
        linkedOrder = await getPatternLinkedOrder(handler, patternId);
        orderId = linkedOrder && (linkedOrder.orderId || (linkedOrder.data && linkedOrder.data.orderId));
        orderNo = linkedOrder && (linkedOrder.orderNo || (linkedOrder.data && linkedOrder.data.orderNo));
      } catch (e) {
        console.warn('[PatternScanProcessor] 自动创建样衣订单失败', e);
      }
    }

    if (!orderId && !orderNo) {
      return handler._errorResult('该样衣无法创建生产订单，请联系管理员检查');
    }

    // === 关联了生产订单：走完整的工序系统逻辑 ===
    return await handlePatternWithProcessSystem(handler, parsedData, patternId, patternDetail, orderId, orderNo, manualScanType);
  } catch (e) {
    console.error('[PatternScanProcessor] 样板生产扫码失败:', e);
    return handler._errorResult(e.errMsg || e.message || '样板生产扫码失败');
  }
}

async function handlePatternWithProcessSystem(handler, parsedData, patternId, patternDetail, orderId, orderNo, manualScanType) {
  const detector = new StageDetector(handler.api);

  let orderDetail = null;
  try {
    const orderRes = await handler.api.production.orderDetail(orderId || orderNo);
    if (orderRes && orderRes.data) {
      orderDetail = orderRes.data;
    } else if (orderRes && orderRes.records && orderRes.records.length > 0) {
      orderDetail = orderRes.records[0];
    } else if (orderRes && orderRes.id) {
      orderDetail = orderRes;
    }
  } catch (e) {
    console.warn('[PatternScanProcessor] 获取样衣生产订单失败:', e);
  }

  if (!orderDetail) {
    return handler._errorResult('样衣生产订单不存在');
  }

  let bundleNo = '01';
  let bundleId = '';
  try {
    const bundleList = await handler.api.production.listBundles(orderNo || orderDetail.orderNo, 1, 10);
    const records = bundleList && (bundleList.records || bundleList.data || bundleList);
    if (Array.isArray(records) && records.length > 0) {
      bundleNo = String(records[0].bundleNo || '01');
      bundleId = String(records[0].id || '');
    }
  } catch (e) {
    console.warn('[PatternScanProcessor] 获取样衣菲号列表失败:', e);
  }

  let processConfig = [];
  try {
    processConfig = await detector.loadProcessConfig(orderNo || orderDetail.orderNo);
  } catch (e) {
    console.warn('[PatternScanProcessor] 加载样衣工序配置失败:', e);
  }

  let scanRecords = [];
  try {
    scanRecords = await getPatternScanRecords(handler, patternId);
  } catch (e) {
    console.warn('[PatternScanProcessor] 获取样衣扫码记录失败:', e);
  }

  const scannedProcessNames = new Set(
    scanRecords
      .filter(function(r) { return r.processName && r.success !== false; })
      .map(function(r) { return r.processName; }),
  );
  const scannedProcessNamesArr = Array.from(scannedProcessNames);

  const stageGroups = buildStageGroups(processConfig, scannedProcessNames);

  const operationOptions = buildProcessOperationOptions(stageGroups, processConfig, scannedProcessNames, manualScanType);

  if (operationOptions.length === 0) {
    const allDone = processConfig.length > 0 && processConfig.every(function(p) { return scannedProcessNames.has(p.processName); });
    if (allDone) {
      const allProcessesAll = processConfig.map(function(p) {
        return {
          processName: p.processName,
          progressStage: p.progressStage || p.processName,
          scanType: p.scanType || 'production',
          unitPrice: Number(p.price || 0),
          sortOrder: p.sortOrder || 0,
        };
      });
      return {
        success: true,
        needConfirm: true,
        scanMode: handler.SCAN_MODE.PATTERN,
        data: {
          ...parsedData,
          patternId: patternId,
          patternDetail: patternDetail,
          orderId: orderId,
          orderNo: orderNo,
          bundleNo: bundleNo,
          bundleId: bundleId,
          processName: 'ALL_COMPLETED',
          operationType: 'ALL_COMPLETED',
          operationLabel: '全部工序已完成',
          operationOptions: [],
          stageResult: {
            allBundleProcesses: allProcessesAll,
            scannedProcessNames: scannedProcessNamesArr,
            processName: 'ALL_COMPLETED',
          },
          stageGroups: stageGroups,
          styleNo: patternDetail.styleNo || parsedData.styleNo,
          color: patternDetail.color || parsedData.color,
          quantity: patternDetail.quantity,
          status: patternDetail.status,
          hasProcessSystem: true,
        },
        message: '全部工序已完成',
      };
    }
    return handler._errorResult('该样衣没有可执行工序，请检查工序配置');
  }

  const selected = pickSelectedOperation(operationOptions, manualScanType);
  const allProcesses = processConfig.map(function(p) {
    return {
      processName: p.processName,
      progressStage: p.progressStage || p.processName,
      scanType: p.scanType || 'production',
      unitPrice: Number(p.price || 0),
      sortOrder: p.sortOrder || 0,
    };
  });

  return {
    success: true,
    needConfirm: true,
    scanMode: handler.SCAN_MODE.PATTERN,
    data: {
      ...parsedData,
      patternId: patternId,
      patternDetail: patternDetail,
      orderId: orderId,
      orderNo: orderNo,
      bundleNo: bundleNo,
      bundleId: bundleId,
      processName: selected.value,
      operationType: selected.value,
      operationLabel: selected.label,
      operationOptions: operationOptions,
      stageResult: {
        allBundleProcesses: allProcesses,
        scannedProcessNames: scannedProcessNamesArr,
        processName: selected.value,
      },
      styleNo: patternDetail.styleNo || parsedData.styleNo,
      color: patternDetail.color || parsedData.color,
      quantity: patternDetail.quantity,
      status: patternDetail.status,
      hasProcessSystem: true,
      stageGroups: stageGroups,
      processConfig: processConfig,
    },
    message: '请确认样衣工序操作',
  };
}

function buildStageGroups(processConfig, scannedProcessNames) {
  const groupMap = {};
  for (let i = 0; i < PARENT_STAGES.length; i++) {
    groupMap[PARENT_STAGES[i].key] = {
      key: PARENT_STAGES[i].key,
      label: PARENT_STAGES[i].label,
      color: PARENT_STAGES[i].color,
      subProcesses: [],
      completedCount: 0,
      totalCount: 0,
    };
  }

  for (let j = 0; j < processConfig.length; j++) {
    const p = processConfig[j];
    let stageKey = resolveStageKey(p.progressStage || p.processName);
    if (!groupMap[stageKey]) {
      stageKey = 'tail';
    }
    const isCompleted = scannedProcessNames.has(p.processName);
    groupMap[stageKey].subProcesses.push({
      processName: p.processName,
      progressStage: p.progressStage || p.processName,
      scanType: p.scanType || 'production',
      unitPrice: Number(p.price || 0),
      sortOrder: p.sortOrder || 0,
      completed: isCompleted,
    });
    groupMap[stageKey].totalCount++;
    if (isCompleted) groupMap[stageKey].completedCount++;
  }

  return PARENT_STAGES.map(function(s) { return groupMap[s.key]; }).filter(function(g) { return g.totalCount > 0; });
}

function buildProcessOperationOptions(stageGroups, processConfig, scannedProcessNames, manualScanType) {
  const options = [];
  for (let i = 0; i < processConfig.length; i++) {
    const p = processConfig[i];
    if (!scannedProcessNames.has(p.processName)) {
      const stageKey = resolveStageKey(p.progressStage || p.processName);
      let stageLabel = '';
      for (let j = 0; j < PARENT_STAGES.length; j++) {
        if (PARENT_STAGES[j].key === stageKey) {
          stageLabel = PARENT_STAGES[j].label;
          break;
        }
      }
      options.push({
        value: p.processName,
        label: p.processName + (stageLabel ? '（' + stageLabel + '）' : ''),
        icon: '',
        processName: p.processName,
        progressStage: p.progressStage || p.processName,
        scanType: p.scanType || 'production',
        unitPrice: Number(p.price || 0),
        stageKey: stageKey,
      });
    }
  }
  return options;
}

async function getPatternDetail(handler, patternId) {
  try {
    const res = await handler.api.production.getPatternDetail(patternId);
    return res || null;
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样板生产详情失败:', e);
    return null;
  }
}

async function getPatternLinkedOrder(handler, patternId) {
  try {
    const res = await handler.api.production.getPatternLinkedOrder(patternId);
    return res || null;
  } catch (e) {
    return null;
  }
}

async function getPatternScanRecords(handler, patternId) {
  try {
    const list = await handler.api.production.getPatternScanRecords(patternId);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣扫码记录失败:', e);
    return [];
  }
}

function normalizeManualType(manualScanType) {
  if (!manualScanType) return '';
  const typeMap = {
    receive: 'RECEIVE',
    plate: 'PLATE',
    followup: 'FOLLOW_UP',
    complete: 'COMPLETE',
    review: 'REVIEW',
    warehouse: 'WAREHOUSE_IN',
    out: 'WAREHOUSE_OUT',
    return: 'WAREHOUSE_RETURN',
  };
  return typeMap[manualScanType] || String(manualScanType || '').toUpperCase();
}

function pickSelectedOperation(operationOptions, manualScanType) {
  const manual = normalizeManualType(manualScanType);
  if (manual) {
    const matched = operationOptions.find(function(item) { return item.value === manual; });
    if (matched) return matched;
  }
  return operationOptions[0];
}

module.exports = {
  handlePatternScan: handlePatternScan,
  getPatternDetail: getPatternDetail,
  getPatternScanRecords: getPatternScanRecords,
  PARENT_STAGES: PARENT_STAGES,
  resolveStageKey: resolveStageKey,
  buildStageGroups: buildStageGroups,
};
