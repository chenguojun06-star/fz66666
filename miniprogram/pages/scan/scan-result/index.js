const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('../handlers/helpers/ScanModeResolver');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const { normalizeProcessName } = require('../../../utils/displayHelper');

function normalizePositiveInt(value, fallback) {
  fallback = (fallback === undefined) ? 1 : fallback;
  const n = parseInt(value, 10);
  if (!isFinite(n) || n <= 0) return fallback;
  return n;
}

Page({
  data: {
    detail: {},
    processOptions: [],
    selectedNames: [],
    selectedCount: 0,
    selectedAmount: 0,
    quantity: 1,
    warehouseName: '成品库',
    warehouseCode: '',
    warehouseAreaId: '',
    warehouseOptions: [],
    warehouseLocationCode: '',
    locationOptions: [],
    showWarehouse: false,
    isQualityReceive: false,
    imageInsight: '',
    productionHints: null,
    loading: false,
  },

  onLoad() {
    const app = getApp();
    const raw = app.globalData.scanResultData;
    if (!raw) {
      toast.error('数据异常');
      wx.navigateBack();
      return;
    }
    this._scanContext = raw;

    let processOptions = this._buildProcessOptions(raw);
    if (processOptions.length === 0 && raw.processName) {
      processOptions = [{
        label: raw.processName,
        value: raw.processName,
        scanType: raw.scanType || 'production',
        unitPrice: 0,
        hidePrice: true,
        checked: true,
      }];
    }
    const isWarehouseStage = !!(raw.progressStage === 'warehouse' || raw.progressStage === '入库'
      || raw.scanType === 'warehouse'
      || (raw.stageResult && raw.stageResult.scanType === 'warehouse')
      || raw.showWarehouse);
    if (processOptions.length === 0 && isWarehouseStage) {
      processOptions = [{
        label: '入库',
        value: raw.progressStage || 'warehouse',
        scanType: 'warehouse',
        unitPrice: 0,
        hidePrice: true,
        checked: true,
      }];
    }
    let selectedNames = processOptions.filter(function(o) { return o.checked; }).map(function(o) { return o.value; });
    if (selectedNames.length === 0 && processOptions.length > 0) {
      selectedNames = [processOptions[0].value];
      processOptions[0].checked = true;
    }
    const summary = this._buildSummary(processOptions, selectedNames);
    let isQualityReceive = raw.progressStage === 'quality' || raw.progressStage === '质检'
      || raw.scanType === 'quality'
      || (raw.stageResult && raw.stageResult.scanType === 'quality');
    // 扩展检测：processOptions 全部为质检工序时也触发质检录入流程
    // （progressStage 未正确设为 quality 时的兜底，常见于工序列表来源的质检）
    if (!isQualityReceive && processOptions.length > 0) {
      const qualityKeywords = ['质检', '质量检验', '终检'];
      const allAreQuality = processOptions.every(function(o) {
        return o.scanType === 'quality' || qualityKeywords.indexOf(o.value) >= 0 || qualityKeywords.indexOf(o.label) >= 0;
      });
      if (allAreQuality) {
        isQualityReceive = true;
      }
    }

    let coverImage = '';
    if (raw.orderDetail && raw.orderDetail.coverImage) {
      coverImage = getAuthedImageUrl(raw.orderDetail.coverImage);
    } else if (raw.orderDetail && raw.orderDetail.styleImage) {
      coverImage = getAuthedImageUrl(raw.orderDetail.styleImage);
    }

    const color = raw.color || '';
    const size = raw.size || '';
    const bundleNo = raw.bundleNo || '';
    const displayQuantity = raw.quantity || 0;

    const orderDetail = raw.orderDetail || {};
    const bedNo = orderDetail.bedNo || orderDetail.bed_number || orderDetail.bed || '';
    const cuttingDate = orderDetail.cuttingDate || orderDetail.cutDate || orderDetail.plannedCutDate || orderDetail.plannedStartDate || '';
    const deliveryDate = orderDetail.deliveryDate || orderDetail.expectedShipDate || orderDetail.shipDate || orderDetail.plannedShipDate || orderDetail.plannedEndDate || '';

    this.setData({
      detail: {
        coverImage: coverImage,
        styleNo: raw.styleNo || orderDetail.styleNo || '',
        orderNo: raw.orderNo || '',
        bundleNo: bundleNo,
        processName: normalizeProcessName(raw.processName || ''),
        progressStage: raw.progressStage || '',
        timeDisplay: raw.timeDisplay || '',
        color: color,
        size: size,
        displayQuantity: displayQuantity,
        bedNo: bedNo ? String(bedNo) : '',
        cuttingDateDisplay: this._formatYMD(cuttingDate),
        deliveryDateDisplay: this._formatYMD(deliveryDate),
        bundleStatusHints: raw.bundleStatusHints || [],
        bundleStatusText: raw.bundleStatusText || '',
      },
      processOptions: processOptions,
      selectedNames: selectedNames,
      selectedCount: summary.count,
      selectedAmount: summary.amount,
      quantity: normalizePositiveInt(raw.quantity, 1),
      showWarehouse: isWarehouseStage,
      isQualityReceive: isQualityReceive,
      warehouseCode: raw.warehouseCode || '',
      warehouseAreaId: raw.warehouseAreaId || '',
      imageInsight: (raw.stageResult && raw.stageResult.imageInsight) || raw.imageInsight || (orderDetail.imageInsight) || '',
    });

    if (isWarehouseStage) {
      this._loadWarehouseOptions();
    }

    this._backfillBundleDisplayMeta(raw, orderDetail);
    this._loadProductionHints(raw, orderDetail);
  },

  onUnload() {
    getApp().globalData.scanResultData = null;
  },

  _formatYMD(v) {
    if (!v) return '';
    var d;
    try {
      if (typeof v === 'string') {
        if (v.length > 10) {
          d = new Date(v.replace(/-/g, '/'));
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
          }
        }
        if (v.length >= 10) return v.substring(0, 10);
        return v;
      }
      d = new Date(String(v).replace(' ', 'T'));
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + day + ' ' + h + ':' + min;
    } catch (e) {
      return '';
    }
  },

  async _backfillBundleDisplayMeta(raw, orderDetail) {
    if (!raw || !raw.orderNo || !raw.bundleNo) {
      return;
    }

    const detail = this.data.detail || {};
    const needColor = !detail.color;
    const needSize = !detail.size;
    const needDeliveryDate = !detail.deliveryDateDisplay;
    // 款式封面图回填：onLoad 时后端可能因 styleId 为空而未返回图片（老订单常见）
    const needCoverImage = !detail.coverImage;

    if (!needColor && !needSize && !needDeliveryDate && !needCoverImage) {
      return;
    }

    const patch = {};

    if (needColor || needSize || !detail.styleNo) {
      try {
        const bundle = await api.production.getCuttingBundle(raw.orderNo, raw.bundleNo);
        if (bundle) {
          if (needColor && bundle.color) {
            patch['detail.color'] = String(bundle.color);
          }
          if (needSize && bundle.size) {
            patch['detail.size'] = String(bundle.size);
          }
          if (!detail.styleNo && bundle.styleNo) {
            patch['detail.styleNo'] = String(bundle.styleNo);
          }
        }
      } catch (e) {
        console.warn('[scan-result] 回填菲号颜色/码数失败:', e);
      }
    }

    if (needDeliveryDate || needCoverImage) {
      try {
        let source = orderDetail || {};
        const hasDelivery = source.deliveryDate || source.expectedShipDate || source.shipDate || source.plannedShipDate || source.plannedEndDate;
        // needCoverImage 时强制重新请求，确保拿到后端最新 coverImage（含 styleNo 查款式三级兜底）
        if (!hasDelivery || needCoverImage) {
          const orderRes = await api.production.orderDetailByOrderNo(raw.orderNo);
          if (orderRes && Array.isArray(orderRes.records) && orderRes.records.length > 0) {
            source = orderRes.records[0] || source;
          } else if (orderRes && typeof orderRes === 'object') {
            source = orderRes;
          }
        }
        if (needDeliveryDate) {
          const dateVal = source.deliveryDate || source.expectedShipDate || source.shipDate || source.plannedShipDate || source.plannedEndDate || '';
          const dateText = this._formatYMD(dateVal);
          if (dateText) {
            patch['detail.deliveryDateDisplay'] = dateText;
          }
        }
        // 回填款式封面图（后端 queryPage 路径会通过 styleNo 三级兜底填充 coverImage）
        if (needCoverImage) {
          const coverUrl = source.coverImage || source.styleImage || source.styleCover || '';
          if (coverUrl) {
            patch['detail.coverImage'] = getAuthedImageUrl(coverUrl);
          }
        }
      } catch (e) {
        console.warn('[scan-result] 回填交货日期/封面图失败:', e);
      }
    }

    if (Object.keys(patch).length > 0) {
      this.setData(patch);
    }
  },

  async _loadProductionHints(raw, orderDetail) {
    const source = orderDetail || (raw && raw.orderDetail) || {};
    const styleId = source.styleId || source.style_id || (raw && raw.styleId) || '';
    if (!styleId) return;

    try {
      const styleInfo = await api.style.getStyleDetail(styleId);
      if (!styleInfo) return;

      const desc = styleInfo.description || '';
      const hints = {
        difficultyLabel: styleInfo.difficultyLabel || '',
        difficultyScore: styleInfo.difficultyScore || 0,
        difficultySeverity: this._difficultySeverity(styleInfo.difficultyScore),
        fabricComposition: styleInfo.fabricComposition || '',
        needleHint: this._parseNeedleHint(desc),
        craftNotes: desc,
        secondaryProcessText: '',
      };

      // 二次工艺
      try {
        const spRes = await api.style.listSecondaryProcesses({ styleId: styleId });
        const spList = Array.isArray(spRes) ? spRes : (spRes && spRes.records) || [];
        if (spList.length > 0) {
          hints.secondaryProcessText = spList
            .map(function(p) { return p.processName || p.processType || ''; })
            .filter(Boolean)
            .join('、');
        }
      } catch (spErr) {
        // 二次工艺加载失败不阻断主流程
      }

      const patch = { productionHints: hints };
      if (styleInfo.imageInsight && !this.data.imageInsight) {
        patch.imageInsight = styleInfo.imageInsight;
      }
      this.setData(patch);
    } catch (e) {
      console.warn('[scan-result] 加载生产提示失败:', e);
    }
  },

  _difficultySeverity(score) {
    const s = parseInt(score, 10);
    if (!s || s <= 0) return 'low';
    if (s <= 3) return 'low';
    if (s <= 6) return 'medium';
    if (s <= 8) return 'high';
    return 'critical';
  },

  _parseNeedleHint(desc) {
    if (!desc) return '';
    // 从工艺备注中解析针号提示，如 "11号针"、"9号针"
    const match = String(desc).match(/(\d{1,2}号针)/);
    if (match) return match[1];
    return '';
  },

  _buildProcessOptions(raw) {
    const stageResult = raw.stageResult || {};
    const allProcesses = stageResult.allBundleProcesses || [];
    const scannedArr = stageResult.scannedProcessNames || [];
    const scannedSet = {};
    scannedArr.forEach(function(n) { scannedSet[n] = true; });
    return allProcesses
      .filter(function(p) {
        const name = p.processName || p.name || '';
        return !scannedSet[name] || name === raw.processName;
      })
      .map(function(p) {
        const name = p.processName || p.name || '';
        return {
          label: name,
          value: name,
          progressStage: p.progressStage || '',
          scanType: p.scanType || 'production',
          unitPrice: p.unitPrice || 0,
          hidePrice: !p.unitPrice,
          checked: name === raw.processName,
        };
      });
  },

  _buildSummary(options, selectedNames) {
    const selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    let count = 0; let amount = 0;
    options.forEach(function(o) {
      if (selected[o.value]) {
        count++;
        amount += (o.unitPrice || 0);
      }
    });
    return { count: count, amount: Math.round(amount * 100) / 100 };
  },

  previewImage() {
    const img = this.data.detail.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onProcessTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    const selectedNames = this.data.selectedNames.slice();
    const idx = selectedNames.indexOf(value);
    if (idx >= 0) {
      if (selectedNames.length <= 1) return;
      selectedNames.splice(idx, 1);
    } else {
      selectedNames.push(value);
    }
    const selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    const processOptions = this.data.processOptions.map(function(o) {
      return Object.assign({}, o, { checked: !!selected[o.value] });
    });
    const summary = this._buildSummary(processOptions, selectedNames);
    this.setData({
      selectedNames: selectedNames,
      processOptions: processOptions,
      selectedCount: summary.count,
      selectedAmount: summary.amount,
    });
  },

  async _loadWarehouseOptions() {
    try {
      const res = await api.warehouse.listWarehouseAreas('FINISHED');
      const data = res?.data || res;
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        const areaMap = {};
        const options = [];
        const sorted = list
          .filter(function(item) { return item.areaName && item.id; })
          .sort(function(a, b) { return (a.sort || 0) - (b.sort || 0); });
        for (let i = 0; i < sorted.length; i++) {
          const item = sorted[i];
          options.push(item.areaName);
          areaMap[item.areaName] = item.id;
        }
        this.setData({ warehouseOptions: options });
        this._warehouseAreaMap = areaMap;
      }
    } catch (e) {
      console.warn('[scan-result] 加载仓库选项失败', e);
    }
  },

  async _loadLocationOptions(areaId) {
    if (!areaId) {
      this.setData({ locationOptions: [], warehouseLocationCode: '' });
      this._locationMap = {};
      return;
    }
    try {
      const res = await api.warehouse.listLocations('FINISHED', areaId);
      const data = res?.data || res;
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        const locMap = {};
        const options = [];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const label = item.locationCode || item.locationName || '';
          if (label) {
            options.push(label);
            locMap[label] = item.locationCode || label;
          }
        }
        this.setData({ locationOptions: options });
        this._locationMap = locMap;
      } else {
        this.setData({ locationOptions: [] });
        this._locationMap = {};
      }
    } catch (e) {
      console.warn('[scan-result] 加载库位选项失败', e);
      this.setData({ locationOptions: [] });
      this._locationMap = {};
    }
  },

  onWarehouseChipTap(e) {
    const val = e.currentTarget.dataset.value;
    if (this.data.warehouseCode === val) {
      this.setData({ warehouseCode: '', warehouseAreaId: '', warehouseLocationCode: '', locationOptions: [] });
    } else {
      const areaId = (this._warehouseAreaMap && this._warehouseAreaMap[val]) || '';
      this.setData({ warehouseCode: val, warehouseAreaId: areaId, warehouseLocationCode: '', locationOptions: [] });
      if (areaId) { this._loadLocationOptions(areaId); }
    }
  },

  onWarehouseClear() {
    this.setData({ warehouseCode: '', warehouseAreaId: '', warehouseLocationCode: '', locationOptions: [] });
  },

  onWarehouseInput(e) {
    const val = e.detail.value || '';
    const areaId = (this._warehouseAreaMap && this._warehouseAreaMap[val]) || '';
    this.setData({ warehouseCode: val, warehouseAreaId: areaId, warehouseLocationCode: '' });
    if (areaId) {
      this._loadLocationOptions(areaId);
    } else {
      this.setData({ locationOptions: [] });
    }
  },

  onLocationChipTap(e) {
    const val = e.currentTarget.dataset.value;
    if (this.data.warehouseLocationCode === val) {
      this.setData({ warehouseLocationCode: '' });
    } else {
      this.setData({ warehouseLocationCode: val });
    }
  },

  onLocationClear() {
    this.setData({ warehouseLocationCode: '' });
  },

  onLocationInput(e) {
    this.setData({ warehouseLocationCode: e.detail.value || '' });
  },

  goBack() {
    wx.navigateBack();
  },

  async submitScanResult() {
    if (this.data.loading) return;
    const raw = this._scanContext;

    // 质检一步到位：直接跳转录入页，quality/index 内部自动处理 receive+confirm
    if (this.data.isQualityReceive) {
      const detail = this.data.detail;
      const orderDetail = raw.orderDetail || {};
      // processName 兜底：若 raw 中没有，从已选质检工序名取第一个
      let qualityProcessName = raw.processName || detail.processName || '';
      if (!qualityProcessName && this.data.selectedNames.length > 0) {
        qualityProcessName = this.data.selectedNames[0];
      }
      getApp().globalData.qualityData = {
        orderNo:       raw.orderNo || '',
        orderItemId:   raw.orderItemId || '',
        bundleNo:      raw.bundleNo   || detail.bundleNo      || '',
        styleNo:       raw.styleNo   || detail.styleNo        || orderDetail.styleNo || '',
        color:         raw.color     || detail.color          || '',
        size:          raw.size      || raw.sizeSpec          || detail.size || '',
        processName:   qualityProcessName,
        progressStage: raw.progressStage || detail.progressStage || 'quality',
        quantity:      raw.quantity  || detail.displayQuantity || 0,
        operatorName:  raw.operatorName  || '',
        scanCode:      raw.scanCode  || raw.orderNo || '',
        coverImage:    orderDetail.coverImage || orderDetail.styleImage || '',
        orderId:       raw.orderId   || '',
      };
      safeNavigate({ url: '/pages/scan/quality/index' }).catch(() => {});
      return;
    }

    const selectedNames = this.data.selectedNames;
    const processOptions = this.data.processOptions;
    const quantity = this.data.quantity;
    const warehouseCode = this.data.warehouseCode;

    if (!raw || selectedNames.length === 0) {
      toast.error('请至少选择一个工序');
      return;
    }
    if (quantity <= 0) {
      toast.error('数量必须大于0');
      return;
    }
    if (this.data.showWarehouse && !warehouseCode.trim()) {
      toast.error('请输入仓库编号');
      return;
    }

    this.setData({ loading: true });
    const selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    const selectedOptions = processOptions.filter(function(o) { return selected[o.value]; });
    let successCount = 0;
    const failedItems = [];

    try {
      for (let i = 0; i < selectedOptions.length; i++) {
        const option = selectedOptions[i];
        // 质检工序强制路由为 quality，避免 normalizeScanType 因传入 'production' 直接返回
        // 而跳过质检分支（Bug #1: 'production' 是标准值会被直接返回，不会检查 progressStage）
        let effectiveScanType = option.scanType || 'production';
        if (raw.progressStage === 'quality' || raw.progressStage === '质检' || raw.scanType === 'quality') {
          effectiveScanType = 'quality';
        }
        const scanPayload = Object.assign({}, raw.scanData || {}, {
          scanType: normalizeScanType(raw.progressStage, effectiveScanType),
          processName: option.value,
          quantity: quantity,
        });
        if (raw.progressStage === 'quality' || raw.progressStage === '质检' || raw.scanType === 'quality') {
          // qualityStage 优先使用 StageDetector 已计算的值（在 raw.scanData / raw.qualityStage 中），
          // 未传入时兜底为 'receive'（领取），避免跳过领取步骤导致后端 400
          scanPayload.qualityStage = scanPayload.qualityStage || raw.qualityStage || 'receive';
        }
        if (warehouseCode) {
          scanPayload.warehouse = warehouseCode;
        }
        if (this.data.warehouseAreaId) {
          scanPayload.warehouseAreaId = this.data.warehouseAreaId;
        }
        if (this.data.warehouseLocationCode) {
          scanPayload.warehouseLocation = this.data.warehouseLocationCode;
        }
        if (raw.isDefectiveReentry) {
          scanPayload.isDefectiveReentry = true;
        }
        try {
          var result;
          if (raw.scanMode === 'pattern') {
            const patternPayload = {
              patternId: raw.patternId,
              operationType: option.value || raw.operationType,
              operatorRole: (raw.progressStage === 'quality' || raw.scanType === 'quality') ? 'QUALITY' : 'TAILOR',
              remark: '',
              quantity: quantity,
            };
            if (warehouseCode) {
              patternPayload.warehouseCode = warehouseCode;
            }
            if (this.data.warehouseAreaId) {
              patternPayload.warehouseAreaId = this.data.warehouseAreaId;
            }
            if (this.data.warehouseLocationCode) {
              patternPayload.warehouseLocationCode = this.data.warehouseLocationCode;
            }
            result = await api.production.submitPatternScan(patternPayload);
          } else {
            result = await api.production.executeScan(scanPayload);
          }
          if (result && (result.recordId || result.id)) {
            successCount++;
          }
        } catch (itemErr) {
          failedItems.push({ processName: option.value, error: itemErr.message || itemErr.errMsg || '提交失败' });
        }
      }

      if (successCount > 0) {
        this._emitRefresh();
        const firstOption = selectedOptions[0] || {};
        getApp().globalData.lastScanResult = {
          orderNo: raw.orderNo || '',
          processCode: raw.processCode || firstOption.value || '',
          processName: firstOption.value || raw.processName || '',
          quantity: quantity || 0,
          success: true,
        };
      }

      if (failedItems.length === 0) {
        toast.success('已完成 ' + successCount + ' 个工序扫码');
        wx.navigateBack();
      } else if (successCount > 0) {
        this.setData({ loading: false });
        const failNames = failedItems.map(function(f) { return f.processName; }).join('、');
        wx.showModal({
          title: '部分工序提交失败',
          content: '成功 ' + successCount + ' 个，失败：' + failNames + '。请稍后重新扫码提交失败工序。',
          showCancel: false,
          confirmText: '知道了',
          success: function() { wx.navigateBack(); },
        });
      } else {
        this.setData({ loading: false });
        const msg = failedItems[0].error || '提交失败，请稍后重试';
        getApp().globalData.lastScanResult = {
          orderNo: raw.orderNo || '',
          processCode: raw.processCode || '',
          processName: (selectedOptions[0] && selectedOptions[0].value) || raw.processName || '',
          quantity: quantity || 0,
          success: false,
        };
        wx.showModal({ title: '扫码失败', content: msg, showCancel: false, confirmText: '知道了' });
      }
    } catch (e) {
      this.setData({ loading: false });
      const errMsg = this._buildFriendlyError(e);
      getApp().globalData.lastScanResult = {
        orderNo: (raw && raw.orderNo) || '',
        processCode: (raw && raw.processCode) || '',
        processName: (raw && raw.processName) || '',
        quantity: quantity || 0,
        success: false,
      };
      wx.showModal({ title: '扫码失败', content: errMsg, showCancel: false, confirmText: '知道了' });
    }
  },

  _buildFriendlyError(error) {
    if (!error) return '未知错误';
    if (!error.response && !error.status) return '网络不稳定，请检查网络后重试';
    const status = error.status || (error.response && error.response.status);
    if (status === 401) return '登录已过期，请重新登录';
    if (status === 403) return '没有操作权限';
    if (status === 409) return '该记录已提交，请勿重复操作';
    return error.message || error.errMsg || (error.data && error.data.message) || '提交失败，请稍后重试';
  },

  _emitRefresh() {
    triggerDataRefresh('scan');
  },
});
