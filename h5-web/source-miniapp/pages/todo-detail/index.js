const { safeNavigate } = require('../../utils/uiHelper');

/**
 * 配置 UI Helper，导出网络请求等。
 * 本页只读展示统一待办的真实数据（后端 PendingTaskOrchestrator 已按租户+角色过滤），不做任何写操作。
 * 缺口类型（工资结算/物料对账/费用报销/异常/协作/样衣借还/领料出库）的手机端承载页。
 */

// 每种缺口类型「去处理」就近可达的页面
// D-417：财务三类已建独立处理页（原统一落 /pages/finance/payment/index，只能看不能办）
const HANDLE_ROUTE = {
  PAYROLL_SETTLEMENT: '/pages/finance/payroll-approval/index?status=pending',
  MATERIAL_RECON: '/pages/finance/reconciliation/index?status=pending',
  EXPENSE_REIMBURSE: '/pages/finance/reimbursement/index?status=pending',
  EXCEPTION_REPORT: '/pages/smart-ops/exception-detail/index?status=PENDING',
  SAMPLE_LOAN: '/pages/warehouse/sample/scan-action/index',
  // D-513：原来是 /pages/warehouse/material/scan/index（扫码页），
  // 但扫码页只能「确认发料/退回」（改料卷状态），不是领料出库两步流——
  // 看不到待出库列表、也确认不了出库，闭环断了。改跳专门的领料出库页。
  // D-515：不再带 status=pending —— D-099 后内部领料是「领取即出库」直接落 completed，
  // 只有 EXTERNAL 外发领用才产生 pending，带 pending 跳进去必然空白（用户以为没数据）。
  // 改成默认「全部」，与 PC 端领料列表口径一致；真有待出库的直接在状态 tab 里点。
  MATERIAL_PICKING: '/pages/warehouse/material-picking/index',
  COLLAB_TASK: '/pages/collab-task/list/index', // 缺 taskId 时兜底进协作任务列表，用户可在列表中找到对应任务
};

// 处理按钮文案（就近页的入口语义）
const HANDLE_LABEL = {
  PAYROLL_SETTLEMENT: '去审核工资',
  MATERIAL_RECON: '去处理对账',
  EXPENSE_REIMBURSE: '去审批报销',
  EXCEPTION_REPORT: '去处理异常',
  SAMPLE_LOAN: '去样衣借还',
  MATERIAL_PICKING: '去领料',
  COLLAB_TASK: '去协作任务',
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
    // 显式登记为 null 的类型才提示"去 PC 处理"（当前无；协作任务已兜底到列表页）
    const noRoute = HANDLE_ROUTE.hasOwnProperty(type) && !HANDLE_ROUTE[type];
    this.setData({
      hasTask: true,
      task: task,
      priorityText: priorityText(task.priority),
      noRouteHint: noRoute,
      handleText: !noRoute ? (HANDLE_LABEL[type] || '去处理') : '',
    });
  },

  goBack: function () {
    // 统一待办页可能存在下分页，用 navigateBack 友好退出；
    // 直达打开（页面栈只有本页）时回首页——home 是 tabBar 页，必须 switchTab
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack(); else wx.switchTab({ url: '/pages/home/index' });
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