/**
 * 样板生产扫码处理器（样衣独立逻辑）
 *
 * 样衣流程是独立的父子关系逻辑，与大货完全分开：
 * - 样衣开发：BOM → 纸样 → 单价 → 二次工艺 → 生产制单（PC端配置）
 * - 样衣生产：领取 → 车板 → 跟单 → 完成 → 审核 → 入库
 * - 使用 patternId 识别（不使用菲号）
 * - 一个样衣一个二维码，父子关系在PC端配置
 *
 * @author GitHub Copilot
 * @date 2026-05-31
 */

// 样衣生产操作类型（5个基本操作）
const SAMPLE_OPERATIONS = [
  { key: 'RECEIVE', label: '领取样衣', color: '#1890ff', icon: 'scan' },
  { key: 'PLATE', label: '车板', color: '#722ed1', icon: 'tool' },
  { key: 'FOLLOW_UP', label: '跟单确认', color: '#fa8c16', icon: 'check-circle' },
  { key: 'COMPLETE', label: '完成确认', color: '#52c41a', icon: 'check' },
  { key: 'WAREHOUSE_IN', label: '样衣入库', color: '#13c2c2', icon: 'inbox' },
];

// 样衣开发阶段（PC端配置）
const DEV_STAGES = [
  { key: 'bom', name: 'BOM' },
  { key: 'pattern', name: '纸样' },
  { key: 'process', name: '单价' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'production', name: '生产制单' },
];

async function handlePatternScan(handler, parsedData, manualScanType) {
  const patternId = parsedData.patternId || parsedData.scanCode;
  if (!patternId) {
    return handler._errorResult('无效的样衣二维码');
  }

  try {
    // 获取样衣详情
    const patternDetail = await getPatternDetail(handler, patternId);
    if (!patternDetail) {
      return handler._errorResult('样衣记录不存在');
    }

    // 获取样衣扫码记录，判断当前可执行的操作
    const scanRecords = await getPatternScanRecords(handler, patternId);
    
    // 获取PC端配置的工序配置
    let processConfig = null;
    let hasProcessSystem = false;
    let operationOptions = [];
    
    try {
      processConfig = await getPatternProcessConfig(handler, patternId);
      if (processConfig && processConfig.length > 0) {
        hasProcessSystem = true;
        operationOptions = buildProcessOperationOptions(processConfig, scanRecords, patternDetail, manualScanType);
      }
    } catch (e) {
      console.warn('[PatternScanProcessor] 获取工序配置失败，使用默认流程:', e);
    }
    
    // 如果没有工序配置或工序配置为空，使用默认流程
    if (!hasProcessSystem || operationOptions.length === 0) {
      operationOptions = buildSampleOperationOptions(patternDetail, scanRecords, manualScanType);
    }
    
    if (operationOptions.length === 0) {
      return handler._errorResult('该样衣没有可执行操作，请检查样衣状态');
    }

    // 选择默认操作（如果指定了手动扫码类型，优先匹配）
    const selected = pickSelectedOperation(operationOptions, manualScanType);

    return {
      success: true,
      needConfirm: true,
      scanMode: handler.SCAN_MODE.PATTERN,
      data: {
        ...parsedData,
        patternId: patternId,
        patternDetail: patternDetail,
        operationType: selected.value,
        operationLabel: selected.label,
        operationOptions: operationOptions,
        styleNo: patternDetail.styleNo || parsedData.styleNo,
        color: patternDetail.color || parsedData.color,
        quantity: patternDetail.quantity,
        status: patternDetail.status,
        hasProcessSystem: hasProcessSystem, // 样衣使用工序系统
      },
      message: '请确认样衣操作',
    };
  } catch (e) {
    console.error('[PatternScanProcessor] 样衣扫码失败:', e);
    return handler._errorResult(e.errMsg || e.message || '样衣扫码失败');
  }
}

/**
 * 构建样衣操作选项
 * 根据样衣状态和扫码记录，判断下一步可执行的操作
 */
