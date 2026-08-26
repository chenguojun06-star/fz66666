/**
 * 样板生产扫码处理器（样衣独立逻辑）
 *
 * 样衣流程与大货共享同一套父子工序模型：
 * - 父工序顺序：采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库
 * - 样衣开发：BOM → 纸样 → 单价 → 二次工艺 → 生产制单（PC端配置）
 * - 样衣生产：由PC端配置的工序驱动，支持动态工序
 * - 使用 patternId 识别（不使用菲号）
 * - 一个样衣一个二维码，父子关系在PC端配置
 * - 门禁校验：与后端 ProductionScanStageSupport 对齐
 *
 * @author GitHub Copilot
 * @date 2026-05-31
 */

// 样衣扫码统一走工序系统（D-165）：款式必须配置开发工序，未配置在入口直接拦截

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
      console.warn('[PatternScanProcessor] 获取工序配置失败:', e);
    }

    // D-165：未配置工序一律拦截，不再走默认四步流程
    if (!hasProcessSystem) {
      return handler._errorResult('该款【' + (patternDetail.styleNo || '') + '】未配置开发工序，请先在PC端款式资料中配置工序后再扫码');
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
 * 基于工序配置构建工序列表（MES 报工模型）
 * 后端 getPatternProcessConfig 已返回每道工序的 status/claimedBy/claimedByMe：
 * - PENDING（待领取）→ 可「领取」
 * - CLAIMED（他人领取制作中）→ 显示领取人，不可操作
 * - CLAIMED + claimedByMe（本人领取）→ 可「完成报工」
 * - COMPLETED（已完成）→ 显示完成
 * 全部完成后 → 入库操作
 */
function buildProcessOperationOptions(processConfig, scanRecords, patternDetail, _manualScanType) {
  if (!processConfig || processConfig.length === 0) {
    return [];
  }

  const options = [];
  for (let i = 0; i < processConfig.length; i++) {
    const config = processConfig[i];
    const processName = String(config.processName || config.operationType || '').trim();
    if (!processName) continue;
    const progressStage = String(config.progressStage || processName).trim();
    const scanType = String(config.scanType || 'production').trim();
    const procStatus = String(config.status || 'PENDING').toUpperCase();

    const option = {
      value: processName,
      label: processName,
      icon: 'tool',
      processName: processName,
      progressStage: progressStage,
      scanType: scanType,
      sortOrder: config.sortOrder || i,
      unitPrice: config.unitPrice != null ? config.unitPrice : (config.price != null ? config.price : null),
      status: procStatus,
      claimedBy: config.claimedBy || '',
      claimedByMe: !!config.claimedByMe,
    };

    if (procStatus === 'COMPLETED') {
      option.icon = 'check-circle';
    } else if (procStatus === 'CLAIMED') {
      if (option.claimedByMe) {
        option.icon = 'tool'; // 本人领取制作中 → 可完成报工
      } else {
        option.icon = 'lock';
        option.locked = true;
        option.lockReason = option.claimedBy ? (option.claimedBy + ' 制作中') : '已领取';
      }
    }
    options.push(option);
  }

  // 全部工序完成后，追加入库操作（审核通过后）
  const allCompleted = options.length > 0 && options.every(function(o) { return o.status === 'COMPLETED'; });
  const status = String(patternDetail.status || '').toUpperCase();
  if (allCompleted || status === 'PRODUCTION_COMPLETED' || status === 'COMPLETED') {
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    if (reviewStatus === 'APPROVED' || reviewResult === 'APPROVED') {
      options.push({
        value: 'WAREHOUSE_IN',
        label: '样衣入库',
        icon: 'inbox',
        processName: '样衣入库',
        progressStage: '入库',
        scanType: 'warehouse',
        status: 'PENDING',
      });
    } else {
      options.push({
        value: 'REVIEW',
        label: '样衣审核',
        icon: 'eye',
        processName: '样衣审核',
        progressStage: '尾部',
        scanType: 'production',
        status: 'PENDING',
      });
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
};
