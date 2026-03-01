const api = require('../../utils/api');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../utils/fileUrl');

const DEFAULT_FORM = {
  orderNo: '',
  factoryIndex: -1,
  urgencyLevel: 'normal',
  plateTypeIndex: -1,
  plannedStartDate: '',
  plannedEndDate: '',
  orderLines: [],
  totalQuantity: 0,
};

let _lineKey = 0;

Page({
  data: {
    keyword: '',
    loading: false,
    styles: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    errorMsg: '',  // API 错误信息（显示在页面上）

    // 下单弹窗
    modal: { visible: false, title: '新建订单' },
    selectedStyle: null,
    form: { ...DEFAULT_FORM, orderLines: [] },
    factoryList: [],
    factoryNames: [],
    plateTypes: [],
    submitting: false,
  },

  onLoad() {
    this.fetchStyles(true);
    this.fetchFactories();
    this.fetchPlateTypes();
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
  },

  onPullDownRefresh() {
    this.fetchStyles(true).finally(() => wx.stopPullDownRefresh());
  },

  // ==================== 搜索 ====================
  onSearchInput(e) {
    this.setData({ keyword: (e.detail.value || '').trim() });
  },

  doSearch() {
    this.fetchStyles(true);
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.fetchStyles(true);
  },

  retryLoad() {
    this.setData({ errorMsg: '' });
    this.fetchStyles(true);
  },

  // ==================== 款式列表 ====================
  async fetchStyles(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true, errorMsg: '' });
    try {
      const params = { page, pageSize: this.data.pageSize };
      if (this.data.keyword) params.keyword = this.data.keyword;
      console.log('[Order] fetchStyles 开始请求, params=', JSON.stringify(params));
      const res = await api.style.listStyles(params);
      console.log('[Order] fetchStyles 返回成功, type=', typeof res, ', keys=', res ? Object.keys(res) : 'null');
      const records = Array.isArray(res) ? res : (res && res.records) || [];
      const total = (res && res.total) || records.length;
      console.log('[Order] records.length=', records.length, ', total=', total);
      if (records.length === 0 && page === 1) {
        console.warn('[Order] API 返回空数据, 完整返回值:', JSON.stringify(res).substring(0, 500));
      }
      let items = records.map(s => this._transformStyle(s));
      // 按下单次数降序排列（无搜索词时显示排行）
      if (!this.data.keyword) {
        items.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
        items.forEach((it, i) => { it.rank = i + 1; });
      }

      if (reset) {
        this.setData({ styles: items, page: 2, hasMore: items.length < total });
      } else {
        const merged = this.data.styles.concat(items);
        // 追加分页时重新排序
        if (!this.data.keyword) {
          merged.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
          merged.forEach((it, i) => { it.rank = i + 1; });
        }
        this.setData({ styles: merged, page: page + 1, hasMore: merged.length < total });
      }
    } catch (err) {
      const errDetail = (err && err.errMsg) || (err && err.message) || JSON.stringify(err);
      console.error('[Order] fetchStyles 请求失败:', errDetail, err);
      this.setData({ errorMsg: '加载失败: ' + errDetail });
      toast.error(errDetail || '加载款式失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  _transformStyle(s) {
    let latestOrderTimeShort = '';
    if (s.latestOrderTime) {
      const d = String(s.latestOrderTime).substring(0, 10);
      latestOrderTimeShort = d;
    }
    return {
      id: s.id,
      cover: getAuthedImageUrl(s.cover || s.coverUrl || ''),
      styleNo: s.styleNo || '',
      styleName: s.styleName || '',
      size: s.size || s.sizeRange || '',
      displayQty: s.sampleQuantity || s.orderQuantity || 0,
      latestOrderTimeShort,
      latestOrderCreator: s.latestOrderCreator || '',
      orderCount: s.orderCount || 0,
    };
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.fetchStyles(false);
  },

  // ==================== 下单弹窗 ====================
  openCreateOrder(e) {
    const idx = e.currentTarget.dataset.index;
    const style = this.data.styles[idx];
    if (!style) return;

    this.setData({
      selectedStyle: style,
      'modal.visible': true,
      'modal.title': `下单 · ${style.styleNo}`,
      form: { ...DEFAULT_FORM, orderLines: [this._newLine()] },
      submitting: false,
    });
    this.generateOrderNo();
  },

  closeModal() {
    this.setData({ 'modal.visible': false, selectedStyle: null });
  },

  // ==================== 订单号 ====================
  async generateOrderNo() {
    try {
      const no = await api.serial.generate('ORDER_NO');
      if (no) {
        this.setData({ 'form.orderNo': typeof no === 'string' ? no : String(no) });
      }
    } catch (err) {
      console.warn('[Order] generateOrderNo failed', err);
      // 兜底：用时间戳生成
      const ts = new Date();
      const fallback = 'PO' +
        ts.getFullYear() +
        String(ts.getMonth() + 1).padStart(2, '0') +
        String(ts.getDate()).padStart(2, '0') +
        String(ts.getHours()).padStart(2, '0') +
        String(ts.getMinutes()).padStart(2, '0') +
        String(ts.getSeconds()).padStart(2, '0');
      this.setData({ 'form.orderNo': fallback });
    }
  },

  // ==================== 工厂 & 字典 ====================
  async fetchFactories() {
    try {
      const res = await api.factory.list();
      const list = Array.isArray(res) ? res : (res && res.records) || [];
      const names = list.map(f => f.factoryName || f.name || '');
      this.setData({ factoryList: list, factoryNames: names });
    } catch (err) {
      console.warn('[Order] fetchFactories failed', err);
    }
  },

  async fetchPlateTypes() {
    try {
      const res = await api.system.getDictList('plate_type');
      const list = Array.isArray(res) ? res : (res && res.records) || [];
      const types = list.map(d => ({
        label: d.dictLabel || d.label || d.name || '',
        value: d.dictValue || d.value || d.code || '',
      }));
      this.setData({ plateTypes: types });
    } catch (err) {
      console.warn('[Order] fetchPlateTypes failed', err);
      // 兜底：硬编码常见单型
      this.setData({
        plateTypes: [
          { label: '首单', value: '首单' },
          { label: '翻单', value: '翻单' },
          { label: '返修', value: '返修' },
        ],
      });
    }
  },

  // ==================== 表单输入 ====================
  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const val = (e.detail.value || '').trim();
    this.setData({ [`form.${field}`]: val });
  },

  onFactoryChange(e) {
    this.setData({ 'form.factoryIndex': Number(e.detail.value) });
  },

  setUrgency(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ 'form.urgencyLevel': val });
  },

  onPlateTypeChange(e) {
    this.setData({ 'form.plateTypeIndex': Number(e.detail.value) });
  },

  onStartDateChange(e) {
    this.setData({ 'form.plannedStartDate': e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ 'form.plannedEndDate': e.detail.value });
  },

  // ==================== 订单明细行 ====================
  _newLine() {
    _lineKey += 1;
    return { key: _lineKey, color: '', size: '', quantity: '' };
  },

  addOrderLine() {
    const lines = this.data.form.orderLines.concat([this._newLine()]);
    this.setData({ 'form.orderLines': lines });
  },

  removeOrderLine(e) {
    const idx = e.currentTarget.dataset.idx;
    const lines = this.data.form.orderLines.filter((_, i) => i !== idx);
    this._recalcTotal(lines);
  },

  onLineInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value || '';
    this.setData({ [`form.orderLines[${idx}].${field}`]: val });
    if (field === 'quantity') {
      this._recalcTotal();
    }
  },

  _recalcTotal(lines) {
    const list = lines || this.data.form.orderLines;
    const total = list.reduce((sum, l) => sum + (parseInt(l.quantity, 10) || 0), 0);
    if (lines) {
      this.setData({ 'form.orderLines': lines, 'form.totalQuantity': total });
    } else {
      this.setData({ 'form.totalQuantity': total });
    }
  },

  // ==================== 提交订单 ====================
  async submitOrder() {
    if (this.data.submitting) return;
    const { form, selectedStyle, factoryList, plateTypes } = this.data;

    // 校验
    if (!form.orderNo) { toast.error('请输入或生成订单号'); return; }
    if (form.factoryIndex < 0) { toast.error('请选择加工厂'); return; }
    const validLines = form.orderLines.filter(l => l.color && l.size && parseInt(l.quantity, 10) > 0);
    if (validLines.length === 0) { toast.error('请至少添加一条订单明细（颜色+码数+数量）'); return; }

    const factory = factoryList[form.factoryIndex] || {};
    const plateType = form.plateTypeIndex >= 0 ? (plateTypes[form.plateTypeIndex] || {}).value : '';
    const orderQuantity = validLines.reduce((s, l) => s + parseInt(l.quantity, 10), 0);

    const payload = {
      orderNo: form.orderNo,
      styleId: selectedStyle.id,
      styleNo: selectedStyle.styleNo,
      styleName: selectedStyle.styleName,
      factoryId: factory.id || factory.factoryId || '',
      factoryName: factory.factoryName || factory.name || '',
      urgencyLevel: form.urgencyLevel || 'normal',
      plateType: plateType,
      orderQuantity: orderQuantity,
      orderDetails: JSON.stringify(validLines.map(l => ({
        color: l.color,
        size: l.size,
        quantity: parseInt(l.quantity, 10),
      }))),
      plannedStartDate: form.plannedStartDate || undefined,
      plannedEndDate: form.plannedEndDate || undefined,
    };

    this.setData({ submitting: true });
    try {
      await api.production.createOrder(payload);
      toast.success('下单成功');
      this.closeModal();
      // 刷新列表
      this.fetchStyles(true);
    } catch (err) {
      console.error('[Order] submitOrder error', err);
      toast.error((err && err.errMsg) || '下单失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
