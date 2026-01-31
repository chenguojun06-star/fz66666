const api = require('../../utils/api');
const { validateProductionOrder, normalizeData } = require('../../utils/dataValidator');
const { errorHandler } = require('../../utils/errorHandler');
const { syncManager } = require('../../utils/syncManager');
const { orderStatusText } = require('../../utils/orderStatusHelper');
const { onDataRefresh, triggerDataRefresh } = require('../../utils/eventBus');
const { toast } = require('../../utils/uiHelper');
const { validateFields, validators } = require('../../utils/validator');
const { parseProductionOrderLines } = require('../../utils/orderParser');

// ==================== 常量定义 ====================

/**
 * 菲号弹窗初始状态（消除重复代码）
 */
const INITIAL_BUNDLE_MODAL = {
  visible: false,
  loading: false,
  orderId: '',
  orderNo: '',
  styleNo: '',
  items: [{ color: '', size: '', quantity: '' }],
};

// ==================== 辅助函数 ====================

function normalizeText(v) {
  return (v || '').toString().trim();
}

function isClosedStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'canceled' || s === 'paused';
}

function buildSizeMeta(order) {
  const lines = parseProductionOrderLines(order);
  if (!lines.length) {
    return { sizeList: [], sizeQtyList: [], sizeTotal: 0 };
  }

  const sizeMap = new Map();
  let total = 0;

  lines.forEach(line => {
    const size = normalizeText(line && line.size);
    const qty = Number(line && line.quantity) || 0;
    if (!size || qty <= 0) {
      return;
    }
    total += qty;
    sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
  });

  const sizes = Array.from(sizeMap.keys());
  const sizeQtyList = sizes.map(size => sizeMap.get(size));

  return { sizeList: sizes, sizeQtyList, sizeTotal: total };
}

/**
 * 转换订单数据（消除重复代码）
 * 将原始订单数据转换为页面所需的格式，包括尺码统计
 * @param {Object} r - 原始订单数据
 * @returns {Object} 转换后的订单数据
 */
function transformOrderData(r) {
  const validated = validateAndNormalizeOrder(r);
  const source = validated || r || {};
  const sizeMeta = buildSizeMeta(source);
  return {
    ...source,
    statusText: orderStatusText(source.status),
    isClosed: isClosedStatus(source.status),
    sizeList: sizeMeta.sizeList,
    sizeQtyList: sizeMeta.sizeQtyList,
    sizeTotal: sizeMeta.sizeTotal,
  };
}

/**
 * 验证并规范化订单数据
 */
function validateAndNormalizeOrder(order) {
  // 规范化：填充默认值
  const normalized = normalizeData(order, {
    id: { required: true, type: 'string' },
    orderNo: { required: true, type: 'string' },
    styleNo: { required: true, type: 'string' },
    orderQuantity: { required: true, type: 'number', default: 0 },
    completedQuantity: { required: true, type: 'number', default: 0 },
    productionProgress: { required: true, type: 'number', default: 0 },
    progressWorkflowJson: { required: true, type: 'string', default: '{}' },
    status: { required: true, type: 'string' },
  });

  // 验证
  const validation = validateProductionOrder(normalized);
  if (!validation.valid) {
    // 验证失败 - 使用错误处理而非日志
    return null;
  }

  return normalized;
}

// 以下函数已移至 utils/orderStatusHelper.js
// - orderStatusText
// - qualityStatusText
// - scanResultText

