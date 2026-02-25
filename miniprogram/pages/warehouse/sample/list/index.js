const api = require('../../../../utils/api');

Page({
  data: {
    keyword: '',
    list: [],  // 移除 allList，不再需要客户端缓存所有数据
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    filterType: 'all',  // 'all' | 'pending' | 具体样衣类型（如需支持）
    totalQuantity: 0,
    pendingReturnQuantity: 0,

    // 操作弹窗状态
    operationModal: {
      visible: false,
      type: 'inbound', // 'inbound' | 'loan' | 'return'
      title: '样衣入库',
      formData: {
        styleNo: '',
        styleName: '',
        color: '',
        size: '',
        location: '',
        quantity: 1,
        borrower: '',
        loanId: '',
        remark: '',
      },
      sampleTypes: [
        { key: 'development', label: '开发样' },
        { key: 'pre_production', label: '产前样' },
        { key: 'shipment', label: '大货样' },
        { key: 'sales', label: '销售样' },
      ],
      typeIndex: 0,
      returnDate: '',
      submitting: false,
      stockList: [],
      selectedStockId: '',
      stockLoading: false,
    },

    // 借出记录弹窗
    loanModal: {
      visible: false,
      sampleStockId: '',
      styleNo: '',
      list: [],
      loading: false,
    },
  },

  onLoad() {
    this.loadData(true);
  },

  /**
   * ✅ 新增：页面显示时自动刷新数据
   * 解决问题：入库/借出/归还操作后返回列表，数据自动更新
   */
  onShow() {
    // 如果不是首次加载（page > 1表示已加载过数据），则刷新列表
    if (this.data.page > 1 || this.data.list.length > 0) {
      this.loadData(true);
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  handleScan() {
    wx.scanCode({
      success: (res) => {
        // 假设扫码结果是款号
        const result = res.result;
        if (result) {
          this.setData({ keyword: result }, () => {
            this.loadData(true);
          });
        }
      },
      fail: (err) => {
        console.error('扫码失败', err);
        wx.showToast({
          title: '扫码失败',
          icon: 'none'
        });
      }
    });
  },

  async loadData(reset = false) {
    if (this.data.loading) return;

    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] });
    }

    if (!this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const { page, pageSize, keyword, filterType } = this.data;

      // ✅ 统一使用服务端过滤，与PC端一致
      const params = {
        page,
        pageSize,
        ...(keyword && { styleNo: keyword }),  // ✅ 过滤空值
        ...(filterType !== 'all' && { sampleType: filterType })  // ✅ filterType='all'时不传sampleType
      };

      const data = await api.stock.listSamples(params);

      const records = (data && data.records) || [];

      // ✅ 直接使用服务端返回的数据，不再客户端过滤
      const list = reset ? records : [...this.data.list, ...records];

      // 计算汇总数据（从服务端返回的完整数据计算）
      const totalQuantity = list.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const pendingReturnQuantity = list.reduce((sum, item) => sum + (Number(item.loanedQuantity) || 0), 0);

      this.setData({
        list: list,
        totalQuantity,
        pendingReturnQuantity,
        hasMore: records.length === pageSize,
        page: page + 1
      });
    } catch (error) {
      console.error('加载样衣列表失败', error);
      const errMsg = (error && error.errMsg) || (error && error.message) || '加载失败';
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
    this.loadData();
  },

  onFilterTap(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || type === this.data.filterType) {
      return;
    }
    // ✅ 切换筛选时重新从服务端加载数据
    this.setData({
      filterType: type,
    }, () => {
      this.loadData(true);  // 重置并重新加载
    });
  },

  // ==================== 操作弹窗功能 ====================
  openOperationModal(e) {
    const type = e.currentTarget.dataset.type;
    const styleNo = e.currentTarget.dataset.styleno || '';

    const titles = {
      inbound: '样衣入库',
      loan: '样衣借出',
      return: '样衣归还',
    };

    this.setData({
      'operationModal.visible': true,
      'operationModal.type': type,
      'operationModal.title': titles[type],
      'operationModal.formData.styleNo': styleNo,
      'operationModal.formData.styleName': '',
      'operationModal.formData.color': '',
      'operationModal.formData.size': '',
      'operationModal.formData.location': '',
      'operationModal.formData.quantity': 1,
      'operationModal.formData.borrower': '',
      'operationModal.formData.loanId': '',
      'operationModal.formData.remark': '',
      'operationModal.typeIndex': 0,
      'operationModal.returnDate': '',
      'operationModal.stockList': [],
      'operationModal.selectedStockId': '',
    });

    // 如果是借出模式且有款号，自动加载库存
    if (type === 'loan' && styleNo) {
      this.fetchStockList(styleNo);
    }
  },

  closeOperationModal() {
    this.setData({
      'operationModal.visible': false,
      'operationModal.submitting': false,
    });
  },

  onOperationInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`operationModal.formData.${field}`]: value,
    });

    // 如果是借出模式，且输入了款号，查询库存
    if (this.data.operationModal.type === 'loan' && field === 'styleNo' && value.length > 3) {
      this.fetchStockList(value);
    }
  },

  onTypeSelect(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ 'operationModal.typeIndex': Number(index) });
  },

  onDateChange(e) {
    this.setData({ 'operationModal.returnDate': e.detail.value });
  },

  fetchStockList(styleNo) {
    this.setData({
      'operationModal.stockLoading': true,
      'operationModal.stockList': [],
      'operationModal.selectedStockId': '',
    });

    api.stock.listSamples({ page: 1, pageSize: 50, styleNo })
      .then(data => {
        const list = (data && data.records) || [];
        const availableList = list.filter(item => (item.quantity - item.loanedQuantity) > 0);
        this.setData({ 'operationModal.stockList': availableList });
        if (availableList.length === 0) {
          wx.showToast({ title: '该款号暂无可用库存', icon: 'none' });
        }
      })
      .catch(console.error)
      .finally(() => this.setData({ 'operationModal.stockLoading': false }));
  },

  onSelectStock(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ 'operationModal.selectedStockId': id });
  },

  handleScanStyle() {
    wx.scanCode({
      success: (res) => {
        const styleNo = res.result;
        this.setData({ 'operationModal.formData.styleNo': styleNo });
        if (this.data.operationModal.type === 'loan') {
          this.fetchStockList(styleNo);
        }
      },
    });
  },

  handleScanLoan() {
    wx.scanCode({
      success: (res) => {
        this.setData({ 'operationModal.formData.loanId': res.result });
      },
    });
  },

  async onSubmitOperation() {
    const { operationModal } = this.data;
    const { type, formData, sampleTypes, typeIndex, returnDate, selectedStockId } = operationModal;

    // 校验
    if (type !== 'return' && !formData.styleNo) {
      return wx.showToast({ title: '请输入款号', icon: 'none' });
    }

    this.setData({ 'operationModal.submitting': true });

    try {
      const payload = { ...formData };

      if (type === 'inbound') {
        payload.sampleType = sampleTypes[typeIndex].key;
        await api.stock.inboundSample(payload);
      } else if (type === 'loan') {
        if (!selectedStockId) {
          wx.showToast({ title: '请选择要借出的样衣规格', icon: 'none' });
          this.setData({ 'operationModal.submitting': false });
          return;
        }
        payload.sampleStockId = selectedStockId;
        if (returnDate) {
          payload.expectedReturnDate = returnDate + ' 18:00:00';
        }
        await api.stock.loanSample(payload);
      } else if (type === 'return') {
        payload.returnQuantity = payload.quantity;
        delete payload.quantity;
        await api.stock.returnSample(payload);
      }

      wx.showToast({ title: '操作成功', icon: 'success' });
      this.closeOperationModal();
      this.loadData(true); // 刷新列表
    } catch (error) {
      console.error('操作失败', error);
      wx.showToast({ title: `操作失败: ${(error && error.message) || '请稍后重试'}`, icon: 'none' });
    } finally {
      this.setData({ 'operationModal.submitting': false });
    }
  },

  // ==================== 借出记录功能 ====================
  openLoanModal(e) {
    const id = e.currentTarget.dataset.id;
    const styleNo = e.currentTarget.dataset.styleno || '';

    if (!id) {
      wx.showToast({ title: '样衣信息缺失', icon: 'none' });
      return;
    }

    this.setData({
      'loanModal.visible': true,
      'loanModal.sampleStockId': id,
      'loanModal.styleNo': styleNo,
      'loanModal.list': [],
      'loanModal.loading': true,
    });

    this.loadLoanRecords(id);
  },

  closeLoanModal() {
    this.setData({ 'loanModal.visible': false });
  },

  async loadLoanRecords(sampleStockId) {
    try {
      const list = await api.stock.listSampleLoans(sampleStockId);
      const mapped = Array.isArray(list)
        ? list.map(item => ({
            ...item,
            statusText: this.mapLoanStatus(item.status),
          }))
        : [];
      this.setData({
        'loanModal.list': mapped,
        'loanModal.loading': false,
      });
    } catch (error) {
      console.error('加载借调记录失败', error);
      wx.showToast({ title: `加载失败: ${(error && error.message) || '请稍后重试'}`, icon: 'none' });
      this.setData({ 'loanModal.loading': false });
    }
  },

  mapLoanStatus(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'returned') return '已归还';
    if (s === 'lost') return '丢失';
    return '借出中';
  },

  /** 图片加载失败（COS 404）→ 清空 URL，显示"暂无图片"占位 */
  onImageError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === undefined) return;
    this.setData({ [`list[${idx}].imageUrl`]: '' });
  },
});
