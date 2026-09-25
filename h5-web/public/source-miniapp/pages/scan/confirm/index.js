const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('../handlers/helpers/ScanModeResolver');
const SKUProcessor = require('../processors/SKUProcessor');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const { sortSizeNames } = require('../../../utils/orderParser');
const { normalizeProcessName, displayPurchaseStatusText, displayStatusText } = require('../../../utils/displayHelper');
const { calcDeliveryInfo } = require('../../../utils/deliveryHelper');
const i18n = require('../../../utils/i18n/index');

/** 本页 i18n 命名空间前缀 */
const NS = 'mp.scanConfirm.';

// 裁剪任务状态：displayPurchaseStatus 共享映射 + 本地兜底
// 兜底映射只存 i18n 键后缀，文案按语言取（displayHelper 共享映射待 utils 批次收编）
const LOCAL_CUTTING_STATUS_FALLBACK = {
  not_started: 'statusPending',
  in_progress: 'statusClaimed',
  bundled: 'statusBundled',
  done: 'statusDone',
};

function getCuttingTaskStatusLabel(status, lang) {
  var fallbackKey = 'statusPending';
  if (!status) return i18n.t(NS + fallbackKey, lang);
  var key = String(status).trim().toLowerCase();
  if (LOCAL_CUTTING_STATUS_FALLBACK[key]) return i18n.t(NS + LOCAL_CUTTING_STATUS_FALLBACK[key], lang);
  var label = displayPurchaseStatusText(key);
  return (label && label !== key) ? label : (status || i18n.t(NS + fallbackKey, lang));
}

// 二次工艺状态：displayStatus 共享映射 + 本地兜底
const LOCAL_PROCESS_STATUS_FALLBACK = {
  pending: 'statusTodo',
  processing: 'statusDoing',
};

