const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('../handlers/helpers/ScanModeResolver');
const SKUProcessor = require('../processors/SKUProcessor');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const { sortBySizeOrder } = require('../../../utils/orderParser');

Page({
  data: {
    isProcurement: false,
    isCutting: false,
    detail: {},
    skuList: [],
    materialPurchases: [],
    materialSummary: { totalDemand: 0, totalArrived: 0, totalPending: 0 },
    summary: { totalQuantity: 0, totalAmount: 0 },
    sizeMatrix: { sizes: [], rows: [] },
    cuttingTask: null,
    cuttingUnitPrice: 0,
    aiTipData: null,
    aiTipVisible: false,
    description: '',
    secondaryProcesses: [],
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
    var isCutting = raw.progressStage === '裁剪';

    if (isProcurement) {
      wx.setNavigationBarTitle({ title: '面辅料采购确认' });
    } else if (isCutting) {
      wx.setNavigationBarTitle({ title: '裁剪任务领取' });
    }

    var skuItems = raw.skuItems || orderDetail.orderItems || [];

    var normalized = SKUProcessor.normalizeOrderItems(skuItems, raw.orderNo, raw.styleNo || orderDetail.styleNo);
    var formItems = SKUProcessor.buildSKUInputList(normalized);
    var summary = SKUProcessor.getSummary(formItems);
    var sizeMatrix = this._buildSizeMatrix(normalized);

    var coverImage = getAuthedImageUrl(orderDetail.coverImage || orderDetail.styleImage || '');

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

    var cuttingTask = null;
    if (isCutting && raw.cuttingTask) {
      cuttingTask = raw.cuttingTask;
      var statusMap = {
        pending: '待领取', not_started: '待领取',
        received: '已领取', in_progress: '已领取',
        bundled: '已完成', completed: '已完成', done: '已完成'
      };
      cuttingTask.statusText = statusMap[cuttingTask.status] || cuttingTask.status || '待领取';
    }

    var btnText = '确认扫码';
    if (isProcurement) btnText = '一键领取';
    else if (isCutting) {
      if (cuttingTask && ['completed', 'done'].includes(cuttingTask.status)) {
        btnText = '裁剪已完成';
      } else {
        btnText = cuttingTask ? '领取任务' : '返回';
      }
    }

    var PROCESS_TYPE_MAP = {
      embroidery: '绣花', printing: '印花', washing: '洗水',
      dyeing: '染色', ironing: '整烫', pleating: '压褶',
      beading: '钉珠', other: '其他'
    };
    var STATUS_MAP = {
      pending: '待处理', processing: '进行中',
      completed: '已完成', cancelled: '已取消'
    };
    var rawProcesses = orderDetail.secondaryProcesses || raw.secondaryProcesses || [];
    var secondaryProcesses = rawProcesses.map(function(item) {
      return Object.assign({}, item, {
        processTypeCN: PROCESS_TYPE_MAP[item.processType] || item.processType || '',
        statusCN: STATUS_MAP[item.status] || item.status || ''
      });
    });

    var description = orderDetail.description || raw.description || '';

    // 提取裁剪工序单价（来自 handleCuttingMode 注入的 stageResult）
    var cuttingUnitPrice = 0;
    if (isCutting) {
      var stageResult = raw.stageResult || {};
      var allBundleProcesses = stageResult.allBundleProcesses || [];
      var cuttingProc = allBundleProcesses.find(function(p) {
        return (p.scanType === 'cutting') || (String(p.progressStage || '').includes('裁剪'));
      }) || allBundleProcesses[0];
      cuttingUnitPrice = cuttingProc ? Number(cuttingProc.unitPrice || 0) : 0;
    }

    this.setData({
      isProcurement: isProcurement,
      isCutting: isCutting,
      detail: {
        coverImage: coverImage,
        styleNo: orderDetail.styleNo || raw.styleNo || '',
        orderNo: raw.orderNo || '',
        bundleNo: raw.bundleNo || '',
        processName: raw.processName || '',
        progressStage: raw.progressStage || '',
        bomFallback: raw.bomFallback || false,
        quantity: raw.quantity || 0
      },
      materialPurchases: materialPurchases,
      materialSummary: materialSummary,
      cuttingTask: cuttingTask,
      cuttingUnitPrice: cuttingUnitPrice,
      description: description,
      secondaryProcesses: secondaryProcesses,
      buttonText: btnText,
      skuList: formItems,
      summary: summary,
      sizeMatrix: sizeMatrix
    });

    // 防御性检查：裁剪已完成 → 自动提示并返回
    if (isCutting && cuttingTask && ['completed', 'done'].includes(cuttingTask.status)) {
      wx.showToast({ title: '裁剪任务已完成', icon: 'success' });
      setTimeout(function() { wx.navigateBack(); }, 1500);
      return;
    }

    // 所有阶段均可获取AI提示（采购/裁剪/车缝/质检/入库）
    if (raw.orderNo) {
      this._fetchAiTip(raw.orderNo, raw.processName || raw.progressStage || '');
    }
  },

  onUnload() {
    getApp().globalData.confirmScanData = null;
  },

  _buildSizeMatrix(skuList) {
    if (!Array.isArray(skuList) || skuList.length === 0) {
      return { sizes: [], rows: [] };
    }
    var sizeSet = [];
    var colorMap = {};
    skuList.forEach(function (item) {
      var color = (item.color || '').trim() || '默认';
      var size = (item.size || '').trim() || '均码';
      var qty = Number(item.cuttingQty || item.totalQuantity || item.quantity || 0);
      if (sizeSet.indexOf(size) === -1) sizeSet.push(size);
      if (!colorMap[color]) colorMap[color] = {};
      colorMap[color][size] = qty;
    });
    // 按标准尺码顺序排列列头（XS→S→M→L→XL→2XL→XXL→...）
    sizeSet = sortBySizeOrder(sizeSet);
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
          self.setData({ aiTipData: res, aiTipVisible: true });
        }
      })
      .catch(function (err) {
        console.warn('[confirm] AI提示获取失败:', err);
      });
  },

  dismissAiTip() {
    this.setData({ aiTipVisible: false });
  },

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

    if (this.data.isProcurement) {
      return this._confirmProcurement();
    }

    if (this.data.isCutting) {
      return this._confirmCutting();
    }

    return this._confirmNormalScan();
  },

  async _confirmProcurement() {
    var materialPurchases = this.data.materialPurchases;
    if (!materialPurchases || materialPurchases.length === 0) {
      toast.error('无采购物料');
      return;
    }

    var userInfo = getUserInfo() || {};
    var receiverId = String(userInfo.id || userInfo.userId || '').trim();
    var receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('领取人信息缺失，请重新登录');
      return;
    }

    var pendingItems = materialPurchases.filter(function(item) {
      var status = String(item.status || '').trim().toLowerCase();
      return !status || status === 'pending';
    });

    if (pendingItems.length === 0) {
      toast.success('所有物料均已领取');
      this._emitRefresh();
      wx.navigateBack();
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: '领取中...', mask: true });

    try {
      await Promise.all(pendingItems.map(function(item) {
        return api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId: receiverId,
          receiverName: receiverName
        });
      }));

      wx.hideLoading();
      this.setData({ loading: false });
      toast.success('已领取 ' + pendingItems.length + ' 项物料');

      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false });
      toast.error(e.errMsg || e.message || '领取失败');
    }
  },

  async _confirmCutting() {
    var cuttingTask = this.data.cuttingTask;
    if (!cuttingTask || !cuttingTask.id) {
      toast.error('无裁剪任务可领取');
      return;
    }

    var status = String(cuttingTask.status || '').trim().toLowerCase();
    if (status === 'received' || status === 'in_progress' || status === 'completed' || status === 'done') {
      toast.info('该任务已被领取');
      wx.navigateBack();
      return;
    }

    var userInfo = getUserInfo() || {};
    var receiverId = String(userInfo.id || userInfo.userId || '').trim();
    var receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('领取人信息缺失，请重新登录');
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: '领取中...', mask: true });

    try {
      await api.production.receiveCuttingTaskById(cuttingTask.id, receiverId, receiverName);

      wx.hideLoading();
      this.setData({ loading: false });
      toast.success('裁剪任务已领取');
      this._emitRefresh();

      wx.redirectTo({
        url: '/pages/cutting/bundle-detail/index?orderNo=' + encodeURIComponent(this.data.detail.orderNo) + '&styleNo=' + encodeURIComponent(this.data.detail.styleNo)
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false });
      toast.error(e.errMsg || e.message || '领取失败');
    }
  },

  async _confirmNormalScan() {
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
        // 超额审批处理：有任一结果要求审批，走审批流程
        var approvalResult = (results || []).find(function (r) { return r && r.needApproval; });
        if (approvalResult) {
            this.setData({ loading: false });
            wx.showModal({
                title: '已提交主管审批',
                content: '入库数量超出限制，已记录并提交主管【' +
                         (approvalResult.approverName || '') + '】审批，审批通过后自动完成入库。\n' +
                         (approvalResult.overQuantityDetail || ''),
                showCancel: false,
                confirmText: '知道了',
                success: function () { wx.navigateBack(); }
            });
            return;
        }
      var invalid = (results || []).find(function (r) {
        return !(r && r.scanRecord && (r.scanRecord.id || r.scanRecord.recordId));
      });
      if (invalid) {
        var msg = (invalid && invalid.message) ? String(invalid.message) : '部分扫码未落库，请重试';
        throw new Error(msg);
      }

      toast.success('批量提交成功（' + tasks.length + '条）');
      getApp().globalData.lastScanResult = {
        orderNo: raw.orderNo || '',
        processCode: raw.processCode || '',
        processName: raw.progressStage || raw.processName || '',
        quantity: (validation.validList || []).reduce(function (sum, item) { return sum + (item.quantity || 0); }, 0),
        success: true,
      };
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      var raw = this._scanContext;
      getApp().globalData.lastScanResult = {
        orderNo: (raw && raw.orderNo) || '',
        processCode: (raw && raw.processCode) || '',
        processName: (raw && (raw.progressStage || raw.processName)) || '',
        quantity: 0,
        success: false,
      };
      wx.showModal({
        title: '扫码失败',
        content: e.message || e.errMsg || '提交失败，请稍后重试',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  _emitRefresh() {
    triggerDataRefresh('scan');
  }
});
