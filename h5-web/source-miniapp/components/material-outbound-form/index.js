/**
 * 物料出库表单（通用组件）
 *
 * 为什么要抽成组件（D-514）：
 *   同一张表单有两个消费方 —— ① 独立页 pages/warehouse/material-outbound
 *   ② 物料中心 pages/warehouse/material-center 的「出库」tab（内联）。
 *   抽成组件后两边共用一份逻辑，避免"重复造轮子"。
 *
 * 后端契约（MaterialStockOrchestrator.manualOutbound）—— 7 个必填：
 *   stockId / quantity(>0) / receiverName(领取人) / orderNo(关联订单) /
 *   styleNo(关联款号) / factoryName(关联工厂) / usageType(用料场景)
 * 可选：reason / pickupType / factoryId / factoryType / warehouseAreaId
 *
 * ⚠️ 数量用 parseFloat：物料按米/公斤计，后端 BigDecimal（D-414 修过 1.32→1 截断）
 *
 * 事件：
 *   bind:success → 提交成功，detail = { materialCode, quantity }
 */
const api = require('../../utils/api');

/**
 * ⚠️ key 必须用**后端存储约定值**，不能用 PC 端列表的筛选值。
 * 后端 MaterialInboundOrchestrator.resolveUsageType 生成的是 STOCK / SAMPLE / BULK；
 * PC 端 MaterialTable 提交的也是 "BULK"。
 * 而 PC 端 MaterialPicking 下拉里的 production / sample **只是列表筛选值**，不是存储值
 * —— 我最初照抄了筛选值，导致出库记录的 usageType 与既有数据对不上（报表按值过滤会漏）。
 */
