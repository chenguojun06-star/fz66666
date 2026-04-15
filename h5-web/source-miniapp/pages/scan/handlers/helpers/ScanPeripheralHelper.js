/**
 * 扫码外围辅助功能
 *
 * 职责：批量扫码、权限验证、统计查询等非核心扫码流程
 * 从 ScanHandler.js 拆分，保持主文件精简
 */

/**
 * 格式化日期为 YYYY-MM-DD HH:MM:SS
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
function formatLocalDateTime(date) {
  const y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${d} ${h}:${m}:${s}`;
}

/**
 * 批量扫码处理（支持连续扫码场景）
 * @param {Object} handler - ScanHandler 实例
 * @param {Array<string>} scanCodes - 扫码结果数组
 * @returns {Promise<Object>} 批量处理结果
 */
async function handleBatchScan(handler, scanCodes) {
  const results = {
    total: scanCodes.length,
    success: 0,
    failed: 0,
    details: [],
  };

  for (let i = 0; i < scanCodes.length; i++) {
    const code = scanCodes[i];
    const result = await handler.handleScan(code);

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }

    results.details.push({
      index: i + 1,
      code: code,
      success: result.success,
      message: result.message,
    });
  }

  return results;
}

/**
 * 验证扫码权限
 * @param {Object} options - ScanHandler 的 options 配置
 * @returns {Object} 验证结果 { valid, message }
 */
function validateScanPermission(options) {
  const factory = options.getCurrentFactory ? options.getCurrentFactory() : null;
  const worker = options.getCurrentWorker ? options.getCurrentWorker() : null;

  if (!factory) {
    return { valid: false, message: '请先选择工厂' };
  }

  if (!worker) {
    return { valid: false, message: '请先登录' };
  }

  return { valid: true };
}

/**
 * 获取扫码统计信息
 * @param {Object} api - API 实例
 * @returns {Promise<Object>} 统计信息
 */
async function getScanStatistics(api) {
  try {
    const today = new Date();
    const startTime = formatLocalDateTime(new Date(today.setHours(0, 0, 0, 0)));
    const endTime = formatLocalDateTime(new Date(today.setHours(23, 59, 59, 999)));

    const res = await api.production.myScanHistory({
      page: 1,
      pageSize: 100,
      startTime: startTime,
      endTime: endTime,
    });

    const records = res && res.records ? res.records : [];
    const totalQuantity = records.reduce((sum, r) => sum + (r.quantity || 0), 0);

    return {
      todayScans: records.length,
      todayQuantity: totalQuantity,
      recentRecords: records.slice(0, 5),
    };
  } catch (e) {
    console.error('[ScanPeripheralHelper] 获取统计失败:', e);
    return {
      todayScans: 0,
      todayQuantity: 0,
      recentRecords: [],
    };
  }
}

module.exports = {
  formatLocalDateTime,
  handleBatchScan,
  validateScanPermission,
  getScanStatistics,
};
