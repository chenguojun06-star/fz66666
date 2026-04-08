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
    return handler._errorResult(e.errMsg || e.message || '样板生产扫码失败');
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
    review: 'REVIEW',
    warehouse: 'WAREHOUSE_IN',
    out: 'WAREHOUSE_OUT',
    return: 'WAREHOUSE_RETURN',
  };
  return typeMap[manualScanType] || String(manualScanType || '').toUpperCase();
}

function buildPatternOperationOptions({ patternDetail, processConfig: _processConfig, scanRecords, manualScanType }) {
  const status = String(patternDetail?.status || '').toUpperCase();
  const reviewStatus = String(patternDetail?.reviewStatus || '').toUpperCase();
  const reviewResult = String(patternDetail?.reviewResult || '').toUpperCase();
  const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';
  const scannedSet = new Set(
    (scanRecords || [])
      .map(item => String(item?.operationType || '').trim())
      .filter(Boolean),
  );

  const options = [];

  // ── 阶段一：仓库操作（优先判断，状态明确）──────────────────────────
  // 已入库 → 只能出库
  if (scannedSet.has('WAREHOUSE_IN') && !scannedSet.has('WAREHOUSE_OUT')) {
    options.push({ value: 'WAREHOUSE_OUT', label: '样衣出库', icon: '' });
    return options; // 已入库阶段只展示出库
  }
  // 已出库 → 只能归还
  if (scannedSet.has('WAREHOUSE_OUT') && !scannedSet.has('WAREHOUSE_RETURN')) {
    options.push({ value: 'WAREHOUSE_RETURN', label: '样衣归还', icon: '' });
    return options; // 已出库阶段只展示归还
  }
  // 已归还 → 可再次出库（循环借还）
  if (scannedSet.has('WAREHOUSE_RETURN')) {
    options.push({ value: 'WAREHOUSE_OUT', label: '样衣出库', icon: '' });
    return options;
  }

  // ── 阶段二：待领取 → 领取操作 ───────────────────────────────────────
  if (status === 'PENDING') {
    options.push({ value: 'RECEIVE', label: '领取样板', icon: '' });
    return options; // 待领取状态只展示领取
  }

  // ── 阶段三：生产完成，等待入库 ─────────────────────────────────────
  if ((status === 'PRODUCTION_COMPLETED' || status === 'COMPLETED') && !reviewApproved) {
    options.push({ value: 'REVIEW', label: '样衣审核', icon: '' });
    options.push({ value: 'WAREHOUSE_IN', label: '样衣入库（将先审核）', icon: '' });
    return options;
  }

  if ((status === 'PRODUCTION_COMPLETED' || status === 'COMPLETED') && reviewApproved && !scannedSet.has('WAREHOUSE_IN')) {
    options.push({ value: 'WAREHOUSE_IN', label: '样衣入库', icon: '' });
    return options; // 已完成只展示入库，不展示其他生产工序
  }

  // ── 阶段四：生产中，展示固定6个父进度工序（未扫的才显示）─────────
  const PARENT_PRODUCTION_STAGES = [
    { value: 'PROCUREMENT', label: '采购',    icon: '' },
    { value: 'CUTTING',     label: '裁剪',    icon: '' },
    { value: 'SECONDARY',   label: '二次工艺', icon: '' },
    { value: 'SEWING',      label: '车缝',    icon: '' },
    { value: 'TAIL',        label: '尾部',    icon: '' },
  ];
  PARENT_PRODUCTION_STAGES.forEach(stage => {
    if (stage.value === 'SECONDARY') {
      // 无二次工艺：显示不可点击的提示项（不计入已扫逻辑）
      if (patternDetail.hasSecondaryProcess === 0) {
        options.push({ value: 'NO_SECONDARY', label: '无二次工艺', icon: '⊘', disabled: true });
        return;
      }
    }
    if (!scannedSet.has(stage.value)) {
      options.push(stage);
    }
  });

  // 兜底
  if (options.length === 0) {
    const fallbackType = determinePatternOperation(patternDetail, manualScanType);
    options.push({
      value: fallbackType,
      label: getPatternSuccessMessage(fallbackType),
      icon: '',
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
      'procurement': 'PROCUREMENT',
      'cutting': 'CUTTING',
      'secondary': 'SECONDARY',
      'sewing': 'SEWING',
      'tail': 'TAIL',
      'review': 'REVIEW',
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
    case 'PRODUCTION_COMPLETED':
      if ((String(patternDetail?.reviewStatus || '').toUpperCase() === 'APPROVED')
        || (String(patternDetail?.reviewResult || '').toUpperCase() === 'APPROVED')) {
        return 'WAREHOUSE_IN';
      }
      return 'REVIEW';
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
    const operationType = String(data.operationType || '').toUpperCase();

    if (operationType === 'REVIEW') {
      const reviewRemark = String(data.remark || '').trim();
      const reviewResult = 'APPROVED';
      const res = await handler.api.production.reviewPattern(data.patternId, reviewResult, reviewRemark);
      if (res) {
        return {
          success: true,
          message: getPatternSuccessMessage('REVIEW'),
          data: res,
        };
      }
      return handler._errorResult('审核提交失败');
    }

    if (operationType === 'WAREHOUSE_IN') {
      const latestDetail = await getPatternDetail(handler, data.patternId);
      const latestReviewStatus = String(latestDetail?.reviewStatus || '').toUpperCase();
      const latestReviewResult = String(latestDetail?.reviewResult || '').toUpperCase();
      const reviewApproved = latestReviewStatus === 'APPROVED' || latestReviewResult === 'APPROVED';

      if (!reviewApproved) {
        const reviewRemark = String(data.remark || '').trim();
        const reviewResult = 'APPROVED';
        const reviewRes = await handler.api.production.reviewPattern(data.patternId, reviewResult, reviewRemark);
        if (!reviewRes) {
          return handler._errorResult('入库前自动审核失败');
        }
      }
    }

    const res = await handler.api.production.submitPatternScan({
      patternId: data.patternId,
      operationType,
      operatorRole: data.operatorRole || 'PLATE_WORKER',
      quantity: data.quantity,
      warehouseCode: data.warehouseCode,
      remark: data.remark,
    });

    if (res) {
      return {
        success: true,
        message: getPatternSuccessMessage(operationType),
        data: res,
      };
    }
    return handler._errorResult('提交失败');
  } catch (e) {
    console.error('[PatternScanProcessor] 提交样板扫码失败:', e);
    return handler._errorResult(e.errMsg || e.message || '提交失败');
  }
}

/**
 * 获取样板操作成功消息
 * @param {string} operationType - 操作类型
 * @returns {string} 成功消息
 */
function getPatternSuccessMessage(operationType) {
  const messages = {
    'RECEIVE': '领取成功',
    'PLATE': '车板扫码成功',
    'FOLLOW_UP': '跟单扫码成功',
    'COMPLETE': '完成确认成功',
    'PROCUREMENT': '采购完成',
    'CUTTING': '裁剪完成',
    'SECONDARY': '二次工艺完成',
    'SEWING': '车缝完成',
    'TAIL': '尾部完成',
    'REVIEW': '样衣审核通过',
    'WAREHOUSE_IN': '样衣入库成功',
    'WAREHOUSE_OUT': '样衣出库成功',
    'WAREHOUSE_RETURN': '样衣归还成功',
  };
  return messages[operationType] || '操作成功';
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
