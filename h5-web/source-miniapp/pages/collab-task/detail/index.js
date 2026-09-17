/**
 * 协作任务详情 / 处理页（D-417 手机端独立处理页）
 *
 * 补齐「协作任务手机端只能读、无处理能力」的缺口。
 * 数据源：/api/intelligence/task-center
 *
 * 状态流转（后端 CollaborationTask.TaskStatus）：
 *   PENDING --领取--> ACCEPTED --开始--> IN_PROGRESS --完成(填说明)--> COMPLETED
 *
 * 权限：后端按租户 + 「我创建/我领取」过滤，前端只做状态→按钮映射。
 * 内外部：协作任务是跨角色协同工作流，工厂账号同样可处理分派给自己的任务，
 *         故不在此页做账号类型拦截（与财务审批页不同）。
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

var STATUS_TEXT = {
  PENDING: '待领取',
  ACCEPTED: '已领取',
  IN_PROGRESS: '处理中',
  COMPLETED: '已完成',
  ESCALATED: '已升级',
  CANCELLED: '已取消',
};
var STATUS_CLS = {
  PENDING: 'tag-orange',
  ACCEPTED: 'tag-blue',
  IN_PROGRESS: 'tag-blue',
  COMPLETED: 'tag-green',
  ESCALATED: 'tag-red',
  CANCELLED: 'tag-gray',
};
var STATUS_MAP = {};
Object.keys(STATUS_TEXT).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT[k], cls: STATUS_CLS[k] };
});

var PRIORITY_TEXT = {
  CRITICAL: '紧急',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
};

// 状态 → 可执行动作
var NEXT_ACTION = {
  PENDING: { label: '领取任务', method: 'claim' },
  ACCEPTED: { label: '开始处理', method: 'toInProgress' },
  IN_PROGRESS: { label: '标记完成', method: 'complete' },
};

function fmt(v) {
  if (!v) return '';
  var s = String(v).replace('T', ' ');
  return s.length > 16 ? s.slice(0, 16) : s;
}

Page({
  data: {
    taskId: '',
    loading: true,
    detail: null,
    notFound: false,
    statusText: '',
    statusCls: 'tag-gray',
    priorityText: '',
    actionLabel: '',
    canAct: false,
    canCancel: false,
    createdAtText: '',
    dueAtText: '',
    completedAtText: '',
  },

  onLoad: function (options) {
    var opts = options || {};
    var taskId = opts.taskId ? String(opts.taskId) : '';
    if (!taskId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ taskId: taskId });
    this._loadDetail();
  },

  /**
   * onShow 重新拉取：任务状态可能被 PC 端（AI 助手面板）或其他端改过，
   * 回到本页必须显示最新状态，否则会出现「手机端还显示可领取、PC 端其实已领取」的假同步。
   * 用 _shownOnce 避免 onLoad 后紧接着的 onShow 重复请求。
   */
  onShow: function () {
    if (this._shownOnce && this.data.taskId && !this.data.blocked) {
      this._loadDetail();
    }
    this._shownOnce = true;
  },

  onPullDownRefresh: function () {
    this._loadDetail().finally(function () { wx.stopPullDownRefresh(); });
  },

  _loadDetail: function () {
    var that = this;
    this.setData({ loading: true });
    return api.collaboration.getTaskDetail(this.data.taskId).then(function (d) {
      var raw = String((d && d.taskStatus) || 'PENDING').toUpperCase();
      var next = NEXT_ACTION[raw];
      that.setData({
        loading: false,
        notFound: false,
        detail: d || null,
        statusText: STATUS_TEXT[raw] || raw,
        statusCls: STATUS_CLS[raw] || 'tag-gray',
        priorityText: PRIORITY_TEXT[String((d && d.priority) || '').toUpperCase()] || '中',
        actionLabel: next ? next.label : '',
        canAct: !!next,
        // 已完成/已取消不可再取消
        canCancel: raw !== 'COMPLETED' && raw !== 'CANCELLED',
        createdAtText: fmt(d && d.createdAt),
        dueAtText: fmt(d && d.dueAt),
        completedAtText: fmt(d && d.completedAt),
      });
    }).catch(function (e) {
      that.setData({ loading: false, notFound: true });
      toast('加载失败: ' + (e.errMsg || e.message || e));
    });
  },

  /**
   * 统一动作入口：领取 → 开始 → 完成
   */
  onActionPrimary: function () {
    var d = this.data.detail;
    if (!d) return;
    var raw = String(d.taskStatus || 'PENDING').toUpperCase();
    var next = NEXT_ACTION[raw];
    if (!next) { toast('当前状态无可执行操作'); return; }

    var that = this;
    if (next.method === 'claim') {
      wx.showModal({
        title: '领取任务',
        content: '确认领取该协作任务？',
        success: function (res) {
          if (!res.confirm) return;
          that._run(function () { return api.collaboration.claimTask(that.data.taskId); }, '已领取');
        },
      });
      return;
    }

    if (next.method === 'toInProgress') {
      wx.showModal({
        title: '开始处理',
        content: '确认开始处理该任务？',
        success: function (res) {
          if (!res.confirm) return;
          that._run(function () {
            return api.collaboration.updateStatus(that.data.taskId, 'IN_PROGRESS', '');
          }, '已开始处理');
        },
      });
      return;
    }

    // 完成：必须填完成说明
    wx.showModal({
      title: '标记完成',
      content: '',
      editable: true,
      placeholderText: '请填写完成说明',
      success: function (res) {
        if (!res.confirm) return;
        var note = (res.content || '').trim();
        if (!note) { toast('请填写完成说明'); return; }
        that._run(function () {
          return api.collaboration.updateStatus(that.data.taskId, 'COMPLETED', note);
        }, '已完成');
      },
    });
  },

  /**
   * 取消任务
   */
  onActionCancel: function () {
    var that = this;
    wx.showModal({
      title: '取消任务',
      content: '',
      editable: true,
      placeholderText: '请填写取消原因',
      success: function (res) {
        if (!res.confirm) return;
        var note = (res.content || '').trim();
        that._run(function () {
          return api.collaboration.updateStatus(that.data.taskId, 'CANCELLED', note || '');
        }, '已取消');
      },
    });
  },

  /**
   * 执行动作 + 统一 loading/toast/刷新
   * @param {Function} fn - 返回 Promise 的调用
   * @param {string} okText - 成功提示
   */
  _run: function (fn, okText) {
    var that = this;
    wx.showLoading({ title: '处理中...', mask: true });
    Promise.resolve().then(fn).then(function () {
      wx.hideLoading();
      toast(okText);
      that._loadDetail();
    }).catch(function (e) {
      wx.hideLoading();
      toast('操作失败: ' + (e.errMsg || e.message || e));
    });
  },

  // 复制任务指令
  onCopyInstruction: function () {
    var d = this.data.detail;
    var text = (d && (d.instruction || d.nextStep)) || '';
    if (!text) return;
    wx.setClipboardData({ data: String(text), success: function () { toast('已复制'); } });
  },
});
