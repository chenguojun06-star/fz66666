/**
 * 样板生产扫码处理器
 *
 * 从 ScanHandler 中提取的样板生产专用逻辑，包括：
 * - 样板扫码解析与确认
 * - 样板生产详情获取
 * - 操作类型自动判定（领取/车板/跟单/完成/入库）
 * - 样板扫码提交
 *
 * @author GitHub Copilot
 * @date 2026-02-10
 */

/**
 * 处理样板生产扫码
 * 样板生产二维码格式：{"type":"pattern","id":"xxx","styleNo":"ST001","color":"黑色"}
 *
 * @param {Object} handler - ScanHandler 实例（提供 api、_errorResult、SCAN_MODE）
 * @param {Object} parsedData - 解析后的二维码数据
 * @param {string} manualScanType - 手动指定的操作类型
 * @returns {Promise<Object>} 处理结果
 */
async function handlePatternScan(handler, parsedData, manualScanType) {
  const patternId = parsedData.patternId || parsedData.scanCode;

  if (!patternId) {
    return handler._errorResult('无效的样板生产二维码');
  }

  try {
    // 获取样板生产详情（用于展示确认）
    const patternDetail = await getPatternDetail(handler, patternId);
    if (!patternDetail) {
      return handler._errorResult('样板生产记录不存在');
    }

    const [processConfig, scanRecords] = await Promise.all([
      getPatternProcessConfig(handler, patternId),
      getPatternScanRecords(handler, patternId),
    ]);

    const operationOptions = buildPatternOperationOptions({
      patternDetail,
      processConfig,
      scanRecords,
      manualScanType,
    });

    if (!operationOptions || operationOptions.length === 0) {
      return handler._errorResult('该样衣没有可执行工序，请检查工序配置');
    }

    const selected = pickSelectedOperation(operationOptions, manualScanType);

    // 返回需要确认的数据
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
        operationOptions,
        styleNo: patternDetail.styleNo || parsedData.styleNo,
        color: patternDetail.color || parsedData.color,
        quantity: patternDetail.quantity,
        status: patternDetail.status,
        designer: patternDetail.designer || parsedData.designer,
        patternDeveloper: patternDetail.patternDeveloper || parsedData.patternDeveloper,
      },
      message: '请确认样板生产操作',
    };
  } catch (e) {
    console.error('[PatternScanProcessor] 样板生产扫码失败:', e);
    return handler._errorResult(e.message || '样板生产扫码失败');
  }
}

/**
 * 获取样板生产详情
 * @param {Object} handler - ScanHandler 实例
 * @param {string} patternId - 样板 ID
 * @returns {Promise<Object|null>} 样板详情或null
 */
async function getPatternDetail(handler, patternId) {
  try {
    const res = await handler.api.production.getPatternDetail(patternId);
    return res || null;
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样板生产详情失败:', e);
    return null;
  }
}

async function getPatternProcessConfig(handler, patternId) {
  try {
    const list = await handler.api.production.getPatternProcessConfig(patternId);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣工序配置失败:', e);
    return [];
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
    warehouse: 'WAREHOUSE_IN',
    out: 'WAREHOUSE_OUT',
    return: 'WAREHOUSE_RETURN',
  };
  return typeMap[manualScanType] || String(manualScanType || '').toUpperCase();
}

