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
const i18n = require('../../../utils/i18n/index');
const NS = 'mp.collabTask.';
const { decodeParam } = require('../../../utils/urlParams');

var STATUS_TEXT = {
  PENDING: 'stPending',
  ACCEPTED: 'stAccepted',
  IN_PROGRESS: 'stInProgress',
  COMPLETED: 'stCompleted',
  ESCALATED: 'stEscalated',
  CANCELLED: 'stCancelled',
};
var STATUS_CLS = {
  PENDING: 'tag-orange',
  ACCEPTED: 'tag-blue',
  IN_PROGRESS: 'tag-blue',
  COMPLETED: 'tag-green',
  ESCALATED: 'tag-red',
  CANCELLED: 'tag-gray',
};
function buildStatusMap(lang) {
  var m = {};
  Object.keys(STATUS_TEXT).forEach(function (k) {
    m[k] = { text: i18n.t(NS + STATUS_TEXT[k], lang), cls: STATUS_CLS[k] };
  });
  return m;
}
var STATUS_MAP = {};  // applyLanguage 重建（页面 data 引用）

var PRIORITY_TEXT = {
  CRITICAL: 'prCritical',
  HIGH: 'prHigh',
  MEDIUM: 'prMedium',
  LOW: 'prLow',
};

// 状态 → 可执行动作
var NEXT_ACTION = {
  PENDING: { i18nKey: 'actClaim', method: 'claim' },
  ACCEPTED: { i18nKey: 'actStart', method: 'toInProgress' },
  IN_PROGRESS: { i18nKey: 'actComplete', method: 'complete' },
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

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），状态映射重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        targetRoleLabel: i18n.t(NS + 'targetRoleLabel', lang),
        currentStage: i18n.t(NS + 'currentStage', lang),
        nextStepLabel: i18n.t(NS + 'nextStepLabel', lang),
        deadlineLabel: i18n.t(NS + 'deadlineLabel', lang),
        timeLimitLabel: i18n.t(NS + 'timeLimitLabel', lang),
        assigneeLabel: i18n.t(NS + 'assigneeLabel', lang),
        creatorLabel: i18n.t(NS + 'creatorLabel', lang),
        sourceLabel: i18n.t(NS + 'sourceLabel', lang),
        acceptanceLabel: i18n.t(NS + 'acceptanceLabel', lang),
        completeNoteLabel: i18n.t(NS + 'completeNoteLabel', lang),
        escalatedTo: i18n.t(NS + 'escalatedTo', lang),
        cancelTaskLabel: i18n.t(NS + 'cancelTaskLabel', lang),
        copyContentBtn: i18n.t(NS + 'copyContentBtn', lang),
        overdueW: i18n.t(NS + 'overdueW', lang),
        filterAllStatus: i18n.t(NS + 'filterAllStatus', lang),
        cancelW: i18n.t(NS + 'cancelW', lang),
        taskGone: i18n.t(NS + 'taskGone', lang),
        collabWord: i18n.t(NS + 'collabWord', lang),
        priorityPrefix: i18n.t(NS + 'priorityPrefix', lang),
        createdPrefix: i18n.t(NS + 'createdPrefix', lang),
        loadingDots: i18n.t(NS + 'loadingDots', lang),
      },
      STATUS_MAP: buildStatusMap(lang),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
    var opts = options || {};
    var taskId = decodeParam(opts.taskId);
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
    var lang = this._lang || i18n.getLanguage();
    this.setData({ loading: true });
    return api.collaboration.getTaskDetail(this.data.taskId).then(function (d) {
      var raw = String((d && d.taskStatus) || 'PENDING').toUpperCase();
      var next = NEXT_ACTION[raw];
      that.setData({
        loading: false,
        notFound: false,
        detail: d || null,
        statusText: STATUS_TEXT[raw] ? i18n.t(NS + STATUS_TEXT[raw], lang) : raw,
        statusCls: STATUS_CLS[raw] || 'tag-gray',
        priorityText: PRIORITY_TEXT[String((d && d.priority) || '').toUpperCase()] ? i18n.t(NS + PRIORITY_TEXT[String((d && d.priority) || '').toUpperCase()], lang) : i18n.t(NS + 'prMedium', lang),
        actionLabel: next ? i18n.t(NS + next.i18nKey, lang) : '',
        canAct: !!next,
        // 已完成/已取消不可再取消
        canCancel: raw !== 'COMPLETED' && raw !== 'CANCELLED',
        createdAtText: fmt(d && d.createdAt),
        dueAtText: fmt(d && d.dueAt),
        completedAtText: fmt(d && d.completedAt),
      });
    }).catch(function (e) {
      that.setData({ loading: false, notFound: true });
      toast(i18n.t(NS + 'loadFailPrefix', this._lang) + (e.errMsg || e.message || e));
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
    if (!next) { toast(i18n.t(NS + 'noStateAction', this._lang)); return; }

    var that = this;
    if (next.method === 'claim') {
      wx.showModal({
        title: i18n.t(NS + 'actClaim', this._lang),
        content: i18n.t(NS + 'claimConfirm', this._lang),
        success: function (res) {
          if (!res.confirm) return;
          that._run(function () { return api.collaboration.claimTask(that.data.taskId); }, i18n.t(NS + 'stAccepted', this._lang));
        },
      });
      return;
    }

    if (next.method === 'toInProgress') {
      wx.showModal({
        title: i18n.t(NS + 'actStart', this._lang),
        content: i18n.t(NS + 'startConfirm', this._lang),
        success: function (res) {
          if (!res.confirm) return;
          that._run(function () {
            return api.collaboration.updateStatus(that.data.taskId, 'IN_PROGRESS', '');
          }, i18n.t(NS + 'started', this._lang));
        },
      });
      return;
    }

    // 完成：必须填完成说明
    wx.showModal({
      title: i18n.t(NS + 'actComplete', this._lang),
      content: '',
      editable: true,
      placeholderText: i18n.t(NS + 'completeNoteReq', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var note = (res.content || '').trim();
        if (!note) { toast(i18n.t(NS + 'completeNoteReq', this._lang)); return; }
        that._run(function () {
          return api.collaboration.updateStatus(that.data.taskId, 'COMPLETED', note);
        }, i18n.t(NS + 'stCompleted', this._lang));
      },
    });
  },

  /**
   * 取消任务
   */
  onActionCancel: function () {
    var that = this;
    wx.showModal({
      title: i18n.t(NS + 'cancelTaskLabel', this._lang),
      content: '',
      editable: true,
      placeholderText: i18n.t(NS + 'cancelReasonReq', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var note = (res.content || '').trim();
        that._run(function () {
          return api.collaboration.updateStatus(that.data.taskId, 'CANCELLED', note || '');
        }, i18n.t(NS + 'stCancelled', this._lang));
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
    wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
    Promise.resolve().then(fn).then(function () {
      wx.hideLoading();
      toast(okText);
      that._loadDetail();
    }).catch(function (e) {
      wx.hideLoading();
      toast(i18n.t(NS + 'opFailPrefix', this._lang) + (e.errMsg || e.message || e));
    });
  },

  // 复制任务指令
  onCopyInstruction: function () {
    var d = this.data.detail;
    var text = (d && (d.instruction || d.nextStep)) || '';
    if (!text) return;
    wx.setClipboardData({ data: String(text), success: function () { toast(i18n.t(NS + 'copiedW', this._lang)); } });
  },
});
