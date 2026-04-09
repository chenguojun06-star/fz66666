/**
 * 扫码确认页面 — 从弹窗迁移为独立页面
 * 对应原 ConfirmModalHandler 非样板分支
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('../handlers/helpers/ScanModeResolver');
const SKUProcessor = require('../processors/SKUProcessor');

Page({
  data: {
    isProcurement: false,
    detail: {},
    skuList: [],
    materialPurchases: [],
    materialSummary: { totalDemand: 0, totalArrived: 0, totalPending: 0 },
    summary: { totalQuantity: 0, totalAmount: 0 },
    sizeMatrix: { sizes: [], rows: [] },
    aiTipData: null,
    buttonText: '确认扫码',
    loading: false
  },

  onLoad() {
    var app = getApp();
    var raw = app.globalData.confirmScanData;
    if (!raw) {
      toast.error('数据异常');
      wx.navigateBack();
      return;
    }
    this._scanContext = raw;

    var orderDetail = raw.orderDetail || {};
    var isProcurement = raw.progressStage === '采购';

    // 动态设置页面标题
    if (isProcurement) {
      wx.setNavigationBarTitle({ title: '面辅料采购确认' });
    }

    var skuItems = raw.skuItems || orderDetail.orderItems || [];

    // Build SKU list via processor
    var normalized = SKUProcessor.normalizeOrderItems(skuItems, raw.orderNo, raw.styleNo || orderDetail.styleNo);
    var formItems = SKUProcessor.buildSKUInputList(normalized);
    var summary = SKUProcessor.getSummary(formItems);
    var sizeMatrix = this._buildSizeMatrix(normalized);

    var coverImage = orderDetail.coverImage || orderDetail.styleImage || '';

    // 采购模式：提取面辅料采购数据
    var materialPurchases = [];
    var materialSummary = { totalDemand: 0, totalArrived: 0, totalPending: 0 };
    if (isProcurement && Array.isArray(raw.materialPurchases)) {
      var MATERIAL_TYPE_MAP = {
        fabricA: '主面料', fabricB: '辅面料',
        liningA: '里料', liningB: '夹里', liningC: '衬布/粘合衬',
        accessoryA: '拉链', accessoryB: '纽扣', accessoryC: '配件'
      };
      materialPurchases = raw.materialPurchases.map(function(item) {
        return Object.assign({}, item, {
          materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || ''
        });
      });
      materialPurchases.forEach(function(item) {
        materialSummary.totalDemand += Number(item.purchaseQuantity) || 0;
        materialSummary.totalArrived += Number(item.arrivedQuantity) || 0;
        materialSummary.totalPending += Number(item.pendingQuantity) || 0;
      });
    }

    this.setData({
      isProcurement: isProcurement,
      detail: {
        coverImage: coverImage,
        styleNo: orderDetail.styleNo || raw.styleNo || '',
        orderNo: raw.orderNo || '',
        bundleNo: raw.bundleNo || '',
        processName: raw.processName || '',
        progressStage: raw.progressStage || '',
        bomFallback: raw.bomFallback || false
      },
      materialPurchases: materialPurchases,
      materialSummary: materialSummary,
      buttonText: isProcurement ? '领取采购' : '确认扫码',
      skuList: formItems,
      summary: summary,
      sizeMatrix: sizeMatrix
    });

    // AI tip（非采购模式）
    if (!isProcurement && raw.orderNo && raw.processName) {
      this._fetchAiTip(raw.orderNo, raw.processName);
    }
  },

  onUnload() {
    getApp().globalData.confirmScanData = null;
  },

  /* ---- helpers ---- */

  _buildSizeMatrix(skuList) {
    if (!Array.isArray(skuList) || skuList.length === 0) {
      return { sizes: [], rows: [] };
    }
    var sizeSet = [];
    var colorMap = {};
    skuList.forEach(function (item) {
      var color = (item.color || '').trim() || '默认';
      var size = (item.size || '').trim() || '均码';
      var qty = Number(item.totalQuantity || item.quantity || 0);
      if (sizeSet.indexOf(size) === -1) sizeSet.push(size);
      if (!colorMap[color]) colorMap[color] = {};
      colorMap[color][size] = qty;
    });
    var rows = Object.keys(colorMap).map(function (color) {
      return {
        color: color,
        cells: sizeSet.map(function (size) {
          return { size: size, quantity: colorMap[color][size] || 0 };
        })
      };
    });
    return { sizes: sizeSet, rows: rows };
  },

  _fetchAiTip(orderNo, processName) {
    var self = this;
    api.intelligence.getScanTips({ orderNo: orderNo, processName: processName })
      .then(function (res) {
        if (res && res.aiTip) {
          self.setData({ aiTipData: res });
        }
      })
      .catch(function () { /* no-op */ });
  },

  /* ---- events ---- */

  previewImage() {
    var img = this.data.detail.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onSkuInput(e) {
    var idx = e.currentTarget.dataset.index;
    var val = parseInt(e.detail.value, 10) || 0;
    var key = 'skuList[' + idx + '].inputQuantity';
    this.setData({ [key]: val });
    var summary = SKUProcessor.getSummary(this.data.skuList);
    this.setData({ summary: summary });
  },

  goBack() {
    wx.navigateBack();
  },

  async confirmScan() {
    if (this.data.loading) return;
    var raw = this._scanContext;
    if (!raw) { toast.error('数据异常'); return; }

    var skuList = this.data.skuList;
    var validation = SKUProcessor.validateSKUInputBatch(skuList);
    if (!validation.valid) {
      toast.error((validation.errors && validation.errors[0]) || '请检查输入');
      return;
    }

    this.setData({ loading: true });

    try {
      var requests = SKUProcessor.generateScanRequests(
        validation.validList,
        raw.orderNo,
        raw.styleNo || (raw.orderDetail && raw.orderDetail.styleNo) || '',
        raw.progressStage,
        { scanCode: raw.scanCode || raw.orderNo || '' }
      );

      if (requests.length === 0) {
        throw new Error('请至少输入一个数量');
      }

      var tasks = requests.map(function (req) {
        req.scanType = normalizeScanType(raw.progressStage, req.scanType || 'production');
        return api.production.executeScan(req);
      });

      var results = await Promise.all(tasks);
      var invalid = (results || []).find(function (r) {
        return !(r && r.scanRecord && (r.scanRecord.id || r.scanRecord.recordId));
      });
      if (invalid) {
        var msg = (invalid && invalid.message) ? String(invalid.message) : '部分扫码未落库，请重试';
        throw new Error(msg);
      }

      toast.success('批量提交成功（' + tasks.length + '条）');
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      wx.showModal({
        title: '扫码失败',
        content: e.message || e.errMsg || '提交失败，请稍后重试',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  _emitRefresh() {
    var eb = getApp().globalData && getApp().globalData.eventBus;
    if (eb && typeof eb.emit === 'function') {
      eb.emit('DATA_REFRESH');
    }
  }
});