function buildSampleOperationOptions(patternDetail, scanRecords, manualScanType) {
  const options = [];
  const status = String(patternDetail.status || '').toUpperCase();
  
  // 提取已完成的操作类型
  const completedOps = new Set(
    scanRecords
      .filter(function(r) { return r.operationType && r.success !== false; })
      .map(function(r) { return String(r.operationType).toUpperCase(); })
  );

  // 根据样衣状态和已完成操作，构建可选操作
  // 样衣流程：PENDING(待领取) → IN_PROGRESS(制作中) → COMPLETED(已完成) → 审核 → WAREHOUSE_IN(已入库)
  
  if (status === 'PENDING' || !completedOps.has('RECEIVE')) {
    // 待领取状态，只能领取
    options.push({
      value: 'RECEIVE',
      label: '领取样衣',
      icon: 'scan',
    });
  } else if (status === 'IN_PROGRESS' || status === 'RECEIVED') {
    // 制作中，可以车板、跟单、完成
    if (!completedOps.has('PLATE')) {
      options.push({
        value: 'PLATE',
        label: '车板',
        icon: 'tool',
      });
    }
    if (!completedOps.has('FOLLOW_UP')) {
      options.push({
        value: 'FOLLOW_UP',
        label: '跟单确认',
        icon: 'check-circle',
      });
    }
    if (!completedOps.has('COMPLETE')) {
      options.push({
        value: 'COMPLETE',
        label: '完成确认',
        icon: 'check',
      });
    }
  } else if (status === 'COMPLETED') {
    // 已完成，需要审核
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    
    if (reviewStatus === 'APPROVED' || reviewResult === 'APPROVED') {
      // 审核通过，可以入库
      if (!completedOps.has('WAREHOUSE_IN')) {
        options.push({
          value: 'WAREHOUSE_IN',
          label: '样衣入库',
          icon: 'inbox',
        });
      }
    } else if (reviewStatus === 'REWORK' || reviewResult === 'REWORK') {
      // 返修状态，可以重新车板
      options.push({
        value: 'PLATE',
        label: '返修车板',
        icon: 'tool',
      });
      options.push({
        value: 'COMPLETE',
        label: '返修完成',
        icon: 'check',
      });
    } else {
      // 待审核或其他状态，提示需要审核
      options.push({
        value: 'REVIEW',
        label: '样衣审核',
        icon: 'eye',
      });
    }
  } else if (status === 'WAREHOUSE_IN') {
    // 已入库，可以出库或归还
    options.push({
      value: 'WAREHOUSE_OUT',
      label: '样衣出库',
      icon: 'export',
    });
    options.push({
      value: 'WAREHOUSE_RETURN',
      label: '样衣归还',
      icon: 'rollback',
    });
  }

  return options;
}

/**
 * 获取样衣详情
 */
async function getPatternDetail(handler, patternId) {
  try {
    const res = await handler.api.production.getPatternDetail(patternId);
    return res || null;
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣详情失败:', e);
    return null;
  }
}

/**
 * 获取样衣扫码记录
 */
async function getPatternScanRecords(handler, patternId) {
  try {
    const list = await handler.api.production.getPatternScanRecords(patternId);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣扫码记录失败:', e);
    return [];
  }
}

/**
 * 获取样衣工序配置
 */
async function getPatternProcessConfig(handler, patternId) {
  try {
    const config = await handler.api.production.getPatternProcessConfig(patternId);
    return Array.isArray(config) ? config : [];
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣工序配置失败:', e);
    return [];
  }
}

/**
 * 基于工序配置构建操作选项
 * 核心逻辑：只显示当前可执行的工序，已完成的不显示
 */
