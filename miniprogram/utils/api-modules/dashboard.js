/**
 * Dashboard API（仪表盘 - 小程序端）
 * 对齐 PC 端 frontend/src/modules/dashboard/ 调用
 */
const { ok } = require('./helpers');

module.exports = {
  /**
   * 延期环节按阶段分组统计
   * 对应 PC 端 GET /dashboard/delayed-stage-breakdown
   * @returns { sampleDelayed: [{ stageName, count, items }], bulkDelayed: [...], sampleTotal, bulkTotal }
   */
  getDelayedStageBreakdown: function () {
    return ok('/api/dashboard/delayed-stage-breakdown', 'GET', {});
  },
};
