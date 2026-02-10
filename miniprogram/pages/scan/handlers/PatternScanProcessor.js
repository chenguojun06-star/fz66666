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

    // 确定操作类型
    const operationType = determinePatternOperation(patternDetail, manualScanType);

    // 返回需要确认的数据
    return {
      success: true,
      needConfirm: true,
      scanMode: handler.SCAN_MODE.PATTERN,
      data: {
        ...parsedData,
        patternId: patternId,
        patternDetail: patternDetail,
        operationType: operationType,
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
  };
  return messages[operationType] || '✅ 操作成功';
}

module.exports = {
  handlePatternScan,
  getPatternDetail,
  determinePatternOperation,
  submitPatternScan,
  getPatternSuccessMessage,
};
