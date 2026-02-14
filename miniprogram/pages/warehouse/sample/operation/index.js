const api = require('../../../../utils/api');

Page({
  data: {
    type: 'inbound', // inbound, loan, return
    title: '样衣入库',
    formData: {
      styleNo: '',
      loanId: ''
    },
    sampleTypes: [
      { key: 'development', label: '开发样' },
      { key: 'pre_production', label: '产前样' },
      { key: 'shipment', label: '大货样' },
      { key: 'sales', label: '销售样' }
    ],
    typeIndex: 0,
    returnDate: '',
    submitting: false,

    // 借出模式专用：库存列表选择
    stockList: [],
    selectedStockId: '',
    stockLoading: false
  },

  onLoad(options) {
    const type = options.type || 'inbound';
    const styleNo = options.styleNo || '';
    const titles = {
      inbound: '样衣入库',
      loan: '样衣借出',
      return: '样衣归还'
    };
    this.setData({
      type,
      title: titles[type],
      'formData.styleNo': styleNo
    });

    if (type === 'loan' && styleNo) {
      this.fetchStockList(styleNo);
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });

    // 如果是借出模式，且输入了款号，尝试查询库存
    if (this.data.type === 'loan' && field === 'styleNo' && value.length > 3) {
      this.fetchStockList(value);
    }
  },

  handleScanStyle() {
    wx.scanCode({
      success: (res) => {
        const styleNo = res.result;
        this.setData({
          'formData.styleNo': styleNo
        });
        if (this.data.type === 'loan') {
          this.fetchStockList(styleNo);
        }
      }
    });
  },

  handleScanLoan() {
    wx.scanCode({
      success: (res) => {
        this.setData({
          'formData.loanId': res.result
        });
      }
    });
  },

  // 查询库存列表（用于借出选择）
  fetchStockList(styleNo) {
    this.setData({ stockLoading: true, stockList: [], selectedStockId: '' });
    api.stock.listSamples({ page: 1, pageSize: 50, styleNo })
      .then(data => {
        const list = (data && data.records) || [];
        // 过滤出有库存的
        const availableList = list.filter(item => (item.quantity - item.loanedQuantity) > 0);
        this.setData({ stockList: availableList });
        if (availableList.length === 0) {
          wx.showToast({ title: '该款号暂无可用库存', icon: 'none' });
        }
      })
      .catch(console.error)
      .finally(() => this.setData({ stockLoading: false }));
  },

  onSelectStock(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedStockId: id });
  },

  onTypeChange(e) {
    this.setData({ typeIndex: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ returnDate: e.detail.value });
  },

  onSubmit(e) {
    const values = e.detail.value;
    const { type, sampleTypes, typeIndex, returnDate, selectedStockId } = this.data;

    // 简单校验
    if (type !== 'return' && !values.styleNo) {
      return wx.showToast({ title: '请输入款号', icon: 'none' });
    }

    this.setData({ submitting: true });

    const payload = { ...values };

    let requestPromise;

    if (type === 'inbound') {
      payload.sampleType = sampleTypes[typeIndex].key;
      requestPromise = api.stock.inboundSample(payload);
    } else if (type === 'loan') {
      if (!selectedStockId) {
        wx.showToast({ title: '请选择要借出的样衣规格', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      payload.sampleStockId = selectedStockId;
      if (returnDate) {
        payload.expectedReturnDate = returnDate + ' 18:00:00';
      }
      requestPromise = api.stock.loanSample(payload);
    } else if (type === 'return') {
      payload.returnQuantity = payload.quantity;
      delete payload.quantity;
      requestPromise = api.stock.returnSample(payload);
    }

    requestPromise
      .then(() => {
        wx.showToast({ title: '操作成功' });
        setTimeout(() => wx.navigateBack(), 1500);
      })
      .catch(err => {
        console.error(err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  }
});
