/**
 * 协作任务（任务中心）接口模块 —— D-417 手机端独立处理页
 *
 * 后端：IntelligenceTaskCenterController
 *   GET  /api/intelligence/task-center/tasks/{taskId}        任务详情
 *   POST /api/intelligence/task-center/tasks/{taskId}/claim  领取任务
 *   PUT  /api/intelligence/task-center/tasks/{taskId}/status 更新状态（body: {status, note}）
 *   GET  /api/intelligence/task-center/my-tasks              我的任务（分页）
 *
 * 状态枚举（后端 CollaborationTask.TaskStatus）：
 *   PENDING → ACCEPTED → IN_PROGRESS → COMPLETED
 *   旁支：ESCALATED（逾期升级）/ CANCELLED（取消）
 *   后端按 valueOf(newStatus.toUpperCase()) 解析，故必须传大写。
 */
const { ok } = require('./helpers');

/**
 * GET 参数拼 query string
 * @param {Object} params - 查询参数
 * @returns {string}
 */
function toQuery(params) {
  if (!params) return '';
  const parts = [];
  Object.keys(params).forEach(function (k) {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.join('&');
}

const collaboration = {
  /**
   * 任务详情
   * @param {string|number} taskId - 任务 id（数字）
   * @returns {Promise<Object>}
   */
  getTaskDetail: function (taskId) {
    return ok('/api/intelligence/task-center/tasks/' + encodeURIComponent(taskId), 'GET', {});
  },

  /**
   * 领取任务（PENDING → ACCEPTED）
   * @param {string|number} taskId - 任务 id
   * @returns {Promise<Object>}
   */
  claimTask: function (taskId) {
    return ok('/api/intelligence/task-center/tasks/' + encodeURIComponent(taskId) + '/claim', 'POST', {});
  },

  /**
   * 更新任务状态
   * @param {string|number} taskId - 任务 id
   * @param {string} status - PENDING/ACCEPTED/IN_PROGRESS/COMPLETED/ESCALATED/CANCELLED（大写）
   * @param {string} [note] - 备注（完成说明）
   * @returns {Promise<Object>}
   */
  updateStatus: function (taskId, status, note) {
    const body = { status: String(status || '').toUpperCase() };
    if (note) body.note = note;
    return ok('/api/intelligence/task-center/tasks/' + encodeURIComponent(taskId) + '/status', 'PUT', body);
  },

  /**
   * 我的任务列表
   * @param {Object} params - {status, priority, module, scope, page, size}
   * @returns {Promise<Object>}
   */
  myTasks: function (params) {
    return ok('/api/intelligence/task-center/my-tasks?' + toQuery(params), 'GET', {});
  },
};

module.exports = { collaboration };
