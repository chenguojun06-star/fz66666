const { safeNavigate } = require('../../utils/uiHelper');

/**
 * 配置 UI Helper，导出网络请求等。
 * 本页只读展示统一待办的真实数据（后端 PendingTaskOrchestrator 已按租户+角色过滤），不做任何写操作。
 * 缺口类型（工资结算/物料对账/费用报销/异常/协作/样衣借还/领料出库）的手机端承载页。
 */

// 每种缺口类型「去处理」就近可达的页面；无对应页的类型(如协作任务)给空，改为提示
const HANDLE_ROUTE = {
  PAYROLL_SETTLEMENT: '/pages/payroll/payroll',
  MATERIAL_RECON: '/pages/finance/payment/index',
  EXPENSE_REIMBURSE: '/pages/finance/payment/index',
  EXCEPTION_REPORT: '/pages/smart-ops/index',
  SAMPLE_LOAN: '/pages/warehouse/sample/scan-action/index',
  MATERIAL_PICKING: '/pages/warehouse/material/scan/index',
  COLLAB_TASK: null, // 协作任务手机端无处理页，提示在 PC 端处理
};

// 处理按钮文案（就近页的入口语义）
const HANDLE_LABEL = {
  PAYROLL_SETTLEMENT: '去查看工资',
  MATERIAL_RECON: '去财务处理',
  EXPENSE_REIMBURSE: '去财务处理',
  EXCEPTION_REPORT: '去异常处理',
  SAMPLE_LOAN: '去样衣借还',
  MATERIAL_PICKING: '去领料',
  COLLAB_TASK: '', // 无入口，不给按钮
};

function priorityText(p) {
  const v = String(p || 'medium').toLowerCase();
  if (v === 'high') return '高优先级';
  if (v === 'low') return '低优先级';
  return '中优先级';
}

function formatTime(v) {
  if (!v) return '';
  // 兼容 ISO 与 "yyyy-MM-dd HH:mm:ss"
  const s = String(v).replace(' ', 'T');
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(v || '');
  const y = d.getFullYear(); const M = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0'); const mi = String(d.getMinutes()).padStart(2, '0');
  return y + '-' + M + '-' + day + ' ' + h + ':' + mi;
}

Page({
  data: {
    hasTask: false,
    noRouteHint: false,
    task: null,
    priorityText: '',
    handleText: '',
  },

  onLoad: function () {
    let task = null;
    try {
      const raw = wx.getStorageSync('pending_unified_task');
      if (raw) task = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error('[todo-detail] 读取待办失败', e);
    }
    if (!task) {
      // 正常由铃铛写入 storage 进入；直接打开本页且无数据时按空态处理，让用户返回
      this.setData({ hasTask: false });
      return;
    }
    this._apply(task);
  },

  _apply: function (task) {
    const type = task.taskType || '';
    const hasRoute = HANDLE_ROUTE.hasOwnProperty(type) && !!HANDLE_ROUTE[type];
    this.setData({
      hasTask: true,
      task: task,
      priorityText: priorityText(task.priority),
      noRouteHint: type === 'COLLAB_TASK',
      handleText: hasRoute ? (HANDLE_LABEL[type] || '去处理') : '',
    });
  },

  goBack: function () {
    // 统一待办页可能存在下分页，用 navigateBack 友好退出
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack(); else wx.navigateTo({ url: '/pages/home/index', fail: function () {} });
  },

  onHandle: function () {
    const task = this.data.task;
    if (!task) return;
    const route = HANDLE_ROUTE[task.taskType];
    if (!route) {
      wx.showToast({ title: '请在 PC 端处理', icon: 'none' });
      return;
    }
    safeNavigate({ url: route }, 'navigateTo').catch(() => {});
  },
});