function buildPatternOperationOptions({ patternDetail, processConfig, scanRecords, manualScanType }) {
  const status = String(patternDetail?.status || '').toUpperCase();
  const scannedSet = new Set(
    (scanRecords || [])
      .map(item => String(item?.operationType || '').trim())
      .filter(Boolean),
  );

  const options = [];

  if (status === 'PENDING' && !scannedSet.has('RECEIVE')) {
    options.push({ value: 'RECEIVE', label: '领取样衣', icon: '📥' });
  }

  const sortedConfig = (processConfig || [])
    .slice()
    .sort((a, b) => (Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0)));

  sortedConfig.forEach(item => {
    const value = String(item?.operationType || item?.processName || '').trim();
    if (!value) return;
    if (scannedSet.has(value)) return;

    const stage = String(item?.progressStage || '').trim();
    const processName = String(item?.processName || value).trim();
    const stageSuffix = stage && stage !== processName ? ` · ${stage}` : '';
    options.push({
      value,
      label: `${processName}${stageSuffix}`,
      icon: stage === '入库' || value === 'WAREHOUSE_IN' ? '📦' : '🧵',
    });
  });

  if (scannedSet.has('WAREHOUSE_IN') && !scannedSet.has('WAREHOUSE_OUT')) {
    options.push({ value: 'WAREHOUSE_OUT', label: '样衣出库', icon: '📤' });
  }
  if (scannedSet.has('WAREHOUSE_OUT') && !scannedSet.has('WAREHOUSE_RETURN')) {
    options.push({ value: 'WAREHOUSE_RETURN', label: '样衣归还', icon: '↩️' });
  }

  if (options.length === 0) {
    const fallbackType = determinePatternOperation(patternDetail, manualScanType);
    options.push({
      value: fallbackType,
      label: getPatternSuccessMessage(fallbackType).replace('✅ ', ''),
      icon: fallbackType === 'WAREHOUSE_IN'
        ? '📦'
        : (fallbackType === 'WAREHOUSE_OUT' ? '📤' : (fallbackType === 'WAREHOUSE_RETURN' ? '↩️' : '🧵')),
    });
  }

  return options;
}

function pickSelectedOperation(operationOptions, manualScanType) {
  const manual = normalizeManualType(manualScanType);
  if (manual) {
    const matched = operationOptions.find(item => item.value === manual);
    if (matched) return matched;
  }
  return operationOptions[0];
}

/**
 * 根据当前状态确定样板生产操作类型
 * @param {Object} patternDetail - 样板详情
 * @param {string} manualScanType - 手动指定的操作类型
 * @returns {string} 操作类型
 */
function determinePatternOperation(patternDetail, manualScanType) {
  // 如果手动指定了操作类型，优先使用
  if (manualScanType) {
    const typeMap = {
      'receive': 'RECEIVE',
      'plate': 'PLATE',
      'followup': 'FOLLOW_UP',
      'complete': 'COMPLETE',
      'warehouse': 'WAREHOUSE_IN',
      'out': 'WAREHOUSE_OUT',
      'return': 'WAREHOUSE_RETURN',
    };
    return typeMap[manualScanType] || manualScanType.toUpperCase();
  }

  // 根据当前状态自动判断
  const status = patternDetail.status;
  switch (status) {
    case 'PENDING':
      return 'RECEIVE';      // 待领取 → 领取
    case 'IN_PROGRESS':
      return 'PLATE';        // 制作中 → 车板
    case 'COMPLETED':
      return 'WAREHOUSE_IN'; // 已完成 → 入库
    default:
      return 'PLATE';
  }
}

/**
 * 提交样板生产扫码
 * @param {Object} handler - ScanHandler 实例
 * @param {Object} data - 扫码数据
 * @returns {Promise<Object>} 提交结果
 */
async function submitPatternScan(handler, data) {
  try {
    const res = await handler.api.production.submitPatternScan({
      patternId: data.patternId,
      operationType: data.operationType,
      operatorRole: data.operatorRole || 'PLATE_WORKER',
      quantity: data.quantity,
      warehouseCode: data.warehouseCode,
      remark: data.remark,
    });

    if (res) {
      return {
        success: true,
        message: getPatternSuccessMessage(data.operationType),
        data: res,
      };
    }
    return handler._errorResult('提交失败');
  } catch (e) {
    console.error('[PatternScanProcessor] 提交样板扫码失败:', e);
    return handler._errorResult(e.message || '提交失败');
  }
}

/**
 * 获取样板操作成功消息
 * @param {string} operationType - 操作类型
 * @returns {string} 成功消息
 */
function getPatternSuccessMessage(operationType) {
  const messages = {
    'RECEIVE': '✅ 领取成功',
    'PLATE': '✅ 车板扫码成功',
    'FOLLOW_UP': '✅ 跟单扫码成功',
    'COMPLETE': '✅ 完成确认成功',
    'WAREHOUSE_IN': '✅ 样衣入库成功',
    'WAREHOUSE_OUT': '✅ 样衣出库成功',
    'WAREHOUSE_RETURN': '✅ 样衣归还成功',
  };
  return messages[operationType] || '✅ 操作成功';
}

module.exports = {
  handlePatternScan,
  getPatternDetail,
  getPatternProcessConfig,
  getPatternScanRecords,
  determinePatternOperation,
  submitPatternScan,
  getPatternSuccessMessage,
};
