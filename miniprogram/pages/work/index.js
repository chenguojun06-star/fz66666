const api = require('../../utils/api');

function normalizeText(v) {
  return (v || '').toString().trim();
}

function orderStatusText(status) {
  const s = normalizeText(status).toLowerCase();
  const map = {
    pending: '待生产',
    production: '生产中',
    completed: '已完成',
    delayed: '已逾期',
    cancelled: '已取消',
    canceled: '已取消',
    paused: '已暂停',
    returned: '已退回',
  };
  if (!s) return '';
  return map[s] || '未知';
}

function qualityStatusText(status) {
  const s = normalizeText(status).toLowerCase();
  const map = {
    qualified: '合格',
    unqualified: '次品待返修',
    repaired: '返修完成',
  };
  if (!s) return '';
  return map[s] || '未知';
}

function scanResultText(status) {
  const s = normalizeText(status).toLowerCase();
  const map = {
    success: '成功',
    failure: '失败',
  };
  if (!s) return '';
  return map[s] || '未知';
}

function stripWarehousingNode(list) {
  const items = Array.isArray(list) ? list : [];
  return items.filter((n) => {
    const id = normalizeText(n && n.id).toLowerCase();
    const name = normalizeText(n && n.name);
    return !(id === 'shipment' || name === '出货' || name === '发货' || name === '发运');
  });
}

const defaultNodes = [
  { id: 'cutting', name: '裁剪' },
  { id: 'production', name: '生产' },
  { id: 'quality', name: '质检' },
  { id: 'packaging', name: '包装' },
];

function clampPercent(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getNodeIndexFromProgress(nodes, progress) {
  if (!nodes || nodes.length <= 1) return 0;
  const idx = Math.round((clampPercent(progress) / 100) * (nodes.length - 1));
  return Math.max(0, Math.min(nodes.length - 1, idx));
}

function getProgressFromNodeIndex(nodes, index) {
  if (!nodes || nodes.length <= 1) return 0;
  const idx = Math.max(0, Math.min(nodes.length - 1, index));
  return clampPercent((idx / (nodes.length - 1)) * 100);
}

function parseProgressNodes(raw) {
  const text = normalizeText(raw);
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    const nodesRaw = obj && Array.isArray(obj.nodes) ? obj.nodes : [];
    return stripWarehousingNode(
      nodesRaw
        .map((n) => {
          const name = normalizeText(n && n.name);
          const id = normalizeText(n && n.id) || name;
          return name ? { id, name } : null;
        })
        .filter((n) => n && n.name),
    );
  } catch (e) {
    return [];
  }
}

function resolveNodesFromOrder(order) {
  const raw = normalizeText(order && order.progressWorkflowJson);
  const parsed = parseProgressNodes(raw);
  return parsed.length ? parsed : defaultNodes;
}

