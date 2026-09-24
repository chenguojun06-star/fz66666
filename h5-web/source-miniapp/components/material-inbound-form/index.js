/**
 * 物料入库表单（通用组件）
 *
 * 为什么要抽成组件（D-514）：
 *   同一张表单有两个消费方 —— ① 独立页 pages/warehouse/material-inbound
 *   ② 物料中心 pages/warehouse/material-center 的「入库」tab（内联）。
 *   抽成组件后两边共用一份逻辑，避免"重复造轮子"（用户明确要求过不要重复造）。
 *
 * 后端契约（MaterialWarehouseOperationOrchestrator.freeInbound）：
 *   - 必填：materialCode、quantity(>0)
 *   - warehouseLocation / sourceType 缺省有兜底
 *   - sourceType 白名单（VALID_SOURCE_TYPES）：
 *     external_purchase / free_inbound / transfer_in / return_in / other_in / scan_inbound
 *     传白名单外的值后端会直接抛「不支持的入库来源类型」—— 故本组件的选项与
 *     PC 端 InboundDrawer、大货入库 finished-inbound 用**同一套 key**
 *   - 可选：warehouseAreaId / supplierName / unitPrice / remark / purchaseOrderId
 *
 * ⚠️ 数量必须支持小数：物料常按米/公斤计（1.32 米）。
 *    后端 quantity 为 BigDecimal，D-414 专门修过 intValue() 截断（1.32→1 少扣库存）。
 *
 * 事件：
 *   bind:success  → 提交成功，detail = { materialCode, quantity }
 *                   （跳转/刷新由父级决定：独立页 navigateBack，tab 内刷新列表）
 */
const api = require('../../utils/api');

/**
 * 入库来源 —— 必须与 PC 端 InboundDrawer「入库来源」、大货入库 finished-inbound
 * 的 SOURCE_TYPES 用**同一套 key**（后端 MaterialWarehouseOperationOrchestrator
 * .VALID_SOURCE_TYPES 是白名单，传错直接抛「不支持的入库来源类型」）：
 *   external_purchase / free_inbound / transfer_in / return_in / other_in / scan_inbound
 */
const SOURCE_TYPES = [
  { key: 'free_inbound', label: '自由入库' },
  { key: 'external_purchase', label: '采购到货' },
  { key: 'transfer_in', label: '调拨入库' },
  { key: 'return_in', label: '退货入库' },
  { key: 'other_in', label: '其他入库' },
];

/** 物料类型中文标签（与 material-center / PC 端一致） */
const TYPE_LABEL = {
  fabric: '面料',
  lining: '里料',
  accessory: '辅料',
};

