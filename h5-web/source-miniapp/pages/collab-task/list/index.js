/**
 * 协作任务列表页（D-417）
 *
 * 作为「更多应用 → 协作任务」的入口页（详情页需要 taskId，不能直接作为应用入口）。
 * 数据源：GET /api/intelligence/task-center/my-tasks（后端已按「我创建/我领取」过滤）
 *
 * 点击某项 → /pages/collab-task/detail/index?taskId=xxx 处理（领取/开始/完成）
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const i18n = require('../../../utils/i18n/index');
const NS = 'mp.collabTask.';

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
// D-419：实底 status-badge 颜色（与样式表 --color-* 对齐）
var STATUS_COLOR = {
  PENDING: 'var(--color-warning)',
  ACCEPTED: 'var(--color-primary)',
  IN_PROGRESS: 'var(--color-primary)',
  COMPLETED: 'var(--color-success)',
  ESCALATED: 'var(--color-danger)',
  CANCELLED: 'var(--color-text-tertiary)',
};
function buildStatusMap(lang) {
  var m = {};
  Object.keys(STATUS_TEXT).forEach(function (k) {
    m[k] = { text: i18n.t(NS + STATUS_TEXT[k], lang), cls: STATUS_CLS[k] };
  });
  return m;
}
var STATUS_MAP = {};  // applyLanguage 重建

var PRIORITY_TEXT = { CRITICAL: 'prCritical', HIGH: 'prHigh', MEDIUM: 'prMedium', LOW: 'prLow' };

function statusText(s, lang) {
  var k = String(s || '').toUpperCase();
  var key = STATUS_TEXT[k];
  return key ? i18n.t(NS + key, lang) : (s || '—');
}
function statusCls(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_CLS[k] || 'tag-gray';
}
function statusColor(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_COLOR[k] || 'var(--color-text-tertiary)';
}

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    list: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    statusFilter: '',
    keyword: '',
    STATUS_MAP: {},  // applyLanguage 重建
    STATUS_OPTIONS: [],  // applyLanguage 重建
  },

  _STATUS_OPTIONS: [
    { value: '', key: 'filterAllStatus' },
    { value: 'PENDING', key: 'stPending' },
    { value: 'ACCEPTED', key: 'stAccepted' },
    { value: 'IN_PROGRESS', key: 'stInProgress' },
    { value: 'COMPLETED', key: 'stCompleted' },
  ],

  /** 静态文案按语言写入，状态映射/筛选重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        filterAllStatus: i18n.t(NS + 'filterAllStatus', lang),
        detailBtn: i18n.t(NS + 'detailBtn', lang),
        searchPhW: i18n.t(NS + 'searchPhW', lang),
        noRecords: i18n.t(NS + 'noRecords', lang),
        assigneePrefix: i18n.t(NS + 'assigneePrefix', lang),
        createdPrefix: i18n.t(NS + 'createdPrefix', lang),
        noMoreW: i18n.t(NS + 'noMoreW', lang),
        claimChar: i18n.t(NS + 'claimChar', lang),
        overdueW: i18n.t(NS + 'overdueW', lang),
      },
      STATUS_MAP: buildStatusMap(lang),
      STATUS_OPTIONS: this._STATUS_OPTIONS.map(function (o) {
        return { value: o.value, label: i18n.t(NS + o.key, lang) };
      }),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onShow: function () {
    // 从详情页处理完返回，需刷新状态（避免显示旧状态）
    if (this._shownOnce) this._resetAndLoad();
    this._shownOnce = true;
  },

  onPullDownRefresh: function () {
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) this._loadData();
  },

  _resetAndLoad: function () {
    this.setData({ page: 1, list: [], hasMore: true });
    return this._loadData();
  },

  _loadData: function () {
    if (this.data.loading) return Promise.resolve();
    var that = this;
        var lang = this._lang || i18n.getLanguage();
    this.setData({ loading: true });
    var params = { page: this.data.page, size: this.data.pageSize };
    if (this.data.statusFilter) params.status = this.data.statusFilter;
    if (this.data.keyword) params.keyword = this.data.keyword;

    return api.collaboration.myTasks(params).then(function (res) {
      var records = (res && (res.rows || res.records)) || [];
      var total = (res && res.total) || records.length;
      var enriched = records.map(function (r) {
        r.statusText = statusText(r.taskStatus, lang);
        r.statusCls = statusCls(r.taskStatus);
        // D-419：实底 status-badge 用色
        r._statusColor = statusColor(r.taskStatus);
        var pk = PRIORITY_TEXT[String(r.priority || '').toUpperCase()];
        r.priorityText = pk ? i18n.t(NS + pk, lang) : i18n.t(NS + 'prMedium', lang);
        r.title = r.instruction || r.nextStep || i18n.t(NS + 'collabWord', lang);
        r.isOverdue = !!r.overdue;
        return r;
      });
      that.setData({
        list: that.data.list.concat(enriched),
        hasMore: that.data.list.length + records.length < total,
        page: that.data.page + 1,
        loading: false,
      });
    }).catch(function (e) {
      that.setData({ loading: false });
      toast(i18n.t(NS + 'loadFailPrefix', this._lang) + (e.errMsg || e.message || e));
    });
  },

  onKeywordInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onKeywordSearch: function () {
    this._resetAndLoad();
  },

  onStatusFilterChange: function (e) {
    var idx = Number(e.detail.value);
    this.setData({ statusFilter: this._STATUS_OPTIONS[idx].value });
    this._resetAndLoad();
  },

  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    var id = item.id !== undefined && item.id !== null ? String(item.id) : '';
    if (!id) { toast(i18n.t(NS + 'taskIdMissing', this._lang)); return; }
    wx.navigateTo({ url: '/pages/collab-task/detail/index?taskId=' + encodeURIComponent(id) });
  },

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || i18n.t(NS + 'selectW', this._lang),
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
