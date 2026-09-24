/**
 * 物料对账处理页（D-417 手机端独立处理页 · D-419 卡片重构）
 *
 * 与 PC 端 MaterialReconciliation 页同源接口，补齐手机端「只能看不能办」。
 * 状态链：pending(待核实) → verified(已核实) → approved(已审批) → paid(已付款)
 *        任意环节可 return(退回上一步)
 *
 * 权限：仅内部管理员/主管可操作；工厂（外部）账号不参与租户财务，直接拦截。
 */
const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../utils/permission');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { decodeParam } = require('../../../utils/urlParams');

// 状态文案/配色（与 PC 端 MATERIAL_RECON_STATUS_MAP 对齐）
// D-419：颜色统一为实底 status-badge 用色（直接走 var(--color-*)）
var STATUS_TEXT_MAP = {
  pending: '待核实',
  verified: '已核实',
  approved: '已审批',
  paid: '已付款',
  rejected: '已驳回',
};
var STATUS_CLS_MAP = {
  pending: 'tag-orange',
  verified: 'tag-blue',
  approved: 'tag-green',
  paid: 'tag-green',
  rejected: 'tag-red',
};
// D-419：实底 status-badge 背景色（与样式表 --color-* 对齐；fallback 到 hash 值以防变量缺失）
var STATUS_COLOR_MAP = {
  pending: 'var(--color-warning)',
  verified: 'var(--color-primary)',
  approved: 'var(--color-success)',
  paid: 'var(--color-success)',
  rejected: 'var(--color-danger)',
};
// 采购来源映射（D-421：用户要求卡片上明确区分「样衣 / 大货」）
// 后端 MaterialPurchase.sourceType: order=批量订单(大货) / sample=样衣开发
var SOURCE_TYPE_MAP = {
  sample: { kind: 'sample', text: '样衣' },
  order: { kind: 'bulk', text: '大货' },
};
var SOURCE_TYPE_FALLBACK = { kind: 'bulk', text: '大货' };

// 状态推进链：当前状态 → 下一步动作（对齐 PC 端 status-action: action=update + status）
var NEXT_STEP = {
  pending: { status: 'verified', label: '核实通过' },
  verified: { status: 'approved', label: '审批通过' },
  approved: { status: 'paid', label: '标记已付款' },
};

function statusText(s) { return STATUS_TEXT_MAP[s] || s || '—'; }
function statusCls(s) { return STATUS_CLS_MAP[s] || 'tag-gray'; }
function statusColor(s) { return STATUS_COLOR_MAP[s] || 'var(--color-text-tertiary)'; }