const USAGE_TYPES = [
  { key: 'BULK', label: '生产领料' },
  { key: 'SAMPLE', label: '样品领料' },
  { key: 'STOCK', label: '备货领料' },
];

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 预填物料编码（从物料库存 / 物料中心卡片点「出库」时携带） */
    materialCode: {
      type: String,
      value: '',
      observer: function (val) {
        if (!this._attached) return;
        this._applyCode(val);
      },
    },
    showScan: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    materialCode: '',
    materialInfo: null,
    stockId: '',
    queried: false,
    loading: false,
    submitting: false,

    quantity: '',
    unit: '',

    // 关联订单 / 款号
    orderOptions: [],
    orderNames: [],
    orderNo: '',
    styleNo: '',

    // 关联工厂
    factoryOptions: [],
    factoryNames: [],
    factoryId: '',
    factoryName: '',

    // 领料人
    receiverOptions: [],
    receiverNames: [],
    receiverId: '',
    receiverName: '',

    usageType: 'BULK',
    usageTypeLabel: '生产领料',
    typeOptions: USAGE_TYPES,

    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',

    reason: '',

    // 可搜索选择器（替代原生 picker —— 微信原生 picker **没有搜索**，
    // 订单/工厂/领料人常有上百条，只能一路滚，用户反馈"要找很久"）
    // D-517：remote=true 时按关键字远程搜索 + 分页，不再只搜已加载的第一页
    pickerVisible: false,
    pickerTitle: '',
    pickerOptions: [],
    pickerRemote: false,
    pickerKeyword: '',
    pickerPage: 1,
    pickerHasMore: false,
    pickerLoading: false,
    pickerKey: '',
    pickerValue: '',
  },

  lifetimes: {
    attached: function () {
      this._lastCode = '';
      // D-517：订单/工厂/领料人改为**打开选择器时按关键字远程搜索**，不再预拉前 100 条
      // （预拉只能搜到第一页，用户搜第 101 条永远搜不到）。仓库区域量小，仍走本地。
      this.loadAreas();
      var code = this.properties.materialCode;
      if (code) this._applyCode(code);
      this._attached = true;
    },
  },

  methods: {
    /** 统一入口：设置编码并查询（带去重） */
    _applyCode: function (code) {
      if (!code || code === this._lastCode) return;
      this._lastCode = code;
      this.setData({ materialCode: code }, function () {
        this.queryMaterial();
      }.bind(this));
    },

    // ────────── 物料查询 ──────────

    onCodeInput: function (e) { this.setData({ materialCode: e.detail.value }); },

    onScan: function () {
      var self = this;
      wx.scanCode({
        success: function (res) {
          var code = (res && res.result) || '';
          if (!code) { wx.showToast({ title: '扫码失败', icon: 'none' }); return; }
          self._lastCode = '';
          self._applyCode(code);
        },
        fail: function () {},
      });
    },

    onQuery: function () {
      if (!this.data.materialCode) {
        wx.showToast({ title: '请输入物料编码', icon: 'none' });
        return;
      }
      this.queryMaterial();
    },

    queryMaterial: async function () {
      this.setData({ loading: true });
      try {
        var res = await api.material.scanQuery(this.data.materialCode);
        var info = res && res.data ? res.data : res;
        if (!info || info.found === false) {
          this.setData({ queried: true, loading: false, materialInfo: null, stockId: '' });
          wx.showToast({ title: (info && info.message) || '物料不存在', icon: 'none' });
          return;
        }
        this.setData({
          materialInfo: info,
          stockId: String(info.stockId || ''),
          unit: info.unit || '',
          queried: true,
          loading: false,
        });
      } catch (e) {
        this.setData({ queried: true, loading: false, materialInfo: null, stockId: '' });
        wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' });
      }
    },

    // ────────── 下拉数据 ──────────

    loadOrders: async function () {
      try {
        var res = await api.production.listOrders({ page: 1, pageSize: 100 });
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (o) {
          return {
            orderNo: String(o.orderNo || o.order_no || ''),
            styleNo: String(o.styleNo || o.style_no || ''),
            name: String(o.orderNo || o.order_no || '-'),
          };
        }).filter(function (o) { return !!o.orderNo; });
        this.setData({
          orderOptions: options,
          orderNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载订单失败', e);
      }
    },

    loadFactories: async function () {
      try {
        var res = await api.factory.list({ page: 1, pageSize: 100 });
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (f) {
          return {
            id: String(f.id || ''),
            name: f.factoryName || f.name || '-',
            type: (f.factoryType || f.type || 'INTERNAL').toUpperCase(),
          };
        }).filter(function (f) { return !!f.name && f.name !== '-'; });
        this.setData({
          factoryOptions: options,
          factoryNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载工厂失败', e);
      }
    },

    loadReceivers: async function () {
      try {
        var res = await api.system.listUsers({ page: 1, pageSize: 100 });
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (u) {
          return {
            id: String(u.id || u.userId || ''),
            name: u.realName || u.name || u.username || u.nickname || '-',
          };
        }).filter(function (u) { return !!u.name && u.name !== '-'; });
        this.setData({
          receiverOptions: options,
          receiverNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载领料人失败', e);
      }
    },

    loadAreas: async function () {
      try {
        var res = await api.warehouse.listWarehouseAreas('MATERIAL');
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (a) {
          return { id: String(a.id || ''), name: a.areaName || a.name || '-' };
        });
        this.setData({
          areaOptions: options,
          areaNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载仓库区域失败', e);
      }
    },

    // ────────── 各项选择 ──────────

    // ────────── 可搜索选择器 ──────────
    // 把原来的 4 个原生 <picker> 统一换成底部可搜索弹层。
    // 选中后仍复用原有的 onXxxChange 处理器（逻辑只保留一份）。

    /** 打开某个字段的选择器（D-517：order/factory/receiver 走远程关键字搜索 + 分页） */
    _openPickerByKey: function (e) {
      var key = e.currentTarget.dataset.key;
      var map = {
        // D-517：物料/面料也能「选」，不再只能手输编码或扫码
        material: { title: '选择物料（编码/名称搜索）', remote: true, current: this.data.materialCode },
        order: { title: '选择关联订单', remote: true, current: this.data.orderNo },
        factory: { title: '选择关联工厂', remote: true, current: this.data.factoryId },
        receiver: { title: '选择领料人', remote: true, current: this.data.receiverId },
        area: { title: '选择仓库区域', remote: false, names: this.data.areaNames, current: this.data.warehouseAreaName },
      };
      var cfg = map[key];
      if (!cfg) return;
      this.setData({
        pickerKey: key,
        pickerTitle: cfg.title,
        pickerRemote: !!cfg.remote,
        pickerKeyword: '',
        pickerPage: 1,
        pickerHasMore: false,
        pickerLoading: false,
        // 远程：打开后由组件以空关键字触发 search 拉第一页；本地：直接给全量
        pickerOptions: cfg.remote ? [] : (cfg.names || []),
        pickerValue: cfg.current || '',
        pickerVisible: true,
      });
    },

    /** 远程搜索（组件已防抖）→ 第 1 页 */
    onPickerSearch: function (e) {
      if (!this.data.pickerRemote) return;
      var kw = (e && e.detail && e.detail.keyword) || '';
      var self = this;
      this.setData({ pickerKeyword: kw, pickerPage: 1 });
      this._fetchPickerOptions(this.data.pickerKey, kw, 1, function (list, hasMore) {
        self.setData({ pickerOptions: list, pickerHasMore: hasMore, pickerLoading: false });
      });
    },

    /** 滚到底 → 追加下一页 */
    onPickerLoadMore: function () {
      if (!this.data.pickerRemote || !this.data.pickerHasMore || this.data.pickerLoading) return;
      var self = this;
      var next = (this.data.pickerPage || 1) + 1;
      this.setData({ pickerPage: next });
      this._fetchPickerOptions(this.data.pickerKey, this.data.pickerKeyword, next, function (list, hasMore) {
        self.setData({
          pickerOptions: (self.data.pickerOptions || []).concat(list),
          pickerHasMore: hasMore,
          pickerLoading: false,
        });
      });
    },

    _PICKER_SIZE: 20,

    /**
     * 远程取数：订单按 orderNo、工厂按 factoryName、人员按 name（后端均为 LIKE）
     * @param {Function} cb (list, hasMore)
     */
    _fetchPickerOptions: function (key, kw, page, cb) {
      var SIZE = this._PICKER_SIZE;
      var self = this;
      this.setData({ pickerLoading: true });
      var params = { page: page, pageSize: SIZE };
      if (kw) {
        if (key === 'order') params.orderNo = kw;
        else if (key === 'factory') params.factoryName = kw;
        else if (key === 'material') params.keyword = kw;
        else params.name = kw;
      }
      var req = key === 'order'
        ? api.production.listOrders(params)
        : (key === 'factory' ? api.factory.list(params)
          : (key === 'material' ? api.material.listStock(params) : api.system.listUsers(params)));
      req.then(function (res) {
        var records = Array.isArray(res) ? res : ((res && (res.records || res.list || res.items)) || []);
        var list = records.map(function (r) {
          if (key === 'material') {
            var code = String(r.materialCode || '');
            // label = "编码 · 名称"，value = 物料编码（唯一）
            return {
              label: code + (r.materialName ? ' · ' + r.materialName : ''),
              value: code,
              stockId: String(r.stockId || r.id || ''),
            };
          }
          if (key === 'order') {
            var no = String(r.orderNo || r.order_no || '');
            // label 带上款号，同名/近名订单一眼可辨；value 用订单号（唯一）
            return { label: no + (r.styleNo ? ' · ' + r.styleNo : ''), value: no, styleNo: String(r.styleNo || '') };
          }
          if (key === 'factory') {
            return {
              label: r.factoryName || r.name || '',
              value: String(r.id || ''),
              type: (r.factoryType || r.type || 'INTERNAL').toUpperCase(),
            };
          }
          return {
            label: r.realName || r.name || r.username || r.nickname || '',
            value: String(r.id || r.userId || ''),
          };
        }).filter(function (o) { return o.label && o.value; });
        self.setData({ pickerLoading: false });
        cb(list, records.length >= SIZE);
      }).catch(function (err) {
        console.warn('[物料出库] 选择器加载失败', key, err);
        self.setData({ pickerLoading: false });
        cb([], false);
      });
    },

    /**
     * 选中：直接用组件回传的 value/item 写入，**不再按名称 indexOf 反查**
     * （同名工厂/同名员工会选中错误的一条 —— D-517 修掉的隐性 bug）
     */
    _onPickerSelectByKey: function (e) {
      var key = this.data.pickerKey;
      var d = (e && e.detail) || {};
      var label = d.label || '';
      var value = d.value || '';
      var item = d.item || {};
      if (key === 'material') {
        // 选中即按编码查询（与手输/扫码同一条链路）
        this.setData({ materialCode: value });
        if (typeof this._applyCode === 'function') this._applyCode(value);
        else this.queryMaterial();
      } else if (key === 'order') {
        this.setData({ orderNo: value, styleNo: item.styleNo || this.data.styleNo });
      } else if (key === 'factory') {
        this.setData({ factoryId: value, factoryName: label, factoryType: item.type || '' });
      } else if (key === 'receiver') {
        this.setData({ receiverId: value, receiverName: label });
      } else if (key === 'area') {
        // 仓库区域仍是本地列表（量小），沿用按名称反查
        var idx = (this.data.areaNames || []).indexOf(label);
        if (idx >= 0) this.onAreaChange({ detail: { value: idx } });
      }
    },

    /**
     * ⚠️ 统一用 <picker mode="selector"> 而非 wx.showActionSheet：
     * 后者 itemList **最多 6 项**，而订单/工厂/领料人可能上百条，必然失败。
     * picker 的 bindchange 回传 e.detail.value 为下标。
     */
    onOrderChange: function (e) {
      var o = this.data.orderOptions[e.detail.value];
      if (o) this.setData({ orderNo: o.orderNo, styleNo: o.styleNo || this.data.styleNo });
    },

    onFactoryChange: function (e) {
      var f = this.data.factoryOptions[e.detail.value];
      if (f) this.setData({ factoryId: f.id, factoryName: f.name, factoryType: f.type });
    },

    onReceiverChange: function (e) {
      var u = this.data.receiverOptions[e.detail.value];
      if (u) this.setData({ receiverId: u.id, receiverName: u.name });
    },

    onAreaChange: function (e) {
      var a = this.data.areaOptions[e.detail.value];
      if (a) this.setData({ warehouseAreaId: a.id, warehouseAreaName: a.name });
    },

    onSelectUsage: function (e) {
      var key = e.currentTarget.dataset.key;
      for (var i = 0; i < USAGE_TYPES.length; i++) {
        if (USAGE_TYPES[i].key === key) {
          this.setData({ usageType: key, usageTypeLabel: USAGE_TYPES[i].label });
          return;
        }
      }
    },

    onQtyInput: function (e) { this.setData({ quantity: e.detail.value }); },

    // D-513：手机端步进器（避免小屏手动输入数字）
    onQtyMinus: function () {
      var q = parseFloat(this.data.quantity) || 0;
      var next = +(q - 1).toFixed(2);
      this.setData({ quantity: next > 0 ? String(next) : '' });
    },

    onQtyPlus: function () {
      var q = parseFloat(this.data.quantity) || 0;
      this.setData({ quantity: String(+(q + 1).toFixed(2)) });
    },

    onReasonInput: function (e) { this.setData({ reason: e.detail.value }); },

    // ────────── 提交 ──────────

    onSubmit: async function () {
      if (this.data.submitting) return;
      var d = this.data;
      // 逐项按后端必填校验，给出明确提示（避免只报一个笼统错误）
      if (!d.stockId) { wx.showToast({ title: '请先查询物料', icon: 'none' }); return; }
      var qty = parseFloat(d.quantity);
      if (isNaN(qty) || qty <= 0) { wx.showToast({ title: '出库数量必须大于0', icon: 'none' }); return; }
      if (!d.receiverName) { wx.showToast({ title: '请选择领料人', icon: 'none' }); return; }
      if (!d.orderNo) { wx.showToast({ title: '请选择关联订单', icon: 'none' }); return; }
      if (!d.styleNo) { wx.showToast({ title: '缺少关联款号', icon: 'none' }); return; }
      if (!d.factoryName) { wx.showToast({ title: '请选择关联工厂', icon: 'none' }); return; }
      if (!d.usageType) { wx.showToast({ title: '请选择用料场景', icon: 'none' }); return; }

      this.setData({ submitting: true });
      try {
        await api.material.manualOutbound({
          stockId: d.stockId,
          quantity: qty,
          receiverId: d.receiverId,
          receiverName: d.receiverName,
          orderNo: d.orderNo,
          styleNo: d.styleNo,
          factoryId: d.factoryId,
          factoryName: d.factoryName,
          factoryType: d.factoryType || 'INTERNAL',
          usageType: d.usageType,
          warehouseAreaId: d.warehouseAreaId,
          reason: d.reason,
        });
        wx.showToast({ title: '出库成功', icon: 'success' });
        this.triggerEvent('success', { materialCode: d.materialCode, quantity: qty });
        this.setData({ submitting: false });
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '出库失败', icon: 'none' });
        this.setData({ submitting: false });
      }
    },
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
  },

});
