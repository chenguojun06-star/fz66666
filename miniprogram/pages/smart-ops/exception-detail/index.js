/**
 * 生产异常报告处理页（D-417 手机端独立处理页）
 *
 * 补齐「异常报告手机端只能看、无法处理」的缺口。
 * 配套后端：
 *   GET  /api/production/exception/list          列表
 *   POST /api/production/exception/{id}/handle   处理（resolve 已解决 / reopen 重新打开）
 *
 * 状态：PENDING=待处理 → RESOLVED=已解决（可 reopen 回退）
 * 权限：仅主管及以上可处理（后端 UserContext.isSupervisorOrAbove 校验，前端同步只对该角色显示按钮）
 * 内外部：工厂账号由后端按「本工厂订单」过滤，只能看到自己厂的异常，不在此页拦截。
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission } = require('../../../utils/permission');

var STATUS_TEXT = { PENDING: '待处理', RESOLVED: '已解决' };
var STATUS_CLS = { PENDING: 'tag-orange', RESOLVED: 'tag-green' };
var STATUS_MAP = {};
Object.keys(STATUS_TEXT).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT[k], cls: STATUS_CLS[k] };
});

// 异常类型（与后端 mapExceptionType 对齐）
var TYPE_TEXT = {
  MATERIAL_SHORTAGE: '缺面料/辅料',
  MACHINE_FAULT: '车床故障',
  NEED_HELP: '需指导/协助',
};

function statusText(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_TEXT[k] || s || '—';
}
function statusCls(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_CLS[k] || 'tag-gray';
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
    keyword: '',
    statusFilter: '',
    canOperate: false,
    showActionSheet: false,
    current: null,
    currentCanResolve: false,
    currentCanReopen: false,
    STATUS_MAP: STATUS_MAP,
    STATUS_OPTIONS: [
      { value: '', label: '全部状态' },
      { value: 'PENDING', label: '待处理' },
      { value: 'RESOLVED', label: '已解决' },
    ],
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'PENDING', label: '待处理' },
    { value: 'RESOLVED', label: '已解决' },
  ],

  onLoad: function (options) {
    var opts = options || {};
    this.setData({
      canOperate: hasFeaturePermission('handle_exception'),
      statusFilter: opts.status || '',
      keyword: opts.keyword ? decodeURIComponent(opts.keyword) : '',
    });
  },

  onShow: function () {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
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
    this.setData({ loading: true });
    var params = { page: this.data.page, pageSize: this.data.pageSize };
    if (this.data.statusFilter) params.status = this.data.statusFilter;
    if (this.data.keyword) params.keyword = this.data.keyword;

    return api.production.listExceptions(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      var enriched = records.map(function (r) {
        var st = String(r.status || 'PENDING').toUpperCase();
        r.statusText = statusText(st);
        r.statusCls = statusCls(st);
        r.typeText = TYPE_TEXT[String(r.exceptionType || '').toUpperCase()] || (r.exceptionType || '未知异常');
        r.isPending = st === 'PENDING';
        r.createTimeText = r.createTime ? String(r.createTime).replace('T', ' ').slice(0, 16) : '';
        r.handleTimeText = r.handleTime ? String(r.handleTime).replace('T', ' ').slice(0, 16) : '';
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
      toast('加载失败: ' + (e.errMsg || e.message || e));
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
    this.setData({
      current: item,
      showActionSheet: true,
      currentCanResolve: !!(this.data.canOperate && item.isPending),
      currentCanReopen: !!(this.data.canOperate && !item.isPending),
    });
  },

  /**
   * 标记已解决（需填处理说明）
   */
  onActionResolve: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: '标记已解决',
      content: '',
      editable: true,
      placeholderText: '请填写处理说明（如如何解决的）',
      success: function (res) {
        if (!res.confirm) return;
        var note = (res.content || '').trim();
        if (!note) { toast('请填写处理说明'); return; }
        that._submit(item.id, 'resolve', note, '已标记解决');
      },
    });
  },

  /**
   * 重新打开（误点恢复）
   */
  onActionReopen: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: '重新打开',
      content: '确认将该异常重新标记为「待处理」？',
      success: function (res) {
        if (!res.confirm) return;
        that._submit(item.id, 'reopen', '', '已重新打开');
      },
    });
  },

  _submit: function (id, action, note, okText) {
    var that = this;
    wx.showLoading({ title: '处理中...', mask: true });
    api.production.handleException(id, action, note).then(function () {
      wx.hideLoading();
      toast(okText);
      that.setData({ showActionSheet: false, current: null });
      that._resetAndLoad();
    }).catch(function (e) {
      wx.hideLoading();
      toast('操作失败: ' + (e.errMsg || e.message || e));
    });
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, current: null });
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
      pickerTitle: ds.title || '请选择',
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