Page({
  data: {
    activeTab: 'orders_production',
    filters: {
      orderNo: '',
      styleNo: '',
      factoryName: '',

      wOrderNo: '',
      wStyleNo: '',
      warehouse: '',
      qualityIndex: 0,

      eOrderNo: '',
      eStyleNo: '',
    },
    qualityOptions: [
      { label: '全部', value: '' },
      { label: '合格', value: 'qualified' },
      { label: '次品待返修', value: 'unqualified' },
      { label: '返修完成', value: 'repaired' },
    ],
    orders: { loading: false, page: 1, pageSize: 10, hasMore: true, list: [] },
    warehousing: { loading: false, page: 1, pageSize: 10, hasMore: true, list: [] },
    exceptions: { loading: false, page: 1, pageSize: 10, hasMore: true, list: [] },
    rollback: {
      open: false,
      submitting: false,
      orderId: '',
      cuttingBundleQrCode: '',
      rollbackQuantity: 1,
      rollbackRemark: '',
    },
    rollbackStep: {
      open: false,
      submitting: false,
      orderId: '',
      orderNo: '',
      nextProcessName: '',
      nextProgress: 0,
      remark: '',
    },
    batchProgress: {
      open: false,
      submitting: false,
      selectedIds: [],
      progress: '',
      remark: '',
    },
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') app.setTabSelected(this, 1);
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    try {
      const nextTab = wx.getStorageSync('work_active_tab');
      if (nextTab) {
        const allowed = ['orders_production', 'orders_all', 'warehousing', 'exceptions'];
        if (allowed.includes(nextTab) && nextTab !== this.data.activeTab) {
          this.setData({ activeTab: nextTab });
        }
        wx.removeStorageSync('work_active_tab');
      }
    } catch (e) {
      null;
    }
    this.ensureLoaded();
  },

  onPullDownRefresh() {
    this.refreshActive().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMoreActive();
  },

  ensureLoaded() {
    const t = this.data.activeTab;
    if (t === 'orders_all' || t === 'orders_production') {
      if (this.data.orders.list.length === 0) this.loadOrders(true);
      return;
    }
    if (t === 'warehousing') {
      if (this.data.warehousing.list.length === 0) this.loadWarehousing(true);
      return;
    }
    if (t === 'exceptions') {
      if (this.data.exceptions.list.length === 0) this.loadExceptions(true);
    }
  },

  onTab(e) {
    const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    this.ensureLoaded();
  },

  goScan() {
    wx.switchTab({ url: '/pages/scan/index' });
  },

  onOrderNoInput(e) {
    this.setData({ 'filters.orderNo': (e && e.detail && e.detail.value) || '' });
  },
  onStyleNoInput(e) {
    this.setData({ 'filters.styleNo': (e && e.detail && e.detail.value) || '' });
  },
  onFactoryNameInput(e) {
    this.setData({ 'filters.factoryName': (e && e.detail && e.detail.value) || '' });
  },

  toggleBatchProgress() {
    this.setData({ 'batchProgress.open': !this.data.batchProgress.open });
  },

  onBatchSelectChange(e) {
    const ids = e && e.detail && Array.isArray(e.detail.value) ? e.detail.value : [];
    this.setData({ 'batchProgress.selectedIds': ids.map((v) => String(v || '').trim()).filter(Boolean) });
  },

  onBatchProgressInput(e) {
    this.setData({ 'batchProgress.progress': (e && e.detail && e.detail.value) || '' });
  },

  onBatchProgressRemarkInput(e) {
    this.setData({ 'batchProgress.remark': (e && e.detail && e.detail.value) || '' });
  },

  clearBatchSelection() {
    this.setData({ 'batchProgress.selectedIds': [] });
  },

  async submitBatchProgress() {
    if (this.data.batchProgress.submitting) return;
    const app = getApp();
    const ids = Array.isArray(this.data.batchProgress.selectedIds) ? this.data.batchProgress.selectedIds : [];
    if (!ids.length) {
      wx.showToast({ title: '请选择订单', icon: 'none' });
      return;
    }

    const progressInput = Number(this.data.batchProgress.progress);
    if (!Number.isFinite(progressInput)) {
      wx.showToast({ title: '请输入进度', icon: 'none' });
      return;
    }
    const targetProgress = clampPercent(progressInput);
    const remark = normalizeText(this.data.batchProgress.remark);

    const list = Array.isArray(this.data.orders.list) ? this.data.orders.list : [];
    const selectedOrders = list.filter((o) => ids.includes(normalizeText(o && o.id)));
    const needRemark = selectedOrders.some((o) => (Number(o && o.productionProgress) || 0) > targetProgress);
    if (needRemark && !remark) {
      wx.showToast({ title: '请填写问题点', icon: 'none' });
      return;
    }

    this.setData({ 'batchProgress.submitting': true });
    try {
      const settled = await Promise.allSettled(
        selectedOrders.map((o) =>
          api.production.updateProgress({
            id: normalizeText(o && o.id),
            progress: targetProgress,
            rollbackRemark: needRemark ? remark : undefined,
          }),
        ),
      );
      const success = settled.filter((s) => s.status === 'fulfilled').length;
      const failed = settled.length - success;
      wx.showToast({ title: `成功${success}，失败${failed}`, icon: failed ? 'none' : 'success' });

      this.setData({
        batchProgress: {
          ...this.data.batchProgress,
          submitting: false,
          selectedIds: [],
          progress: '',
          remark: '',
        },
      });

      if (this.data.activeTab === 'orders_all' || this.data.activeTab === 'orders_production') {
        if (app && typeof app.resetPagedList === 'function') app.resetPagedList(this, 'orders');
        await this.loadOrders(true);
      }
    } catch (e) {
      if (e && e.type === 'auth') return;
      if (app && typeof app.toastError === 'function') app.toastError(e, '更新失败');
      else wx.showToast({ title: '更新失败', icon: 'none' });
    } finally {
      this.setData({ 'batchProgress.submitting': false });
    }
  },

  clearOrderFilters() {
    this.setData(
      {
        filters: {
          ...this.data.filters,
          orderNo: '',
          styleNo: '',
          factoryName: '',
        },
      },
      () => {
        const app = getApp();
        if (app && typeof app.resetPagedList === 'function') app.resetPagedList(this, 'orders');
        if (this.data.activeTab === 'orders_all' || this.data.activeTab === 'orders_production') {
          this.loadOrders(true);
        }
      },
    );
  },

  onWOrderNoInput(e) {
    this.setData({ 'filters.wOrderNo': (e && e.detail && e.detail.value) || '' });
  },
  onWStyleNoInput(e) {
    this.setData({ 'filters.wStyleNo': (e && e.detail && e.detail.value) || '' });
  },
  onWarehouseInput(e) {
    this.setData({ 'filters.warehouse': (e && e.detail && e.detail.value) || '' });
  },

  async openStepRollback(e) {
    const orderId = normalizeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    if (!orderId) return;
    const order = (this.data.orders.list || []).find((r) => normalizeText(r && r.id) === orderId);
    if (!order) {
      wx.showToast({ title: '未找到订单', icon: 'none' });
      return;
    }

    let detail = null;
    try {
      detail = await api.production.orderDetail(orderId);
    } catch (e2) {
      detail = null;
    }

    const nodeSource = detail || order;
    const nodes = stripWarehousingNode(resolveNodesFromOrder(nodeSource));
    const progress = Number(nodeSource && nodeSource.productionProgress) || 0;
    const idx = getNodeIndexFromProgress(nodes, progress);
    if (idx <= 0) {
      wx.showToast({ title: '当前已是第一步', icon: 'none' });
      return;
    }
    const nextIdx = idx - 1;
    const nextProgress = getProgressFromNodeIndex(nodes, nextIdx);
    const nextProcessName = normalizeText(nodes[nextIdx] && nodes[nextIdx].name) || '上一步';

    this.setData({
      rollbackStep: {
        open: true,
        submitting: false,
        orderId,
        orderNo: normalizeText(order && order.orderNo),
        nextProcessName,
        nextProgress,
        remark: '',
      },
    });
  },

  onRollbackStepRemarkInput(e) {
    this.setData({ 'rollbackStep.remark': (e && e.detail && e.detail.value) || '' });
  },

  closeStepRollback() {
    this.setData({
      rollbackStep: {
        open: false,
        submitting: false,
        orderId: '',
        orderNo: '',
        nextProcessName: '',
        nextProgress: 0,
        remark: '',
      },
    });
  },

  async submitStepRollback() {
    if (this.data.rollbackStep.submitting) return;
    const app = getApp();
    const orderId = normalizeText(this.data.rollbackStep.orderId);
    const remark = normalizeText(this.data.rollbackStep.remark);
    const nextProgress = clampPercent(Number(this.data.rollbackStep.nextProgress) || 0);
    const nextProcessName = normalizeText(this.data.rollbackStep.nextProcessName) || '上一步';

    if (!orderId) return;
    if (!remark) {
      wx.showToast({ title: '请填写问题点', icon: 'none' });
      return;
    }

    this.setData({ 'rollbackStep.submitting': true });
    try {
      await api.production.updateProgress({
        id: orderId,
        progress: nextProgress,
        rollbackRemark: remark,
        rollbackToProcessName: nextProcessName,
      });
      wx.showToast({ title: '回流成功', icon: 'success' });
      this.closeStepRollback();
      if (this.data.activeTab === 'orders_all' || this.data.activeTab === 'orders_production') {
        if (app && typeof app.resetPagedList === 'function') app.resetPagedList(this, 'orders');
        await this.loadOrders(true);
      }
    } catch (e3) {
      if (e3 && e3.type === 'auth') return;
      if (app && typeof app.toastError === 'function') app.toastError(e3, '回流失败');
      else wx.showToast({ title: '回流失败', icon: 'none' });
    } finally {
      this.setData({ 'rollbackStep.submitting': false });
    }
  },

  toggleRollback() {
    this.setData({ 'rollback.open': !this.data.rollback.open });
  },

  onRollbackOrderIdInput(e) {
    this.setData({ 'rollback.orderId': (e && e.detail && e.detail.value) || '' });
  },

  onRollbackQrInput(e) {
    this.setData({ 'rollback.cuttingBundleQrCode': (e && e.detail && e.detail.value) || '' });
  },

  onRollbackQtyInput(e) {
    const v = Number((e && e.detail && e.detail.value) || 1);
    const n = Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
    this.setData({ 'rollback.rollbackQuantity': n });
  },

  onRollbackRemarkInput(e) {
    this.setData({ 'rollback.rollbackRemark': (e && e.detail && e.detail.value) || '' });
  },

  onScanRollbackQr() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => {
        const qr = res && res.result != null ? String(res.result).trim() : '';
        if (!qr) return;
        this.setData({ 'rollback.cuttingBundleQrCode': qr });
      },
    });
  },

  async submitRollback() {
    if (this.data.rollback.submitting) return;
    const app = getApp();
    const orderId = normalizeText(this.data.rollback.orderId);
    const cuttingBundleQrCode = normalizeText(this.data.rollback.cuttingBundleQrCode);
    const qty = Number(this.data.rollback.rollbackQuantity) || 0;
    const rollbackRemark = normalizeText(this.data.rollback.rollbackRemark);

    if (!cuttingBundleQrCode) {
      wx.showToast({ title: '请扫码扎号二维码', icon: 'none' });
      return;
    }
    if (!qty || qty <= 0) {
      wx.showToast({ title: '请输入回退数量', icon: 'none' });
      return;
    }
    if (!rollbackRemark) {
      wx.showToast({ title: '请填写问题点', icon: 'none' });
      return;
    }

    this.setData({ 'rollback.submitting': true });
    try {
      await api.production.rollbackByBundle({
        orderId: orderId || undefined,
        cuttingBundleQrCode,
        rollbackQuantity: qty,
        rollbackRemark: rollbackRemark || undefined,
      });
      wx.showToast({ title: '回退成功', icon: 'success' });
      this.setData({
        rollback: {
          ...this.data.rollback,
          submitting: false,
          open: false,
          orderId: '',
          cuttingBundleQrCode: '',
          rollbackQuantity: 1,
          rollbackRemark: '',
        },
      });
      if (this.data.activeTab === 'warehousing') {
        const app2 = getApp();
        if (app2 && typeof app2.resetPagedList === 'function') app2.resetPagedList(this, 'warehousing');
        this.loadWarehousing(true);
      }
    } catch (e) {
      if (e && e.type === 'auth') return;
      if (app && typeof app.toastError === 'function') app.toastError(e, '回退失败');
      else wx.showToast({ title: '回退失败', icon: 'none' });
    } finally {
      this.setData({ 'rollback.submitting': false });
    }
  },
  onQualityPickerChange(e) {
    const idx = Number((e && e.detail && e.detail.value) || 0);
    this.setData({ 'filters.qualityIndex': Number.isFinite(idx) ? idx : 0 });
  },
  clearWarehousingFilters() {
    this.setData(
      {
        filters: {
          ...this.data.filters,
          wOrderNo: '',
          wStyleNo: '',
          warehouse: '',
          qualityIndex: 0,
        },
      },
      () => {
        const app = getApp();
        if (app && typeof app.resetPagedList === 'function') app.resetPagedList(this, 'warehousing');
        if (this.data.activeTab === 'warehousing') {
          this.loadWarehousing(true);
        }
      },
    );
  },

  onEOrderNoInput(e) {
    this.setData({ 'filters.eOrderNo': (e && e.detail && e.detail.value) || '' });
  },
  onEStyleNoInput(e) {
    this.setData({ 'filters.eStyleNo': (e && e.detail && e.detail.value) || '' });
  },
  clearExceptionFilters() {
    this.setData(
      {
        filters: {
          ...this.data.filters,
          eOrderNo: '',
          eStyleNo: '',
        },
      },
      () => {
        const app = getApp();
        if (app && typeof app.resetPagedList === 'function') app.resetPagedList(this, 'exceptions');
        if (this.data.activeTab === 'exceptions') {
          this.loadExceptions(true);
        }
      },
    );
  },

  refreshActive() {
    const t = this.data.activeTab;
    if (t === 'orders_all' || t === 'orders_production') return this.loadOrders(true);
    if (t === 'warehousing') return this.loadWarehousing(true);
    if (t === 'exceptions') return this.loadExceptions(true);
    return Promise.resolve();
  },

  loadMoreActive() {
    const t = this.data.activeTab;
    if (t === 'orders_all' || t === 'orders_production') return this.loadOrders(false);
    if (t === 'warehousing') return this.loadWarehousing(false);
    if (t === 'exceptions') return this.loadExceptions(false);
    return Promise.resolve();
  },

  loadOrders(reset) {
    const app = getApp();
    if (!app || typeof app.loadPagedList !== 'function') return Promise.resolve();

    return app.loadPagedList(
      this,
      'orders',
      reset === true,
      async ({ page, pageSize }) => {
        const f = this.data.filters;
        const params = {
          page,
          pageSize,
          orderNo: normalizeText(f.orderNo),
          styleNo: normalizeText(f.styleNo),
          factoryName: normalizeText(f.factoryName),
        };
        if (this.data.activeTab === 'orders_production') params.status = 'production';
        return api.production.listOrders(params);
      },
      (r) => ({
        ...r,
        statusText: orderStatusText(r && r.status),
      }),
    );
  },

  loadWarehousing(reset) {
    const app = getApp();
    if (!app || typeof app.loadPagedList !== 'function') return Promise.resolve();

    return app.loadPagedList(
      this,
      'warehousing',
      reset === true,
      async ({ page, pageSize }) => {
        const f = this.data.filters;
        const qs = this.data.qualityOptions[this.data.filters.qualityIndex].value;
        const params = {
          page,
          pageSize,
          orderNo: normalizeText(f.wOrderNo),
          styleNo: normalizeText(f.wStyleNo),
          warehouse: normalizeText(f.warehouse),
          qualityStatus: normalizeText(qs),
        };
        return api.production.listWarehousing(params);
      },
      (r) => ({
        ...r,
        qualityStatusText: qualityStatusText(r && r.qualityStatus),
      }),
    );
  },

  loadExceptions(reset) {
    const app = getApp();
    if (!app || typeof app.loadPagedList !== 'function') return Promise.resolve();

    return app.loadPagedList(
      this,
      'exceptions',
      reset === true,
      async ({ page, pageSize }) => {
        const f = this.data.filters;
        const params = {
          page,
          pageSize,
          orderNo: normalizeText(f.eOrderNo),
          styleNo: normalizeText(f.eStyleNo),
          scanType: 'orchestration',
          scanResult: 'failure',
        };
        return api.production.listScans(params);
      },
      (r) => ({
        ...r,
        scanResultText: scanResultText(r && r.scanResult),
      }),
    );
  },
});