Component({
  options: {
    // 允许父级通过 class 覆盖样式（与项目其它组件一致）
    addGlobalClass: true,
  },

  properties: {
    /** 预填物料编码（从物料库存 / 物料中心卡片点「入库」时携带） */
    materialCode: {
      type: String,
      value: '',
      observer: function (val) {
        // attached 之前 observer 会先触发一次，交给 attached 统一处理，避免重复查询
        if (!this._attached) return;
        this._applyCode(val);
      },
    },
    /** 是否显示扫码按钮 */
    showScan: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    materialCode: '',
    materialInfo: null,
    queried: false,
    loading: false,
    submitting: false,

    // 面料/里料/辅料 —— 决定「规格(码数)」显不显示（面料不显示服装码数）
    isFabric: false,
    typeLabel: '',
    // 面料属性：**只读展示**，从「物料资料」读取（手机端不填）
    fabricWidth: '',
    fabricWeight: '',
    fabricComposition: '',

    // 入库来源（对齐 PC 端 InboundDrawer）
    sourceTypes: SOURCE_TYPES,
    sourceType: 'free_inbound',
    sourceTypeLabel: '自由入库',

    quantity: '',
    unit: '',

    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',
    // D-514：库位改为**依赖仓库区域的下拉选择**（对齐 PC 端 InboundDrawer
    // 的 warehouseLocation Select —— PC 是「先选仓库，库位下拉才可用且必填」）
    locationOptions: [],
    locationNames: [],
    locationItems: [],
    warehouseLocation: '',
    locationLoading: false,

    supplierName: '',
    unitPrice: '',
    remark: '',

    // 可搜索选择器（替代原生 picker —— 微信原生 picker **没有搜索**）
    // D-517：remote=true 时按关键字远程搜索 + 分页（物料/面料）
    pickerVisible: false,
    pickerTitle: '',
    pickerOptions: [],
    pickerKey: '',
    pickerValue: '',
    pickerRemote: false,
    pickerKeyword: '',
    pickerPage: 1,
    pickerHasMore: false,
    pickerLoading: false,
  },

  lifetimes: {
    attached: function () {
      this._lastCode = '';
      this.loadAreas();
      var code = this.properties.materialCode;
      if (code) this._applyCode(code);
      this._attached = true;
    },
  },

  methods: {
    /** 统一入口：设置编码并查询（带去重，避免同一编码重复请求） */
    _applyCode: function (code) {
      if (!code || code === this._lastCode) return;
      this._lastCode = code;
      this.setData({ materialCode: code }, function () {
        this.queryMaterial();
      }.bind(this));
    },

    onCodeInput: function (e) {
      this.setData({ materialCode: e.detail.value });
    },

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
        // res 可能直接是对象，也可能包一层
        var info = res && res.data ? res.data : res;
        var mtype = (info && info.materialType) || '';
        this.setData({
          materialInfo: info || null,
          unit: (info && (info.unit || info.materialUnit)) || '',
          // 面料不显示服装码数（PC 端面料走「幅宽/克重/成分」，不问码数）
          isFabric: mtype === 'fabric',
          typeLabel: TYPE_LABEL[mtype] || mtype || '',
          queried: true,
          loading: false,
        });
        // 面料额外读「物料资料」的幅宽/克重/成分（只读展示，手机端不需要填）
        if (mtype === 'fabric') {
          this.loadFabricInfo(this.data.materialCode);
        } else {
          this.setData({ fabricWidth: '', fabricWeight: '', fabricComposition: '' });
        }
      } catch (e) {
        this.setData({ queried: true, loading: false, materialInfo: null });
        wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' });
      }
    },

    /**
     * 读取「物料资料」里的面料属性（幅宽 / 克重 / 成分）—— **只读展示，手机端不填**
     *
     * 为什么读物料资料、而不是读库存记录：
     *   MaterialStock 和 MaterialDatabase 都有 fabricWidth/Weight/Composition，
     *   但全仓搜 `setFabricWidth` 对 **MaterialStock 零命中** —— 库存表这三个字段
     *   后端从来没有写入过，读它永远是空。
     *   「物料资料」才是 PC 端维护它们的地方
     *   （MaterialFormDrawer.tsx 的「幅宽 / 克重 / 成分」）。
     */
    loadFabricInfo: async function (code) {
      if (!code) return;
      try {
        var res = await api.material.listDatabase({ keyword: code, page: 1, pageSize: 10 });
        var list = (res && res.records) || (Array.isArray(res) ? res : []) || [];
        var hit = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].materialCode === code) { hit = list[i]; break; }
        }
        this.setData({
          fabricWidth: (hit && hit.fabricWidth) || '',
          fabricWeight: (hit && hit.fabricWeight) || '',
          fabricComposition: (hit && hit.fabricComposition) || '',
        });
      } catch (e) {
        // 读不到不影响入库主流程，只在控制台留痕
        console.warn('[物料入库] 读取面料属性失败', e);
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
        console.warn('[物料入库] 加载仓库区域失败', e);
      }
    },

    // ────────── 可搜索选择器 ──────────
    // 原来的原生 <picker> 没有搜索，仓库区域/库位一多就得一路滚 → 换成底部可搜索弹层。
    // 选中后仍复用原有的 onAreaChange / onLocationChange（逻辑只保留一份）。

    _openPickerByKey: function (e) {
      var key = e.currentTarget.dataset.key;
      var map = {
        // D-517：物料/面料也能「选」，不再只能手输编码或扫码
        material: { title: '选择物料（编码/名称搜索）', remote: true, current: this.data.materialCode },
        area: { title: '选择仓库区域', names: this.data.areaNames, current: this.data.warehouseAreaName },
        location: { title: '选择库位', names: this.data.locationNames, current: this.data.warehouseLocation },
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
        pickerOptions: cfg.remote ? [] : (cfg.names || []),
        pickerValue: cfg.current || '',
        pickerVisible: true,
      });
    },

    /** D-517：远程搜索（物料走库存列表 keyword 模糊匹配 + 分页） */
    onPickerSearch: function (e) {
      if (!this.data.pickerRemote) return;
      var kw = (e && e.detail && e.detail.keyword) || '';
      var self = this;
      this.setData({ pickerKeyword: kw, pickerPage: 1 });
      this._fetchPickerOptions(this.data.pickerKey, kw, 1, function (list, hasMore) {
        self.setData({ pickerOptions: list, pickerHasMore: hasMore, pickerLoading: false });
      });
    },

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

    _fetchPickerOptions: function (key, kw, page, cb) {
      var SIZE = this._PICKER_SIZE;
      var self = this;
      this.setData({ pickerLoading: true });
      var params = { page: page, pageSize: SIZE };
      if (kw) params.keyword = kw;
      api.material.listStock(params).then(function (res) {
        var records = Array.isArray(res) ? res : ((res && (res.records || res.list || res.items)) || []);
        var list = records.map(function (r) {
          var code = String(r.materialCode || '');
          return { label: code + (r.materialName ? ' · ' + r.materialName : ''), value: code };
        }).filter(function (o) { return o.value; });
        self.setData({ pickerLoading: false });
        cb(list, records.length >= SIZE);
      }).catch(function (err) {
        console.warn('[物料入库] 物料搜索失败', err);
        self.setData({ pickerLoading: false });
        cb([], false);
      });
    },

    _onPickerSelectByKey: function (e) {
      var key = this.data.pickerKey;
      var label = (e.detail && e.detail.label) || '';
      if (key === 'material') {
        // 选中即按编码查询（与手输/扫码同一条链路）
        this.setData({ materialCode: (e.detail && e.detail.value) || '' });
        this._applyCode((e.detail && e.detail.value) || '');
        return;
      }
      var names = key === 'area' ? this.data.areaNames : this.data.locationNames;
      var idx = (names || []).indexOf(label);
      if (idx < 0) return;
      var ev = { detail: { value: idx } };
      if (key === 'area') this.onAreaChange(ev);
      else if (key === 'location') this.onLocationChange(ev);
    },

    /**
     * ⚠️ 用 <picker mode="selector"> 而非 wx.showActionSheet ——
     * 后者 itemList 最多 6 项，仓库区域可能超过，会直接失败。
     */
    onAreaChange: function (e) {
      var opt = this.data.areaOptions[e.detail.value];
      if (!opt) return;
      // 换仓库必须清空库位：库位从属于某个仓库，不清会提交到错误的库位
      // （PC 端 InboundDrawer 的 onChange 同样先 setFieldValue('warehouseLocation', undefined)）
      this.setData({
        warehouseAreaId: opt.id,
        warehouseAreaName: opt.name,
        warehouseLocation: '',
        locationOptions: [],
        locationNames: [],
        locationItems: [],
      });
      this.loadLocations(opt.id);
    },

    /** 加载该仓库下的库位（对齐 PC 端 useWarehouseLocationByArea('MATERIAL', areaId)） */
    loadLocations: async function (areaId) {
      if (!areaId) return;
      this.setData({ locationLoading: true });
      try {
        var res = await api.warehouse.listLocations('MATERIAL', areaId);
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var names = [];
        var items = [];
        for (var i = 0; i < list.length; i++) {
          var it = list[i] || {};
          var label = it.locationCode || it.locationName || '';
          if (!label) continue;
          var capacity = Number(it.capacity || 0);
          var used = Number(it.usedCapacity || 0);
          names.push(label);
          items.push({
            label: label,
            used: used,
            capacity: capacity,
            isFull: capacity > 0 && used >= capacity,
          });
        }
        this.setData({
          locationOptions: names,
          locationNames: names,
          locationItems: items,
          locationLoading: false,
        });
      } catch (err) {
        console.warn('[物料入库] 加载库位失败', err);
        this.setData({ locationOptions: [], locationNames: [], locationItems: [], locationLoading: false });
      }
    },

    onLocationChange: function (e) {
      var label = this.data.locationNames[e.detail.value];
      if (!label) return;
      // 满库位拦截（与样衣扫码页一致，避免超限）
      var items = this.data.locationItems || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].label === label && items[i].isFull) {
          wx.showToast({
            title: '库位 ' + label + ' 已满（' + items[i].used + '/' + items[i].capacity + '），请选其他库位',
            icon: 'none',
          });
          return;
        }
      }
      this.setData({ warehouseLocation: label });
    },

    onSelectSourceType: function (e) {
      var key = e.currentTarget.dataset.key;
      for (var i = 0; i < SOURCE_TYPES.length; i++) {
        if (SOURCE_TYPES[i].key === key) {
          this.setData({ sourceType: key, sourceTypeLabel: SOURCE_TYPES[i].label });
          return;
        }
      }
    },

    onQtyInput: function (e) {
      // 允许小数：不做 parseInt
      this.setData({ quantity: e.detail.value });
    },

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

    onSupplierInput: function (e) { this.setData({ supplierName: e.detail.value }); },
    onPriceInput: function (e) { this.setData({ unitPrice: e.detail.value }); },
    onRemarkInput: function (e) { this.setData({ remark: e.detail.value }); },

    onSubmit: async function () {
      if (this.data.submitting) return;
      var code = String(this.data.materialCode || '').trim();
      if (!code) {
        wx.showToast({ title: '物料编码不能为空', icon: 'none' });
        return;
      }
      // D-499：没有库存记录时后端会抛「物料库存记录不存在」（除非传 autoCreateStock=true
      // 并补 materialName/color/size）。这里直接拦住，避免用户填完才报错。
      if (!this.data.materialInfo) {
        wx.showToast({ title: '请先查询到物料库存记录', icon: 'none' });
        return;
      }
      // ⚠️ 用 parseFloat 而非 parseInt：物料数量支持小数（如 1.32 米）
      var qty = parseFloat(this.data.quantity);
      if (isNaN(qty) || qty <= 0) {
        wx.showToast({ title: '入库数量必须大于0', icon: 'none' });
        return;
      }

      this.setData({ submitting: true });
      try {
        await api.material.freeInbound({
          materialCode: code,
          quantity: qty,
          // 入库来源：key 已核对过后端白名单 VALID_SOURCE_TYPES，安全
          sourceType: this.data.sourceType || 'free_inbound',
          warehouseLocation: this.data.warehouseLocation || '',
          warehouseAreaId: this.data.warehouseAreaId || '',
          supplierName: this.data.supplierName || '',
          unitPrice: this.data.unitPrice || '',
          remark: this.data.remark || '',
        });
        wx.showToast({ title: '入库成功', icon: 'success' });
        // 交给父级决定后续（独立页返回上一页；tab 内刷新库存列表）
        this.triggerEvent('success', { materialCode: code, quantity: qty });
        this.setData({ submitting: false });
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '入库失败', icon: 'none' });
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
