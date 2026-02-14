const api = require('../../../../utils/api');
const { getBaseUrl } = require('../../../../config');

function normalizePositiveInt(value) {
  const parsed = Number.parseInt(String(value || '0').replace(/[^\d]/g, ''), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

Page({
  data: {
    keyword: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    modal: {
      visible: false,
      order: null,
      quantity: '',
      remainingQty: 0,
      remark: '',
      submitting: false,
      skuList: [],           // SKU列表
      loadingSkus: false,    // 加载SKU中
      totalOutbound: 0       // 总出库数量
    }
  },

  onLoad(options) {
    // 支持从成品库存页面传入搜索关键词
    if (options && options.keyword) {
      this.setData({ keyword: decodeURIComponent(options.keyword) });
    }
    this.loadData(true);
  },

  onShow() {
    // 出库操作后返回自动刷新
    if (this.data.list.length > 0) {
      this.loadData(true);
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  /**
   * ✅ 使用成品库存API（与PC端一致），替代原来的生产订单API
   * 根因：原来调用 api.production.listOrders 查的是生产订单，
   * 但PC端"成品进销存"用的是 /api/warehouse/finished-inventory/list
   */
  async loadData(reset = false) {
    if (this.data.loading) {
      return;
    }

    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] });
    }

    if (!this.data.hasMore) {
      return;
    }

    this.setData({ loading: true });

    try {
      const { page, pageSize, keyword } = this.data;
      const params = { page, pageSize };
      const kw = String(keyword || '').trim();
      if (kw) {
        params.keyword = kw;
        params.styleNo = kw;
      }

      // ✅ 使用成品库存API（与PC端一致）
      const data = await api.warehouse.listFinishedInventory(params);
      const records = (data && data.records) || [];
      const baseUrl = getBaseUrl();

      // 按styleNo聚合，显示有库存的款式
      const styleMap = new Map();
      for (const item of records) {
        const key = item.styleNo;
        if (!styleMap.has(key)) {
          styleMap.set(key, {
            id: item.id,
            styleNo: item.styleNo,
            styleName: item.styleName,
            styleImage: item.styleImage,
            imageUrl: item.styleImage ? `${baseUrl}${item.styleImage}` : '',
            colors: item.colors || [],
            sizes: item.sizes || [],
            availableQty: 0,
            lockedQty: 0,
            defectQty: 0
          });
        }
        const agg = styleMap.get(key);
        agg.availableQty += Number(item.availableQty) || 0;
        agg.lockedQty += Number(item.lockedQty) || 0;
        agg.defectQty += Number(item.defectQty) || 0;
      }

      const visibleList = Array.from(styleMap.values()).filter(item => item.availableQty > 0);

      this.setData({
        list: reset ? visibleList : [...this.data.list, ...visibleList],
        hasMore: records.length === pageSize,
        page: page + 1
      });
    } catch (error) {
      console.error('加载成品库存失败', error);
      wx.showToast({ title: error.errMsg || '加载失败', icon: 'none', duration: 3000 });
    } finally {
      this.setData({ loading: false, isRefreshing: false });
    }
  },

  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadData(true);
  },

  onLoadMore() {
    this.loadData();
  },

  async openOutstockModal(e) {
    const index = Number(e.currentTarget.dataset.index);
    const order = this.data.list[index];
    if (!order) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' });
      return;
    }

    // 初始化Modal
    this.setData({
      modal: {
        visible: true,
        order,
        quantity: '',
        remainingQty: Number(order.availableQty || 0),
        remark: '',
        submitting: false,
        skuList: [],
        loadingSkus: true,
        totalOutbound: 0
      }
    });

    // ✅ 加载该款式的所有SKU（使用正确的API方法）
    try {
      const skuData = await api.warehouse.listFinishedInventory({
        styleNo: order.styleNo,
        page: 1,
        pageSize: 100
      });

      const records = (skuData && skuData.records) || [];
      const skuList = records
        .filter(item => item.availableQty > 0)  // 只显示有库存的SKU
        .map(item => ({
          sku: item.sku || `${item.styleNo}-${item.color}-${item.size}`,
          color: item.color || '-',
          size: item.size || '-',
          availableQty: Number(item.availableQty) || 0,
          outboundQty: 0  // 初始出库数量为0
        }));

      this.setData({
        'modal.skuList': skuList,
        'modal.loadingSkus': false
      });
    } catch (error) {
      console.error('加载SKU列表失败', error);
      this.setData({
        'modal.skuList': [],
        'modal.loadingSkus': false
      });
      wx.showToast({ title: '加载SKU信息失败', icon: 'none' });
    }
  },

  closeOutstockModal() {
    this.setData({
      modal: {
        visible: false,
        order: null,
        quantity: '',
        remainingQty: 0,
        remark: '',
        submitting: false,
        skuList: [],
        loadingSkus: false,
        totalOutbound: 0
      }
    });
  },

  // 更新SKU出库数量
  onSkuQtyInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const value = normalizePositiveInt(e.detail.value);
    const skuList = [...this.data.modal.skuList];
    const sku = skuList[index];

    if (!sku) return;

    // 限制不能超过可用库存
    const finalValue = Math.min(value, sku.availableQty);
    skuList[index] = { ...sku, outboundQty: finalValue };

    // 计算总出库数量
    const totalOutbound = skuList.reduce((sum, item) => sum + (item.outboundQty || 0), 0);

    this.setData({
      'modal.skuList': skuList,
      'modal.totalOutbound': totalOutbound
    });
  },

  // 快速填充最大值
  onFillMaxQty(e) {
    const index = Number(e.currentTarget.dataset.index);
    const skuList = [...this.data.modal.skuList];
    const sku = skuList[index];

    if (!sku) return;

    skuList[index] = { ...sku, outboundQty: sku.availableQty };

    // 计算总出库数量
    const totalOutbound = skuList.reduce((sum, item) => sum + (item.outboundQty || 0), 0);

    this.setData({
      'modal.skuList': skuList,
      'modal.totalOutbound': totalOutbound
    });
  },

  setModalQuantity(rawQuantity) {
    const order = this.data.modal.order;
    const available = computeAvailable(order);
    const quantity = Math.min(Math.max(normalizePositiveInt(rawQuantity), 0), available);
    this.setData({
      'modal.quantity': quantity > 0 ? String(quantity) : '',
      'modal.remainingQty': Math.max(available - quantity, 0)
    });
  },

  onModalQuantityInput(e) {
    this.setModalQuantity(e.detail.value);
  },

  onStepQuantity(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const current = normalizePositiveInt(this.data.modal.quantity);
    this.setModalQuantity(current + delta);
  },

  onPickMaxQuantity() {
    const order = this.data.modal.order;
    this.setModalQuantity(computeAvailable(order));
  },

  onModalRemarkInput(e) {
    this.setData({ 'modal.remark': e.detail.value });
  },

  async onConfirmOutstock() {
    const { modal } = this.data;
    const order = modal.order;
    const skuList = modal.skuList || [];

    if (!order) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' });
      return;
    }

    // 获取所有有出库数量的SKU
    const outboundSkus = skuList.filter(sku => sku.outboundQty > 0);

    if (outboundSkus.length === 0) {
      wx.showToast({ title: '请至少为一个SKU输入出库数量', icon: 'none' });
      return;
    }

    this.setData({ 'modal.submitting': true });

    try {
      // 批量创建出库单（为每个SKU创建一条出库记录）
      const promises = outboundSkus.map(sku =>
        api.production.createOutstock({
          orderId: order.id,
          orderNo: order.orderNo,
          styleNo: order.styleNo,
          styleName: order.styleName,
          color: sku.color,
          size: sku.size,
          outstockQuantity: sku.outboundQty,
          remark: `${modal.remark || ''} [SKU: ${sku.sku}]`.trim()
        })
      );

      await Promise.all(promises);

      wx.showToast({
        title: `已出库 ${outboundSkus.length} 个SKU，共 ${modal.totalOutbound} 件`,
        icon: 'success',
        duration: 2000
      });

      this.closeOutstockModal();
      this.loadData(true);
    } catch (error) {
      console.error('出库失败', error);
      wx.showToast({ title: '出库失败', icon: 'none' });
    } finally {
      this.setData({ 'modal.submitting': false });
    }
  }
});