// wxml 筛选用：{status: {text, cls}}
var STATUS_MAP = {};
Object.keys(STATUS_TEXT_MAP).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT_MAP[k], cls: STATUS_CLS_MAP[k] };
});

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
    // 操作权限
    canOperate: false,
    blocked: false,
    blockedMsg: '',
    // 详情页路径（D-419：点击卡片进详情）
    detailUrl: '/pages/finance/reconciliation/detail/index',
    // 底部操作面板（保留兼容旧路径）
    showActionSheet: false,
    current: null,
    currentNextLabel: '',
    currentCanAdvance: false,
    currentCanReturn: false,
    STATUS_OPTIONS: [
      { value: '', label: '全部状态' },
      { value: 'pending', label: '待核实' },
      { value: 'verified', label: '已核实' },
      { value: 'approved', label: '已审批' },
      { value: 'paid', label: '已付款' },
    ],
    STATUS_MAP: STATUS_MAP,
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'pending', label: '待核实' },
    { value: 'verified', label: '已核实' },
    { value: 'approved', label: '已审批' },
    { value: 'paid', label: '已付款' },
  ],

  onLoad: function (options) {
    var opts = options || {};
    // 外部（工厂）账号不参与租户财务对账，直接拦截，避免误操作越权
    if (isFactoryAccount()) {
      this.setData({
        blocked: true,
        blockedMsg: '工厂账号不可查看物料对账（属租户财务数据）',
        canOperate: false,
      });
      return;
    }
    // D-430：小云待办直达参数（待办 id "MRC_{reconciliationId}"，见 bellTaskActions）
    // ⚠️ 发送方用的是 encodeURIComponent（bellTaskActions 第 378-379 行），
    //    小程序不会自动解码，这里必须 decodeParam。
    this._incoming = {
      reconciliationId: decodeParam(opts.reconciliationId),
      orderNo: decodeParam(opts.orderNo),
    };
    this._autoOpened = false;
    this.setData({
      canOperate: hasFeaturePermission('approve_reconciliation'),
      // 支持从待办直达并预置筛选（如 ?status=pending / ?keyword=xxx）
      statusFilter: opts.status || '',
      keyword: decodeParam(opts.keyword),
    });
  },

  onShow: function () {
    if (this.data.blocked) return;
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    if (this.data.blocked) { wx.stopPullDownRefresh(); return; }
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

    return api.materialReconciliation.list(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      // D-430：来自小云待办的精确筛选（reconciliationId 优先，orderNo 兜底）
      var inc = that._incoming || {};
      if (inc.reconciliationId) {
        var byId = records.filter(function (r) {
          return String(r.id || '') === inc.reconciliationId;
        });
        if (byId.length) records = byId;
      }
      if (inc.orderNo) {
        var byOrder = records.filter(function (r) {
          return String(r.orderNo || '') === inc.orderNo;
        });
        if (byOrder.length) records = byOrder;
      }
      var enriched = records.map(function (r) {
        r.statusText = statusText(r.status);
        r.statusCls = statusCls(r.status);
        // D-419：实底 status-badge 用色
        r._statusColor = statusColor(r.status);
        // D-419：图片字段 materialImageUrl（后端 Orchestrator 已按采购单 styleCover 填充）→ 鉴权 URL
        r._image = r.materialImageUrl ? getAuthedImageUrl(r.materialImageUrl) : '';
        r.amountStr = r.finalAmount != null ? Number(r.finalAmount).toFixed(2)
          : (r.totalAmount != null ? Number(r.totalAmount).toFixed(2) : '0.00');
        r.unitPriceStr = r.unitPrice != null ? Number(r.unitPrice).toFixed(2) : '—';
        r.quantityStr = r.quantity != null ? String(Number(r.quantity)) : '—';
        // D-421：来源标注（样衣 / 大货）
        var src = SOURCE_TYPE_MAP[String(r.sourceType || '').toLowerCase()] || SOURCE_TYPE_FALLBACK;
        r._sourceKind = src.kind;
        r._sourceText = src.text;
        // 下一步可推进的文案（无下一步则不显示操作）
        var next = NEXT_STEP[r.status];
        r.nextLabel = next ? next.label : '';
        return r;
      });
      that.setData({
        list: that.data.list.concat(enriched),
        hasMore: that.data.list.length + records.length < total,
        page: that.data.page + 1,
        loading: false,
      });

      // D-430：待办直达 —— 精确筛选后只剩一条时直接打开详情页
      var inc2 = that._incoming || {};
      if (inc2.reconciliationId && !that._autoOpened && enriched.length === 1 && enriched[0].id) {
        that._autoOpened = true;
        wx.navigateTo({
          url: '/pages/finance/reconciliation/detail/index?id=' + encodeURIComponent(enriched[0].id),
        });
      }
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

  /**
   * D-419：点击卡片主体 → 进详情页（不再默认弹操作面板，避免藏审核入口）
   */
  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    var id = item.id !== undefined && item.id !== null ? String(item.id) : '';
    if (!id) { toast('记录ID缺失'); return; }
    safeNavigate({
      url: this.data.detailUrl + '?id=' + encodeURIComponent(id),
    }).catch(function () {});
  },

  /**
   * D-419：卡片右下「审核通过」按钮（无需弹面板，单次确认即执行）
   */
  onActionAdvanceInline: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    var next = NEXT_STEP[item.status];
    if (!next) { toast('当前状态无可执行操作'); return; }
    wx.showModal({
      title: '确认' + next.label,
      content: next.label + '单号 ' + (item.reconciliationNo || '—') + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'update', next.status, '').then(function () {
          wx.hideLoading();
          toast('已' + next.label);
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('操作失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * D-419：卡片右下「退回」按钮（需填原因，单次确认即执行）
   */
  onActionReturnInline: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    wx.showModal({
      title: '退回',
      content: '',
      editable: true,
      placeholderText: '请填写退回原因',
      success: function (res) {
        if (!res.confirm) return;
        var reason = (res.content || '').trim();
        if (!reason) { toast('请填写退回原因'); return; }
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'return', '', reason).then(function () {
          wx.hideLoading();
          toast('已退回');
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('退回失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 推进到下一状态（保留弹面板兼容路径，供详情页或外部触发使用）
   */
  onActionAdvance: function () {
    var that = this;
    var item = this.data.current;
    if (!item) return;
    var next = NEXT_STEP[item.status];
    if (!next) { toast('当前状态无可执行操作'); return; }
    wx.showModal({
      title: '确认操作',
      content: '确认「' + next.label + '」？单号 ' + (item.reconciliationNo || '—'),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'update', next.status, '').then(function () {
          wx.hideLoading();
          toast('已' + next.label);
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('操作失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 退回上一步（保留弹面板兼容路径）
   */
  onActionReturn: function () {
    var that = this;
    var item = this.data.current;
    if (!item) return;
    wx.showModal({
      title: '退回',
      content: '',
      editable: true,
      placeholderText: '请填写退回原因',
      success: function (res) {
        if (!res.confirm) return;
        var reason = (res.content || '').trim();
        if (!reason) { toast('请填写退回原因'); return; }
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'return', '', reason).then(function () {
          wx.hideLoading();
          toast('已退回');
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('退回失败: ' + (e.errMsg || e.message || e));
        });
      },
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