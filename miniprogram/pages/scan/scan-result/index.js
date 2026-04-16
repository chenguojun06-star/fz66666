const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('../handlers/helpers/ScanModeResolver');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { triggerDataRefresh } = require('../../../utils/eventBus');

function normalizePositiveInt(value, fallback) {
  fallback = (fallback === undefined) ? 1 : fallback;
  var n = parseInt(value, 10);
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
    warehouseCode: '',
    warehouseOptions: [],
    showWarehouse: false,
    isQualityReceive: false,
    imageInsight: '',
    loading: false
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

    var processOptions = this._buildProcessOptions(raw);
    if (processOptions.length === 0 && raw.processName) {
      processOptions = [{
        label: raw.processName,
        value: raw.processName,
        scanType: raw.scanType || 'production',
        unitPrice: 0,
        hidePrice: true,
        checked: true
      }];
    }
    var isWarehouseStage = raw.progressStage === 'warehouse' || raw.progressStage === '入库'
      || raw.scanType === 'warehouse'
      || (raw.stageResult && raw.stageResult.scanType === 'warehouse')
      || raw.showWarehouse;
    if (processOptions.length === 0 && isWarehouseStage) {
      processOptions = [{
        label: '入库',
        value: raw.progressStage || 'warehouse',
        scanType: 'warehouse',
        unitPrice: 0,
        hidePrice: true,
        checked: true
      }];
    }
    var selectedNames = processOptions.filter(function(o) { return o.checked; }).map(function(o) { return o.value; });
    if (selectedNames.length === 0 && processOptions.length > 0) {
      selectedNames = [processOptions[0].value];
      processOptions[0].checked = true;
    }
    var summary = this._buildSummary(processOptions, selectedNames);
    var isQualityReceive = raw.progressStage === 'quality' || raw.progressStage === '质检';

    var coverImage = '';
    if (raw.orderDetail && raw.orderDetail.coverImage) {
      coverImage = getAuthedImageUrl(raw.orderDetail.coverImage);
    } else if (raw.orderDetail && raw.orderDetail.styleImage) {
      coverImage = getAuthedImageUrl(raw.orderDetail.styleImage);
    }

    var color = raw.color || '';
    var size = raw.size || '';
    var bundleNo = raw.bundleNo || '';
    var displayQuantity = raw.quantity || 0;

    var orderDetail = raw.orderDetail || {};
    var bedNo = orderDetail.bedNo || orderDetail.bed_number || orderDetail.bed || '';
    var cuttingDate = orderDetail.cuttingDate || orderDetail.cutDate || orderDetail.plannedCutDate || orderDetail.plannedStartDate || '';
    var deliveryDate = orderDetail.deliveryDate || orderDetail.expectedShipDate || orderDetail.shipDate || orderDetail.plannedShipDate || orderDetail.plannedEndDate || '';

    this.setData({
      detail: {
        coverImage: coverImage,
        styleNo: raw.styleNo || orderDetail.styleNo || '',
        orderNo: raw.orderNo || '',
        bundleNo: bundleNo,
        processName: raw.processName || '',
        progressStage: raw.progressStage || '',
        timeDisplay: raw.timeDisplay || '',
        color: color,
        size: size,
        displayQuantity: displayQuantity,
        bedNo: bedNo ? String(bedNo) : '',
        cuttingDateDisplay: this._formatYMD(cuttingDate),
        deliveryDateDisplay: this._formatYMD(deliveryDate),
        bundleStatusHints: raw.bundleStatusHints || [],
        bundleStatusText: raw.bundleStatusText || ''
      },
      processOptions: processOptions,
      selectedNames: selectedNames,
      selectedCount: summary.count,
      selectedAmount: summary.amount,
      quantity: normalizePositiveInt(raw.quantity, 1),
      showWarehouse: isWarehouseStage,
      isQualityReceive: isQualityReceive,
      warehouseCode: raw.warehouseCode || ''
    });

    if (isWarehouseStage) {
      this._loadWarehouseOptions();
    }

    this._backfillBundleDisplayMeta(raw, orderDetail);
  },

  onUnload() {
    getApp().globalData.scanResultData = null;
  },

  _formatYMD(v) {
    if (!v) return '';
    try {
      if (typeof v === 'string') {
        if (v.length >= 10) return v.substring(0, 10);
        return v;
      }
      var d = new Date(String(v).replace(' ', 'T'));
      if (isNaN(d.getTime())) return '';
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    } catch (e) {
      return '';
    }
  },

  async _backfillBundleDisplayMeta(raw, orderDetail) {
    if (!raw || !raw.orderNo || !raw.bundleNo) {
      return;
    }

    var detail = this.data.detail || {};
    var needColor = !detail.color;
    var needSize = !detail.size;
    var needDeliveryDate = !detail.deliveryDateDisplay;

    if (!needColor && !needSize && !needDeliveryDate) {
      return;
    }

    var patch = {};

    if (needColor || needSize || !detail.styleNo) {
      try {
        var bundle = await api.production.getCuttingBundle(raw.orderNo, raw.bundleNo);
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

    if (needDeliveryDate) {
      try {
        var source = orderDetail || {};
        var hasDelivery = source.deliveryDate || source.expectedShipDate || source.shipDate || source.plannedShipDate || source.plannedEndDate;
        if (!hasDelivery) {
          var orderRes = await api.production.orderDetailByOrderNo(raw.orderNo);
          if (orderRes && Array.isArray(orderRes.records) && orderRes.records.length > 0) {
            source = orderRes.records[0] || source;
          } else if (orderRes && typeof orderRes === 'object') {
            source = orderRes;
          }
        }
        var dateVal = source.deliveryDate || source.expectedShipDate || source.shipDate || source.plannedShipDate || source.plannedEndDate || '';
        var dateText = this._formatYMD(dateVal);
        if (dateText) {
          patch['detail.deliveryDateDisplay'] = dateText;
        }
      } catch (e) {
        console.warn('[scan-result] 回填交货日期失败:', e);
      }
    }

    if (Object.keys(patch).length > 0) {
      this.setData(patch);
    }
  },

  _buildProcessOptions(raw) {
    var stageResult = raw.stageResult || {};
    var allProcesses = stageResult.allBundleProcesses || [];
    var scannedArr = stageResult.scannedProcessNames || [];
    var scannedSet = {};
    scannedArr.forEach(function(n) { scannedSet[n] = true; });
    return allProcesses
      .filter(function(p) {
        var name = p.processName || p.name || '';
        return !scannedSet[name] || name === raw.processName;
      })
      .map(function(p) {
        var name = p.processName || p.name || '';
        return {
          label: name,
          value: name,
          scanType: p.scanType || 'production',
          unitPrice: p.unitPrice || 0,
          hidePrice: !p.unitPrice,
          checked: name === raw.processName
        };
      });
  },

  _buildSummary(options, selectedNames) {
    var selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    var count = 0, amount = 0;
    options.forEach(function(o) {
      if (selected[o.value]) {
        count++;
        amount += (o.unitPrice || 0);
      }
    });
    return { count: count, amount: Math.round(amount * 100) / 100 };
  },

  previewImage() {
    var img = this.data.detail.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onProcessTap(e) {
    var value = e.currentTarget.dataset.value;
    if (!value) return;
    var selectedNames = this.data.selectedNames.slice();
    var idx = selectedNames.indexOf(value);
    if (idx >= 0) {
      if (selectedNames.length <= 1) return;
      selectedNames.splice(idx, 1);
    } else {
      selectedNames.push(value);
    }
    var selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    var processOptions = this.data.processOptions.map(function(o) {
      return Object.assign({}, o, { checked: !!selected[o.value] });
    });
    var summary = this._buildSummary(processOptions, selectedNames);
    this.setData({
      selectedNames: selectedNames,
      processOptions: processOptions,
      selectedCount: summary.count,
      selectedAmount: summary.amount
    });
  },

  onWarehouseChipTap(e) {
    var val = e.currentTarget.dataset.value || '';
    this.setData({ warehouseCode: val });
  },

  onWarehouseClear() {
    this.setData({ warehouseCode: '' });
  },

  onWarehouseInput(e) {
    this.setData({ warehouseCode: e.detail.value || '' });
  },

  async _loadWarehouseOptions() {
    try {
      // getDictList 使用 ok() 帮助函数，已自动解包 resp.data，res 直接是数组
      var res = await api.system.getDictList('warehouse_location');
      var records = Array.isArray(res) ? res : ((res && res.records) ? res.records : (res && res.data ? res.data : []));
      if (records.length > 0) {
        var options = records
          .filter(function(item) { return item.dictLabel; })
          .sort(function(a, b) { return (a.sort || a.sortOrder || 0) - (b.sort || b.sortOrder || 0); })
          .map(function(item) { return item.dictLabel; });
        if (options.length > 0) {
          this.setData({ warehouseOptions: options });
        }
      }
    } catch (e) {
      console.warn('[scan-result] 加载仓库选项失败', e);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  async submitScanResult() {
    if (this.data.loading) return;
    var raw = this._scanContext;
    var selectedNames = this.data.selectedNames;
    var processOptions = this.data.processOptions;
    var quantity = this.data.quantity;
    var warehouseCode = this.data.warehouseCode;

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
    var selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    var selectedOptions = processOptions.filter(function(o) { return selected[o.value]; });
    var successCount = 0;
    var failedItems = [];

    try {
      for (var i = 0; i < selectedOptions.length; i++) {
        var option = selectedOptions[i];
        // 质检工序强制路由为 quality，避免 normalizeScanType 因传入 'production' 直接返回
        // 而跳过质检分支（Bug #1: 'production' 是标准值会被直接返回，不会检查 progressStage）
        var effectiveScanType = option.scanType || 'production';
        if (raw.progressStage === 'quality' || raw.progressStage === '质检') {
          effectiveScanType = 'quality';
        }
        var scanPayload = Object.assign({}, raw.scanData || {}, {
          scanType: normalizeScanType(raw.progressStage, effectiveScanType),
          processName: option.value,
          quantity: quantity
        });
        if (raw.progressStage === 'quality' || raw.progressStage === '质检') {
          // qualityStage 优先使用 StageDetector 已计算的值（在 raw.scanData / raw.qualityStage 中），
          // 未传入时兜底为 'receive'（领取），避免跳过领取步骤导致后端 400
          scanPayload.qualityStage = scanPayload.qualityStage || raw.qualityStage || 'receive';
        }
        if (warehouseCode) {
          scanPayload.warehouse = warehouseCode;
        }
        if (raw.isDefectiveReentry) {
          scanPayload.isDefectiveReentry = true;
        }
        try {
          var result = await api.production.executeScan(scanPayload);
          if (result && (result.recordId || result.id)) {
            successCount++;
          }
        } catch (itemErr) {
          failedItems.push({ processName: option.value, error: itemErr.message || itemErr.errMsg || '提交失败' });
        }
      }

      if (successCount > 0) {
        this._emitRefresh();
      }

      if (failedItems.length === 0) {
        if (this.data.isQualityReceive) {
          wx.showModal({
            title: '已领取质检任务',
            content: '请在小云待办中点击该任务，录入质检结果（合格/不合格）。',
            showCancel: false,
            confirmText: '知道了',
            success: function() { wx.navigateBack(); }
          });
        } else {
          toast.success('已完成 ' + successCount + ' 个工序扫码');
          wx.navigateBack();
        }
      } else if (successCount > 0) {
        this.setData({ loading: false });
        var failNames = failedItems.map(function(f) { return f.processName; }).join('、');
        wx.showModal({
          title: '部分工序提交失败',
          content: '成功 ' + successCount + ' 个，失败：' + failNames + '。请稍后重新扫码提交失败工序。',
          showCancel: false,
          confirmText: '知道了',
          success: function() { wx.navigateBack(); }
        });
      } else {
        this.setData({ loading: false });
        var msg = failedItems[0].error || '提交失败，请稍后重试';
        wx.showModal({ title: '扫码失败', content: msg, showCancel: false, confirmText: '知道了' });
      }
    } catch (e) {
      this.setData({ loading: false });
      var errMsg = this._buildFriendlyError(e);
      wx.showModal({ title: '扫码失败', content: errMsg, showCancel: false, confirmText: '知道了' });
    }
  },

  _buildFriendlyError(error) {
    if (!error) return '未知错误';
    if (!error.response && !error.status) return '网络不稳定，请检查网络后重试';
    var status = error.status || (error.response && error.response.status);
    if (status === 401) return '登录已过期，请重新登录';
    if (status === 403) return '没有操作权限';
    if (status === 409) return '该记录已提交，请勿重复操作';
    return error.message || error.errMsg || (error.data && error.data.message) || '提交失败，请稍后重试';
  },

  _emitRefresh() {
    triggerDataRefresh('scan');
  }
});