function buildProcessOperationOptions(processConfig, scanRecords, patternDetail, manualScanType) {
  if (!processConfig || processConfig.length === 0) {
    return [];
  }
  
  // 提取已完成的工序
  const completedProcesses = new Set();
  if (scanRecords && Array.isArray(scanRecords)) {
    scanRecords.forEach(function(record) {
      const opType = String(record.operationType || '').trim();
      const processName = String(record.processName || '').trim();
      if (opType) completedProcesses.add(opType);
      if (processName) completedProcesses.add(processName);
    });
  }
  
  const options = [];
  const status = String(patternDetail.status || '').toUpperCase();
  
  // 检查是否需要先领取
  const needReceive = (status === 'PENDING' || status === '') && !completedProcesses.has('RECEIVE') && !completedProcesses.has('领取');
  if (needReceive) {
    options.push({
      value: 'RECEIVE',
      label: '领取样衣',
      icon: 'scan',
      processName: '领取样衣',
      progressStage: '采购',
      scanType: 'procurement'
    });
    return options;
  }
  
  // 找出第一个未完成的工序，只显示它
  let foundFirstPending = false;
  for (let i = 0; i < processConfig.length; i++) {
    const config = processConfig[i];
    const processName = String(config.processName || config.operationType || '').trim();
    const progressStage = String(config.progressStage || processName).trim();
    const scanType = String(config.scanType || 'production').trim();
    const isCompleted = completedProcesses.has(processName) || completedProcesses.has(config.operationType);
    
    if (isCompleted) {
      continue; // 跳过已完成的
    }
    
    if (!foundFirstPending) {
      // 第一个未完成的工序，显示给用户选择
      options.push({
        value: processName,
        label: processName,
        icon: 'tool',
        processName: processName,
        progressStage: progressStage,
        scanType: scanType,
        sortOrder: config.sortOrder || i
      });
      foundFirstPending = true;
    }
  }
  
  // 如果所有工序都完成了，检查是否可以入库
  if (!foundFirstPending && (status === 'COMPLETED' || status === 'PRODUCTION_COMPLETED')) {
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    if (reviewStatus === 'APPROVED' || reviewResult === 'APPROVED') {
      if (!completedProcesses.has('WAREHOUSE_IN') && !completedProcesses.has('入库')) {
        options.push({
          value: 'WAREHOUSE_IN',
          label: '样衣入库',
          icon: 'inbox',
          processName: '样衣入库',
          progressStage: '入库',
          scanType: 'warehouse'
        });
      }
    }
  }
  
  return options;
}

/**
 * 规范化手动扫码类型
 */
function normalizeManualType(manualScanType) {
  if (!manualScanType) return '';
  const typeMap = {
    receive: 'RECEIVE',
    plate: 'PLATE',
    followup: 'FOLLOW_UP',
    follow_up: 'FOLLOW_UP',
    complete: 'COMPLETE',
    review: 'REVIEW',
    warehouse: 'WAREHOUSE_IN',
    warehouse_in: 'WAREHOUSE_IN',
    out: 'WAREHOUSE_OUT',
    warehouse_out: 'WAREHOUSE_OUT',
    return: 'WAREHOUSE_RETURN',
    warehouse_return: 'WAREHOUSE_RETURN',
  };
  const normalized = typeMap[manualScanType] || String(manualScanType || '').toUpperCase();
  return normalized;
}

/**
 * 选择默认操作（优先匹配手动扫码类型）
 */
function pickSelectedOperation(operationOptions, manualScanType) {
  const manual = normalizeManualType(manualScanType);
  if (manual) {
    const matched = operationOptions.find(function(item) { return item.value === manual; });
    if (matched) return matched;
  }
  // 默认返回第一个可选操作
  return operationOptions[0];
}

module.exports = {
  handlePatternScan: handlePatternScan,
  getPatternDetail: getPatternDetail,
  getPatternScanRecords: getPatternScanRecords,
  buildSampleOperationOptions: buildSampleOperationOptions,
  SAMPLE_OPERATIONS: SAMPLE_OPERATIONS,
  DEV_STAGES: DEV_STAGES,
};
