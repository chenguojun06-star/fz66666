const api = require('../../../../utils/api');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');

function normalizePositiveInt(value) {
  const parsed = Number.parseInt(String(value || '0').replace(/[^\d]/g, ''), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseOutboundQrCode(code) {
  const parts = String(code || '').trim().split('-').filter(Boolean);
  if (parts.length < 4) return null;
  return {
    sku: parts.slice(0, -1).join('-'),
    styleNo: parts[0] || '',
    color: parts.slice(1, -2).join('-') || '',
    size: parts[parts.length - 2] || '',
    serialNo: parts[parts.length - 1] || '',
  };
}

// 尺码标准顺序排序（小→大）
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '4XXXXXL', '5XL'];
function sortSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length <= 1) return sizes;
  return [...sizes].sort((a, b) => {
    const au = String(a).toUpperCase().replace(/\s/g, '');
    const bu = String(b).toUpperCase().replace(/\s/g, '');
    const ai = SIZE_ORDER.indexOf(au);
    const bi = SIZE_ORDER.indexOf(bu);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    // 纯数字规格（如 165/64A）按字符串自然排序
    return a.localeCompare(b, 'zh-CN', { numeric: true });
  });
}

Page({
  data: {
    keyword: '',
    departmentOptions: [{ label: '全部部门', value: '' }],
    factoryTypeOptions: [{ label: '全部标签', value: '' }, { label: '内部工厂', value: 'INTERNAL' }, { label: '外部工厂', value: 'EXTERNAL' }],
    selectedDepartmentIndex: 0,
    selectedFactoryTypeIndex: 0,
    parentOrgUnitId: '',
    factoryType: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    stats: {
      totalQty: 0,
      availableQty: 0,
      defectQty: 0
    },
    modal: {
      visible: false,
      order: null,
      quantity: '',
      remainingQty: 0,
      remark: '',
      submitting: false,
      skuList: [],           // SKU列表
      loadingSkus: false,    // 加载SKU中
      totalOutbound: 0,      // 总出库数量
      lastScannedSku: null,
      lastScannedQrCode: '',
      scannedSkuKey: ''
    }
  },

  onLoad() {
    this.loadOrganizationFilterOptions();
    this.loadData(true);
  },

  onShow() {
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

  loadOrganizationFilterOptions() {
    api.system.listOrganizationDepartments()
      .then((list) => {
        const records = Array.isArray(list) ? list : [];
        this.setData({
          departmentOptions: [{ label: '全部部门', value: '' }].concat(
            records
              .filter(item => item && item.id)
              .map(item => ({ label: item.nodeName || '未命名部门', value: item.id }))
          ),
        });
      })
      .catch(() => {});
  },

  onDepartmentFilterChange(e) {
    const index = Number(e && e.detail ? e.detail.value : 0) || 0;
    const option = this.data.departmentOptions[index] || { value: '' };
    this.setData({
      selectedDepartmentIndex: index,
      parentOrgUnitId: option.value || '',
    }, () => this.loadData(true));
  },

  onFactoryTypeFilterChange(e) {
    const index = Number(e && e.detail ? e.detail.value : 0) || 0;
    const option = this.data.factoryTypeOptions[index] || { value: '' };
    this.setData({
      selectedFactoryTypeIndex: index,
      factoryType: option.value || '',
    }, () => this.loadData(true));
  },

  async loadData(reset) {
    if (this.data.loading) return;
    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] });
    }
    if (!this.data.hasMore) return;

    this.setData({ loading: true });
    try {
      const { page, pageSize, keyword } = this.data;
      const params = { page, pageSize };
      const kw = String(keyword || '').trim();
      if (kw) {
        params.keyword = kw;
        params.styleNo = kw;
      }
      if (this.data.parentOrgUnitId) {
        params.parentOrgUnitId = this.data.parentOrgUnitId;
      }
      if (this.data.factoryType) {
        params.factoryType = this.data.factoryType;
      }

      const data = await api.warehouse.listFinishedInventory(params);
      const records = (data && data.records) || [];

      // 按styleNo聚合
      const styleMap = new Map();
      for (const item of records) {
        const key = item.styleNo;
        if (!styleMap.has(key)) {
          styleMap.set(key, {
            id: item.id,
            styleNo: item.styleNo,
            styleName: item.styleName,
            imageUrl: item.styleImage ? getAuthedImageUrl(item.styleImage) : '',
            factoryName: item.factoryName || '',
            factoryType: item.factoryType || '',
            orgPath: item.orgPath || item.parentOrgUnitName || '',
            colors: item.colors || [],
            sizes: sortSizes(item.sizes || []),
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

      const items = Array.from(styleMap.values());
      const newList = reset ? items : this.data.list.concat(items);

      // 计算统计
      let totalQty = 0;
      let availableQty = 0;
      let defectQty = 0;
      for (const it of newList) {
        totalQty += it.availableQty + it.lockedQty + it.defectQty;
        availableQty += it.availableQty;
        defectQty += it.defectQty;
      }

      this.setData({
        list: newList,
        hasMore: records.length === pageSize,
        page: page + 1,
        stats: { totalQty, availableQty, defectQty }
      });
    } catch (error) {
      console.error('加载成品库存失败', error);
      const errMsg = (error && error.errMsg) || '加载失败';
      wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
    } finally {
      this.setData({ loading: false, isRefreshing: false });
    }
  },

  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadData(true);
  },

  onLoadMore() {
    this.loadData(false);
  },

  // ==================== 成品出库功能 ====================
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
        totalOutbound: 0,
        lastScannedSku: null,
        lastScannedQrCode: '',
        scannedSkuKey: ''
      }
    });

    // 加载该款式的所有SKU
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
          outboundQty: 0,  // 初始出库数量为0
          orderId: item.orderId || ''  // 每个SKU对应的生产订单ID（UUID），用于出库验证
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
        totalOutbound: 0,
        lastScannedSku: null,
        lastScannedQrCode: '',
        scannedSkuKey: ''
      }
    });
  },

  recalcOutboundTotal(skuList) {
    return (skuList || []).reduce((sum, item) => sum + (item.outboundQty || 0), 0);
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
    const totalOutbound = this.recalcOutboundTotal(skuList);

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
    const totalOutbound = this.recalcOutboundTotal(skuList);

    this.setData({
      'modal.skuList': skuList,
      'modal.totalOutbound': totalOutbound
    });
  },

  onScanSkuQr() {
    if (this.data.modal.loadingSkus) {
      wx.showToast({ title: 'SKU加载中，请稍候', icon: 'none' });
      return;
    }

    wx.scanCode({
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        const code = (res && res.result ? String(res.result) : '').trim();
        if (!code) {
          wx.showToast({ title: '未识别到二维码内容', icon: 'none' });
          return;
        }
        this.applyScannedQr(code);
      },
      fail: () => {
        wx.showToast({ title: '扫码已取消', icon: 'none' });
      }
    });
  },

  applyScannedQr(code) {
    const parsed = parseOutboundQrCode(code);
    const order = this.data.modal.order;
    const skuList = [...(this.data.modal.skuList || [])];

    if (!parsed) {
      wx.showToast({ title: '二维码格式不对', icon: 'none' });
      return;
    }
    if (!order || parsed.styleNo !== order.styleNo) {
      wx.showToast({ title: '该二维码不属于当前款式', icon: 'none' });
      return;
    }

    const index = skuList.findIndex(item => item.sku === parsed.sku);
    if (index < 0) {
      wx.showToast({ title: '当前款式下未找到对应SKU库存', icon: 'none' });
      return;
    }

    const current = skuList[index];
    if (!current.availableQty || current.availableQty <= 0) {
      wx.showToast({ title: '该SKU当前无可用库存', icon: 'none' });
      return;
    }

    const nextQty = Math.min((current.outboundQty || 0) + 1, current.availableQty);
    skuList[index] = { ...current, outboundQty: nextQty };

    this.setData({
      'modal.skuList': skuList,
      'modal.totalOutbound': this.recalcOutboundTotal(skuList),
      'modal.lastScannedQrCode': code,
      'modal.lastScannedSku': {
        sku: current.sku,
        color: current.color,
        size: current.size,
        availableQty: current.availableQty,
        outboundQty: nextQty,
      },
      'modal.scannedSkuKey': current.sku,
    });

    wx.showToast({ title: `已定位 ${current.color}-${current.size}`, icon: 'success' });
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
      // 与PC端保持一致：统一走仓库成品库存批量出库接口
      await api.warehouse.outboundFinishedInventory({
        items: outboundSkus.map(sku => ({
          sku: sku.sku,
          quantity: sku.outboundQty,
        })),
        ...(order.orderId ? { orderId: order.orderId } : {}),
        ...(order.orderNo ? { orderNo: order.orderNo } : {}),
        ...(order.styleId ? { styleId: order.styleId } : {}),
        ...(order.styleNo ? { styleNo: order.styleNo } : {}),
        ...(order.styleName ? { styleName: order.styleName } : {}),
        ...(modal.remark ? { remark: modal.remark } : {}),
      });

      wx.showToast({
        title: `已出库 ${outboundSkus.length} 个SKU，共 ${modal.totalOutbound} 件`,
        icon: 'success',
        duration: 2000
      });

      this.closeOutstockModal();
      this.loadData(true);
    } catch (error) {
      console.error('出库失败', error);
      wx.showToast({ title: `出库失败: ${(error && error.message) || '请稍后重试'}`, icon: 'none' });
    } finally {
      this.setData({ 'modal.submitting': false });
    }
  },

  /** 图片加载失败（COS 404）→ 清空 URL，显示"暂无图片"占位 */
  onImageError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === undefined) return;
    this.setData({ [`list[${idx}].imageUrl`]: '' });
  },
});
