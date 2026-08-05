/**
 * 员工打卡 API 模块
 * 仅手机端首页使用：上下班打卡 + 本月工时统计
 * 后端：/api/production/attendance/*
 */
const { ok } = require('./helpers');

const attendance = {
  /**
   * 上班打卡
   * 返回：{ message, clockInTime, clockOutTime, workDate, workMinutes, hasClockedIn, hasClockedOut }
   */
  clockIn() {
    return ok('/api/production/attendance/clock-in', 'POST', {});
  },

  /**
   * 下班打卡
   */
  clockOut() {
    return ok('/api/production/attendance/clock-out', 'POST', {});
  },

  /**
   * 今日打卡状态
   */
  todayStatus() {
    return ok('/api/production/attendance/today-status', 'GET', {});
  },

  /**
   * 本月工时统计
   * 返回：{ workHours, workDays, monthMinutes }
   */
  monthlyStats() {
    return ok('/api/production/attendance/monthly-stats', 'GET', {});
  },

  /**
   * 月度打卡明细（手机端考勤详情页）
   * 返回：{ month, summary:{...}, records:[...], calendar:[...] }
   * @param {string} [month] - 月份 yyyy-MM 或 yyyy-MM-dd，不传默认当月
   */
  monthlyRecords(month) {
    const url = month
      ? '/api/production/attendance/monthly-records?month=' + encodeURIComponent(month)
      : '/api/production/attendance/monthly-records';
    return ok(url, 'GET', {});
  },

  /**
   * 员工自助补卡（仅为自己补过去日期）
   * @param {Object} params - { workDate, clockInTime, clockOutTime, remark }
   */
  selfSupplement(params) {
    const parts = [];
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    const url = '/api/production/attendance/self-supplement' + (parts.length ? '?' + parts.join('&') : '');
    return ok(url, 'POST', {});
  },

  // ==================== 管理员接口 ====================

  /**
   * 管理端列表查询
   * @param {Object} params - { startDate, endDate, userId, status }
   */
  adminList(params) {
    const parts = [];
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    const url = '/api/production/attendance/admin/list' + (parts.length ? '?' + parts.join('&') : '');
    return ok(url, 'GET', {});
  },

  /**
   * 管理员补录打卡（给指定员工补卡）
   * @param {Object} params - { targetUserId, targetUserName, workDate, clockInTime, clockOutTime, remark }
   */
  adminSupplement(params) {
    const parts = [];
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    const url = '/api/production/attendance/admin/supplement' + (parts.length ? '?' + parts.join('&') : '');
    return ok(url, 'POST', {});
  },

  /**
   * 管理员修改打卡记录
   * @param {Object} params - { id, clockInTime, clockOutTime, remark }
   */
  adminAdjust(params) {
    const parts = [];
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    const url = '/api/production/attendance/admin/adjust' + (parts.length ? '?' + parts.join('&') : '');
    return ok(url, 'POST', {});
  },

  /**
   * 管理员作废打卡记录
   * @param {Object} params - { id, reason }
   */
  adminCancel(params) {
    const parts = [];
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    const url = '/api/production/attendance/admin/cancel' + (parts.length ? '?' + parts.join('&') : '');
    return ok(url, 'POST', {});
  },
};

module.exports = attendance;