function getSecondaryProcessStatusLabel(status, lang) {
  if (!status) return '';
  var key = String(status).trim().toLowerCase();
  if (LOCAL_PROCESS_STATUS_FALLBACK[key]) return i18n.t(NS + LOCAL_PROCESS_STATUS_FALLBACK[key], lang);
  var label = displayStatusText(key);
  return (label && label !== key) ? label : (status || '');
}

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
    loading: false,
    deliveryInfo: {},
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        tabPurchase: i18n.t(NS + 'tabPurchase', lang),
        tabCutting: i18n.t(NS + 'tabCutting', lang),
        deliveryLabel: i18n.t('mp.scanResult.deliveryLabel', lang),
        orderDetailTitle: i18n.t(NS + 'orderDetailTitle', lang),
        importantTip: i18n.t(NS + 'importantTip', lang),
        normalTip: i18n.t(NS + 'normalTip', lang),
        craftSheetTitle: i18n.t(NS + 'craftSheetTitle', lang),
        secondaryWord: i18n.t(NS + 'secondaryWord', lang),
        estPriceLabel: i18n.t(NS + 'estPriceLabel', lang),
        claimHint: i18n.t(NS + 'claimHint', lang),
        statusPending: i18n.t(NS + 'statusPending', lang),
        unitMeter: i18n.t(NS + 'unitMeter', lang),
        allColors: i18n.t(NS + 'allColors', lang),
        submitting: i18n.t('common.submitting', lang),
        purchaseWord: i18n.t(NS + 'purchaseWord', lang),
        scanWord: i18n.t(NS + 'scanWord', lang),
        qtyPrefix: i18n.t(NS + 'qtyPrefix', lang),
        pricePrefix: i18n.t(NS + 'pricePrefix', lang),
        factoryPrefix: i18n.t(NS + 'factoryPrefix', lang),
        remarkPrefix: i18n.t(NS + 'remarkPrefix', lang),
        noPurchaseOrder: i18n.t(NS + 'noPurchaseOrder', lang),
        codePrefix: i18n.t(NS + 'codePrefix', lang),
        specPrefix: i18n.t(NS + 'specPrefix', lang),
        unitPrefix: i18n.t(NS + 'unitPrefix', lang),
        compPrefix: i18n.t(NS + 'compPrefix', lang),
        weightPrefix: i18n.t(NS + 'weightPrefix', lang),
        widthPrefix: i18n.t(NS + 'widthPrefix', lang),
        demandLabel: i18n.t(NS + 'demandLabel', lang),
        arrivedLabel: i18n.t(NS + 'arrivedLabel', lang),
        pendingArrival: i18n.t(NS + 'pendingArrival', lang),
        totalDemand: i18n.t(NS + 'totalDemand', lang),
        totalArrived: i18n.t(NS + 'totalArrived', lang),
        totalPendingArr: i18n.t(NS + 'totalPendingArr', lang),
        orderInfoTitle: i18n.t(NS + 'orderInfoTitle', lang),
        orderNoLabel: i18n.t(NS + 'orderNoLabel', lang),
        styleNoLabel: i18n.t(NS + 'styleNoLabel', lang),
        colorLabel: i18n.t(NS + 'colorLabel', lang),
        orderQtyLabel: i18n.t(NS + 'orderQtyLabel', lang),
        taskStatusLabel: i18n.t(NS + 'taskStatusLabel', lang),
        claimantLabel: i18n.t(NS + 'claimantLabel', lang),
        noMaterialPrice: i18n.t(NS + 'noMaterialPrice', lang),
        qtyPh: i18n.t(NS + 'qtyPrefix', lang),
        pieceUnit: i18n.t('common.piece', lang),
        totalQtyLabel: i18n.t(NS + 'totalQtyLabel', lang),
        cuttingUnitPrice: i18n.t(NS + 'cuttingUnitPrice', lang),
        cancel: i18n.t('common.cancel', lang),
        submitting: i18n.t('common.submitting', lang),
        btnConfirmScan: i18n.t(NS + 'btnConfirmScan', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad() {
    var lang = i18n.getLanguage();
    this.applyLanguage(lang);
    const app = getApp();
    const raw = app.globalData.confirmScanData;
    if (!raw) {
      toast.error(i18n.t('common.dataError', this._lang));
      wx.navigateBack();
      return;
    }
    this._scanContext = raw;

    const orderDetail = raw.orderDetail || {};
    const isProcurement = raw.progressStage === '采购';
    const isCutting = raw.progressStage === '裁剪';

    if (isProcurement) {
      wx.setNavigationBarTitle({ title: i18n.t(NS + 'procTitle', lang) });
    } else if (isCutting) {
      wx.setNavigationBarTitle({ title: i18n.t(NS + 'cuttingTitle', lang) });
    }

    const skuItems = raw.skuItems || orderDetail.orderItems || [];

    const normalized = SKUProcessor.normalizeOrderItems(skuItems, raw.orderNo, raw.styleNo || orderDetail.styleNo);
    const formItems = SKUProcessor.buildSKUInputList(normalized);
    const summary = SKUProcessor.getSummary(formItems);
    const sizeMatrix = this._buildSizeMatrix(normalized);

    const coverImage = getAuthedImageUrl(orderDetail.coverImage || orderDetail.styleImage || '');

    let materialPurchases = [];
    const materialSummary = { totalDemand: 0, totalArrived: 0, totalPending: 0 };
    if (isProcurement && Array.isArray(raw.materialPurchases)) {
      const MATERIAL_TYPE_MAP = {
        fabricA: i18n.t(NS + 'matMain', lang), fabricB: i18n.t(NS + 'matAux', lang),
        liningA: i18n.t(NS + 'matLining', lang), liningB: i18n.t(NS + 'matJia', lang), liningC: i18n.t(NS + 'matInter', lang),
        accessoryA: i18n.t(NS + 'matZipper', lang), accessoryB: i18n.t(NS + 'matButton', lang), accessoryC: i18n.t(NS + 'matAccessory', lang),
      };
      materialPurchases = raw.materialPurchases.map(function(item) {
        return Object.assign({}, item, {
          materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || '',
        });
      });
      materialPurchases.forEach(function(item) {
        materialSummary.totalDemand += Number(item.purchaseQuantity) || 0;
        materialSummary.totalArrived += Number(item.arrivedQuantity) || 0;
        materialSummary.totalPending += Number(item.pendingQuantity) || 0;
      });
    }

    let cuttingTask = null;
    if (isCutting && raw.cuttingTask) {
      cuttingTask = raw.cuttingTask;
      cuttingTask.statusText = getCuttingTaskStatusLabel(cuttingTask.status, lang);
    }

    let btnText = i18n.t(NS + 'btnConfirmScan', lang);
    if (isProcurement) btnText = i18n.t(NS + 'btnClaimAll', lang);
    else if (isCutting) {
      if (cuttingTask && ['completed', 'done'].includes(cuttingTask.status)) {
        btnText = i18n.t(NS + 'btnCuttingDone', lang);
      } else {
        btnText = cuttingTask ? i18n.t(NS + 'btnClaimTask', lang) : i18n.t(NS + 'btnBack', lang);
      }
    }

    const PROCESS_TYPE_MAP = {
      embroidery: i18n.t(NS + 'procEmbroidery', lang), printing: i18n.t(NS + 'procPrinting', lang), washing: i18n.t(NS + 'procWashing', lang),
      dyeing: i18n.t(NS + 'procDyeing', lang), ironing: i18n.t(NS + 'procIroning', lang), pleating: i18n.t(NS + 'procPleating', lang),
      beading: i18n.t(NS + 'procBeading', lang), other: i18n.t(NS + 'procOther', lang),
    };
    const rawProcesses = orderDetail.secondaryProcesses || raw.secondaryProcesses || [];
    const secondaryProcesses = rawProcesses.map(function(item) {
      return Object.assign({}, item, {
        processTypeCN: PROCESS_TYPE_MAP[item.processType] || item.processType || '',
        statusCN: getSecondaryProcessStatusLabel(item.status, lang),
      });
    });

    const description = orderDetail.description || raw.description || '';

    // 提取交期与剩余天数（数据来自API返回的orderDetail）
    const deliveryDate = orderDetail.deliveryDate
      || orderDetail.expectedShipDate
      || orderDetail.shipDate
      || orderDetail.plannedShipDate
      || orderDetail.plannedEndDate
      || '';
    const deliveryInfo = calcDeliveryInfo({
      plannedEndDate: deliveryDate,
      status: orderDetail.status,
      createTime: orderDetail.createTime,
    });

    // 提取裁剪工序单价（来自 handleCuttingMode 注入的 stageResult）
    let cuttingUnitPrice = 0;
    if (isCutting) {
      const stageResult = raw.stageResult || {};
      const allBundleProcesses = stageResult.allBundleProcesses || [];
      const cuttingProc = allBundleProcesses.find(function(p) {
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
        processName: normalizeProcessName(raw.processName || ''),
        progressStage: raw.progressStage || '',
        bomFallback: raw.bomFallback || false,
        quantity: raw.quantity || 0,
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
      sizeMatrix: sizeMatrix,
      deliveryInfo: deliveryInfo,
    });

    // 防御性检查：裁剪已完成 → 自动提示并返回
    if (isCutting && cuttingTask && ['completed', 'done'].includes(cuttingTask.status)) {
      wx.showToast({ title: i18n.t(NS + 'cuttingClaimed', this._lang), icon: 'success' });
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
    let sizeSet = [];
    const colorMap = {};
    skuList.forEach(function (item) {
      const color = (item.color || '').trim() || '默认';
      const size = (item.size || '').trim() || '均码';
      const qty = Number(item.cuttingQty || item.totalQuantity || item.quantity || 0);
      if (sizeSet.indexOf(size) === -1) sizeSet.push(size);
      if (!colorMap[color]) colorMap[color] = {};
      colorMap[color][size] = qty;
    });
    // 按标准尺码顺序排列列头（XS→S→M→L→XL→2XL→XXL→...）
    sizeSet = sortSizeNames(sizeSet);
    const rows = Object.keys(colorMap).map(function (color) {
      return {
        color: color,
        cells: sizeSet.map(function (size) {
          return { size: size, quantity: colorMap[color][size] || 0 };
        }),
      };
    });
    return { sizes: sizeSet, rows: rows };
  },

  _fetchAiTip(orderNo, processName) {
    const self = this;
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
    const img = this.data.detail.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onSkuInput(e) {
    const idx = e.currentTarget.dataset.index;
    const val = parseInt(e.detail.value, 10) || 0;
    const key = 'skuList[' + idx + '].inputQuantity';
    this.setData({ [key]: val });
    const summary = SKUProcessor.getSummary(this.data.skuList);
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
    const materialPurchases = this.data.materialPurchases;
    if (!materialPurchases || materialPurchases.length === 0) {
      toast.error(i18n.t(NS + 'noMaterial', this._lang));
      return;
    }

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error(i18n.t(NS + 'claimantMissing', this._lang));
      return;
    }

    const pendingItems = materialPurchases.filter(function(item) {
      const status = String(item.status || '').trim().toLowerCase();
      return !status || status === 'pending';
    });

    if (pendingItems.length === 0) {
      toast.success(i18n.t(NS + 'allClaimed', this._lang));
      this._emitRefresh();
      wx.navigateBack();
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: i18n.t(NS + 'claiming', this._lang), mask: true });

    try {
      await Promise.all(pendingItems.map(function(item) {
        return api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId: receiverId,
          receiverName: receiverName,
        });
      }));

      wx.hideLoading();
      this.setData({ loading: false });
      toast.success(i18n.tf(NS + 'itemsClaimed', { count: pendingItems.length }, this._lang));

      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false });
      toast.error(e.errMsg || e.message || i18n.t(NS + 'claimFailed', this._lang));
    }
  },

  async _confirmCutting() {
    const cuttingTask = this.data.cuttingTask;
    if (!cuttingTask || !cuttingTask.id) {
      toast.error(i18n.t(NS + 'noCuttingTask', this._lang));
      return;
    }

    const status = String(cuttingTask.status || '').trim().toLowerCase();
    if (status === 'received' || status === 'in_progress' || status === 'completed' || status === 'done') {
      toast.info(i18n.t(NS + 'taskClaimed', this._lang));
      wx.navigateBack();
      return;
    }

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error(i18n.t(NS + 'claimantMissing', this._lang));
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: i18n.t(NS + 'claiming', this._lang), mask: true });

    try {
      await api.production.receiveCuttingTaskById(cuttingTask.id, receiverId, receiverName);

      wx.hideLoading();
      this.setData({ loading: false });
      toast.success(i18n.t(NS + 'cuttingClaimed', this._lang));
      this._emitRefresh();

      wx.redirectTo({
        url: '/pages/cutting/bundle-detail/index?orderNo=' + encodeURIComponent(this.data.detail.orderNo) + '&styleNo=' + encodeURIComponent(this.data.detail.styleNo),
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false });
      toast.error(e.errMsg || e.message || i18n.t(NS + 'claimFailed', this._lang));
    }
  },

  async _confirmNormalScan() {
    var raw = this._scanContext;
    if (!raw) { toast.error(i18n.t('common.dataError', this._lang)); return; }

    const skuList = this.data.skuList;
    const validation = SKUProcessor.validateSKUInputBatch(skuList);
    if (!validation.valid) {
      toast.error((validation.errors && validation.errors[0]) || i18n.t(NS + 'checkInput', this._lang));
      return;
    }

    this.setData({ loading: true });

    try {
      const requests = SKUProcessor.generateScanRequests(
        validation.validList,
        raw.orderNo,
        raw.styleNo || (raw.orderDetail && raw.orderDetail.styleNo) || '',
        raw.progressStage,
        { scanCode: raw.scanCode || raw.orderNo || '' },
      );

      if (requests.length === 0) {
        throw new Error(i18n.t(NS + 'checkInput', this._lang));
      }

      const tasks = requests.map(function (req) {
        req.scanType = normalizeScanType(raw.progressStage, req.scanType || 'production');
        return api.production.executeScan(req);
      });

      const results = await Promise.all(tasks);
      // 超额审批处理：有任一结果要求审批，走审批流程
      const approvalResult = (results || []).find(function (r) { return r && r.needApproval; });
      if (approvalResult) {
        this.setData({ loading: false });
        wx.showModal({
          title: i18n.t(NS + 'submittedApproval', this._lang),
          content: i18n.tf(NS + 'overLimitContent', { name: approvalResult.approverName || '' }, this._lang) +
                         '\n' + (approvalResult.overQuantityDetail || ''),
          showCancel: false,
          confirmText: i18n.t('common.gotIt', this._lang),
          success: function () { wx.navigateBack(); },
        });
        return;
      }
      const invalid = (results || []).find(function (r) {
        return !(r && r.scanRecord && (r.scanRecord.id || r.scanRecord.recordId));
      });
      if (invalid) {
        const msg = (invalid && invalid.message) ? String(invalid.message) : i18n.t(NS + 'partialNotSaved', this._lang);
        throw new Error(msg);
      }

      toast.success(i18n.tf(NS + 'batchSubmitted', { count: tasks.length }, this._lang));
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
      raw = this._scanContext;
      getApp().globalData.lastScanResult = {
        orderNo: (raw && raw.orderNo) || '',
        processCode: (raw && raw.processCode) || '',
        processName: (raw && (raw.progressStage || raw.processName)) || '',
        quantity: 0,
        success: false,
      };
      wx.showModal({
        title: i18n.t(NS + 'scanFailTitle', this._lang),
        content: e.message || e.errMsg || i18n.t(NS + 'submitFailRetry', this._lang),
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
    }
  },

  _emitRefresh() {
    triggerDataRefresh('scan');
  },
});