function stripWarehousingNode(list) {
  const items = Array.isArray(list) ? list : [];
  return items.filter(n => {
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
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getNodeIndexFromProgress(nodes, progress) {
  if (!nodes || nodes.length <= 1) {
    return 0;
  }
  const idx = Math.round((clampPercent(progress) / 100) * (nodes.length - 1));
  return Math.max(0, Math.min(nodes.length - 1, idx));
}

function getProgressFromNodeIndex(nodes, index) {
  if (!nodes || nodes.length <= 1) {
    return 0;
  }
  const idx = Math.max(0, Math.min(nodes.length - 1, index));
  return clampPercent((idx / (nodes.length - 1)) * 100);
}

function parseProgressNodes(raw) {
  const text = normalizeText(raw);
  if (!text) {
    return [];
  }
  try {
    const obj = JSON.parse(text);
    const nodesRaw = obj && Array.isArray(obj.nodes) ? obj.nodes : [];
    return stripWarehousingNode(
      nodesRaw
        .map(n => {
          const name = normalizeText(n && n.name);
          const id = normalizeText(n && n.id) || name;
          return name ? { id, name } : null;
        })
        .filter(n => n && n.name)
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
    globalSearch: {
      keyword: '',
      hasSearched: false,
      loading: false,
      results: [],
    },
    activeTab: 'all',
    filters: {
      orderNo: '',
      styleNo: '',
      factoryName: '',
    },
    orders: { loading: false, page: 1, pageSize: 10, hasMore: true, list: [] },
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
    bundleModal: { ...INITIAL_BUNDLE_MODAL },
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, 1);
    }
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
    try {
      const nextTab = wx.getStorageSync('work_active_tab');
      if (nextTab) {
        const allowed = ['all', 'procurement', 'cutting', 'sewing', 'warehousing'];
        if (allowed.includes(nextTab) && nextTab !== this.data.activeTab) {
          this.setData({ activeTab: nextTab });
        }
        wx.removeStorageSync('work_active_tab');
      }
    } catch (e) {
      null;
    }

    // ⚠️ 强制刷新订单列表（应对后端数据变更）
    this.loadOrders(true);

    // 检查是否有pending_order_hint，如果有则显示提示
    try {
      const pendingOrderHint = wx.getStorageSync('pending_order_hint');
      if (pendingOrderHint) {
        toast.info(`请处理订单: ${pendingOrderHint}`, 3000);
        wx.removeStorageSync('pending_order_hint');
      }
    } catch (e) {
      console.error('检查pending_order_hint失败', e);
    }

    // 加载提醒列表（不弹窗）
    this.loadReminders();

    // 启动订单列表的实时同步 (30 秒轮询一次)
    this.setupOrderSync();

    // 设置数据刷新监听
    this.setupDataRefreshListener();

    this.ensureLoaded();
  },

  setupDataRefreshListener() {
    // 如果已经设置监听，先取消旧的
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
    }

    // 订阅数据刷新事件
    this._unsubscribeRefresh = onDataRefresh(_payload => {
      // 刷新当前页面数据
      this.loadOrders(true);
    });
  },

  onPullDownRefresh() {
    this.refreshActive().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMoreActive();
  },

  ensureLoaded() {
    // 所有标签页都加载订单列表
    if (this.data.orders.list.length === 0) {
      this.loadOrders(true);
    }
  },

  onTab(e) {
    const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
    if (!tab || tab === this.data.activeTab) {
      return;
    }
    this.setData({ activeTab: tab });
    // 切换标签页时强制重新加载订单
    const app = getApp();
    if (app && typeof app.resetPagedList === 'function') {
      app.resetPagedList(this, 'orders');
    }
    this.loadOrders(true);
  },

  navTo(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
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
    this.setData({
      'batchProgress.selectedIds': ids.map(v => String(v || '').trim()).filter(Boolean),
    });
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
    if (this.data.batchProgress.submitting) {
      return;
    }
    const app = getApp();
    const ids = Array.isArray(this.data.batchProgress.selectedIds)
      ? this.data.batchProgress.selectedIds
      : [];
    const progressInput = Number(this.data.batchProgress.progress);
    const remark = normalizeText(this.data.batchProgress.remark);

    // 统一验证
    const valid = validateFields([
      { value: ids.length, message: '请选择订单' },
      { value: progressInput, message: '请输入进度', validator: validators.nonNegative },
    ]);
    if (!valid) {
      return;
    }

    const targetProgress = clampPercent(progressInput);
    const list = Array.isArray(this.data.orders.list) ? this.data.orders.list : [];
    const selectedOrders = list.filter(o => ids.includes(normalizeText(o && o.id)));
    const needRemark = selectedOrders.some(
      o => (Number(o && o.productionProgress) || 0) > targetProgress
    );

    if (needRemark && !remark) {
      toast.error('请填写问题点');
      return;
    }

    this.setData({ 'batchProgress.submitting': true });
    try {
      const settled = await Promise.allSettled(
        selectedOrders.map(o =>
          api.production.updateProgress({
            id: normalizeText(o && o.id),
            progress: targetProgress,
            rollbackRemark: needRemark ? remark : undefined,
          })
        )
      );
      const success = settled.filter(s => s.status === 'fulfilled').length;
      const failed = settled.length - success;
      toast[failed ? 'error' : 'success'](`成功${success}，失败${failed}`);

      this.setData({
        batchProgress: {
          ...this.data.batchProgress,
          submitting: false,
          selectedIds: [],
          progress: '',
          remark: '',
        },
      });

      if (app && typeof app.resetPagedList === 'function') {
        app.resetPagedList(this, 'orders');
      }
      await this.loadOrders(true);
    } catch (e) {
      if (e && e.type === 'auth') {
        return;
      }
      if (app && typeof app.toastError === 'function') {
        app.toastError(e, '更新失败');
      } else {
        toast.error('更新失败');
      }
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
        if (app && typeof app.resetPagedList === 'function') {
          app.resetPagedList(this, 'orders');
        }
        this.loadOrders(true);
      }
    );
  },

  async openStepRollback(e) {
    const orderId = normalizeText(
      e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
    );
    if (!orderId) {
      return;
    }
    const order = (this.data.orders.list || []).find(r => normalizeText(r && r.id) === orderId);
    if (!order) {
      toast.error('未找到订单');
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
      toast.info('当前已是第一步');
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
    if (this.data.rollbackStep.submitting) {
      return;
    }
    const app = getApp();
    const orderId = normalizeText(this.data.rollbackStep.orderId);
    const remark = normalizeText(this.data.rollbackStep.remark);
    const nextProgress = clampPercent(Number(this.data.rollbackStep.nextProgress) || 0);
    const nextProcessName = normalizeText(this.data.rollbackStep.nextProcessName) || '上一步';

    if (!orderId) {
      return;
    }
    if (!remark) {
      toast.error('请填写问题点');
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
      toast.success('回流成功');
      this.closeStepRollback();
      if (app && typeof app.resetPagedList === 'function') {
        app.resetPagedList(this, 'orders');
      }
      await this.loadOrders(true);
    } catch (e3) {
      if (e3 && e3.type === 'auth') {
        return;
      }
      if (app && typeof app.toastError === 'function') {
        app.toastError(e3, '回流失败');
      } else {
        toast.error('回流失败');
      }
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
      success: res => {
        const qr = res && res.result !== null ? String(res.result).trim() : '';
        if (!qr) {
          return;
        }
        this.setData({ 'rollback.cuttingBundleQrCode': qr });
      },
    });
  },

  /**
   * 验证回退表单数据
   * @private
   * @param {string} cuttingBundleQrCode - 扎号二维码
   * @param {number} qty - 回退数量
   * @param {string} rollbackRemark - 回退原因
   * @returns {boolean} 是否验证通过
   */
  _validateRollbackForm(cuttingBundleQrCode, qty, rollbackRemark) {
    return validateFields([
      { value: cuttingBundleQrCode, message: '请扫码扎号二维码' },
      { value: qty, message: '请输入回退数量', validator: validators.positive },
      { value: rollbackRemark, message: '请填写问题点' },
    ]);
  },

  /**
   * 刷新相关列表
   * @private
   * @param {string} orderId - 订单ID
   * @param {string} bundleNo - 扎号
   */
  async _refreshAfterRollback(orderId, bundleNo) {
    // 如果在入库标签页，刷新入库列表
    if (this.data.activeTab === 'warehousing') {
      const app2 = getApp();
      if (app2 && typeof app2.resetPagedList === 'function') {
        app2.resetPagedList(this, 'warehousing');
      }
      await this.loadWarehousing(true);
    }

    // 刷新订单列表
    const app = getApp();
    if (app && typeof app.resetPagedList === 'function') {
      app.resetPagedList(this, 'orders');
    }
    await this.loadOrders(true);

    // 触发全局数据刷新事件
    triggerDataRefresh('orders', {
      action: 'rollback',
      orderId: orderId,
      bundleNo: bundleNo,
    });
  },

  async submitRollback() {
    if (this.data.rollback.submitting) {
      return;
    }
    const app = getApp();
    const orderId = normalizeText(this.data.rollback.orderId);
    const cuttingBundleQrCode = normalizeText(this.data.rollback.cuttingBundleQrCode);
    const qty = Number(this.data.rollback.rollbackQuantity) || 0;
    const rollbackRemark = normalizeText(this.data.rollback.rollbackRemark);

    // 验证表单
    if (!this._validateRollbackForm(cuttingBundleQrCode, qty, rollbackRemark)) {
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
      toast.success('回退成功');

      // 重置表单
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

      // 刷新相关列表
      await this._refreshAfterRollback(orderId, cuttingBundleQrCode);
    } catch (e) {
      if (e && e.type === 'auth') {
        return;
      }
      if (app && typeof app.toastError === 'function') {
        app.toastError(e, '回退失败');
      } else {
        toast.error('回退失败');
      }
    } finally {
      this.setData({ 'rollback.submitting': false });
    }
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
        if (app && typeof app.resetPagedList === 'function') {
          app.resetPagedList(this, 'exceptions');
        }
        if (this.data.activeTab === 'exceptions') {
          this.loadExceptions(true);
        }
      }
    );
  },

  refreshActive() {
    return this.loadOrders(true);
  },

  loadMoreActive() {
    return this.loadOrders(false);
  },

  loadOrders(reset) {
    const app = getApp();
    if (!app || typeof app.loadPagedList !== 'function') {
      return Promise.resolve();
    }

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

        // 根据标签页添加当前工序节点过滤
        const tab = this.data.activeTab;
        const processMap = {
          procurement: '采购',
          cutting: '裁剪',
          sewing: '车缝',
          warehousing: '入库',
        };
        if (tab !== 'all' && processMap[tab]) {
          params.currentProcessName = processMap[tab];
        }

        return api.production.listOrders(params);
      },
      r => transformOrderData(r)
    );
  },

  /**
   * 设置订单列表的实时同步
   */
  setupOrderSync() {
    // 只在订单标签页启用同步
    const syncFn = async () => {
      try {
        const f = this.data.filters;
        const params = {
          page: 1,
          pageSize: 20, // 只同步前 20 条
          orderNo: normalizeText(f.orderNo),
          styleNo: normalizeText(f.styleNo),
          factoryName: normalizeText(f.factoryName),
        };
        return await api.production.listOrders(params);
      } catch (error) {
        errorHandler.logError(error, '[Work] Sync orders');
        throw error;
      }
    };

    // 数据变化时的处理
    const onDataChange = newPage => {
      if (!newPage || !Array.isArray(newPage.records)) {
        return;
      }

      // 更新列表
      const newList = newPage.records.map(r => transformOrderData(r));

      // console.log(`[Sync] Orders updated: ${newList.length} items`);
      this.setData({ 'orders.list': newList });
    };

    // 启动同步 (30 秒轮询一次)
    syncManager.startSync('work_orders', syncFn, 30000, {
      onDataChange,
      onError: (error, errorCount) => {
        console.warn(`[Sync] Orders sync error (${errorCount}):`, error.message);
        if (errorCount > 3) {
          // 连续 3 次失败时停止同步
          syncManager.stopSync('work_orders');
          console.error('[Sync] Stopped orders sync due to repeated failures');
        }
      },
    });
  },

  loadReminders() {
    // 加载提醒列表（仅更新数据，不显示弹窗）
    // work页面暂不显示提醒按钮，只在home页面显示
    // 这里预留接口，未来可以在work页面也添加提醒按钮
  },

  /**
   * 生成菲号功能
   */
  onGenerateBundle(e) {
    const order = e.currentTarget.dataset.order;
    if (!order || !order.id) {
      toast.error('订单信息错误');
      return;
    }

    this.setData({
      bundleModal: {
        visible: true,
        loading: false,
        orderId: order.id,
        orderNo: order.orderNo || '',
        styleNo: order.styleNo || '',
        items: [{ color: '', size: '', quantity: '' }],
      },
    });
  },

  // 通用菲号字段输入处理
  onBundleFieldInput(e) {
    const { idx, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const items = [...this.data.bundleModal.items];
    items[idx][field] = value;
    this.setData({ 'bundleModal.items': items });
  },

  onAddBundleItem() {
    const items = [...this.data.bundleModal.items, { color: '', size: '', quantity: '' }];
    this.setData({ 'bundleModal.items': items });
  },

  onRemoveBundleItem(e) {
    const idx = e.currentTarget.dataset.idx;
    const items = this.data.bundleModal.items.filter((_, i) => i !== idx);
    this.setData({ 'bundleModal.items': items });
  },

  onCancelBundle() {
    this.setData({
      bundleModal: { ...INITIAL_BUNDLE_MODAL },
    });
  },

  async onConfirmBundle() {
    const modal = this.data.bundleModal;

    // 验证数据
    const validItems = modal.items
      .map(item => ({
        color: String(item.color || '').trim(),
        size: String(item.size || '').trim(),
        quantity: Number(item.quantity) || 0,
      }))
      .filter(item => item.quantity > 0);

    if (validItems.length === 0) {
      toast.error('请至少填写一行有效数据');
      return;
    }

    const invalid = validItems.find(item => !item.color || !item.size);
    if (invalid) {
      toast.error('颜色和尺码不能为空');
      return;
    }

    // 显示加载状态
    this.setData({ 'bundleModal.loading': true });

    try {
      // 调用后端API生成菲号
      const res = await api.production.generateCuttingBundles(modal.orderId, validItems);

      if (res.code === 200) {
        toast.success('菲号生成成功');
        this.onCancelBundle();
        // 刷新订单列表
        this.loadOrders();
      } else {
        toast.error(res.message || '生成失败', 2000);
      }
    } catch (error) {
      console.error('生成菲号失败', error);
      const errMsg = error && error.errMsg ? error.errMsg : '生成失败，请重试';
      toast.error(errMsg, 2000);
    } finally {
      this.setData({ 'bundleModal.loading': false });
    }
  },

  onHide() {
    // 页面隐藏时停止同步（节省资源）
    syncManager.stopSync('work_orders');
  },
});
