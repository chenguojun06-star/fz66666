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
};

module.exports = attendance;
