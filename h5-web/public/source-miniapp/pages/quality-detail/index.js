const api = require('../../utils/api');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const { eventBus, Events } = require('../../utils/eventBus');
const { getUserInfo } = require('../../utils/storage');
const qualityHelper = require('../../utils/quality-helper');
const { calcDeliveryInfo } = require('../../utils/deliveryHelper');

const getQualityCategory = qualityHelper.getQualityCategory;
const DEFECT_CATEGORY_MAP = qualityHelper.DEFECT_CATEGORY_MAP;

/**
 * 缺陷类别（与 PC 端 DEFECT_CATEGORY_OPTIONS 对齐）
 */
const DEFECT_CATEGORY_OPTIONS = [
  { value: 'appearance_integrity', label: '外观完整性' },
  { value: 'size_accuracy', label: '尺寸精度' },
  { value: 'process_compliance', label: '工艺规范性' },
  { value: 'functional_effectiveness', label: '功能有效性' },
  { value: 'other', label: '其他' },
];

/**
 * 处理方式（与 PC 端 DEFECT_REMARK_OPTIONS 对齐）
 */
const DEFECT_REMARK_OPTIONS = [
  { value: '返修', label: '返修' },
  { value: '报废', label: '报废' },
];

/**
 * 质检状态映射（与 PC 端 getQualityStatusConfig 对齐）
 */
const QUALITY_STATUS_MAP = {
  qualified: { text: '合格', cls: 'status-success' },
  unqualified: { text: '不合格', cls: 'status-error' },
  repaired: { text: '返修完成', cls: 'status-warning' },
  pending: { text: '待检', cls: 'status-info' },
};

const MATERIAL_TYPE_MAP = {
  fabric: '面料',
  accessory: '辅料',
  lining: '里布',
  other: '其他',
};

Page({
  data: {
    orderId: '',
    warehousingNo: '',
    briefing: null,
    order: null,
    style: null,
    bom: [],
    styleCover: '',
    // AI 质检助手
    aiSuggestion: null,
    aiLoading: false,
    // 质检记录
    qcRecords: [],
    latestRecord: null,
    qcStats: {
      total: 0,
      qualified: 0,
      unqualified: 0,
      count: 0,
      warehoused: 0,
      pendingWarehouse: 0,
      passRate: '-',
    },
    // 待质检菲号列表（从 pendingBundles 过滤当前订单）
    pendingBundles: [],
    // 仓库选项
    warehouseOptions: [],
    locationOptions: [],
    // 页面内质检表单（单选时显示，原弹窗内容）
    qcSheetData: {
      bundleId: '',
      bundleNo: '',
      qrCode: '',
      quantity: 0,
      qualifiedQty: 0,
      unqualifiedQty: 0,
      defectCategory: '',
      defectRemark: '',
      remark: '',
      imageUrls: [],
    },
    defectCategoryOptions: DEFECT_CATEGORY_OPTIONS,
    defectRemarkOptions: DEFECT_REMARK_OPTIONS,
    // 已选菲号二维码列表（多选）
    selectedBundleQrs: [],
    selectedBundleTotalQty: 0,
    // 批量不合格表单（多选时显示）
    batchUnqualFormVisible: false,
    batchUnqualData: {
      defectCategory: '',
      defectRemark: '',
    },
    // 页面内入库表单（记录下方展开，-1 表示未展开）
    whExpandIndex: -1,
    whSheetData: {
      recordId: '',
      warehousingNo: '',
      qualifiedQty: 0,
      bundleNo: '',
      warehouseAreaId: '',
      warehouseAreaName: '',
      warehouseLocationCode: '',
    },
    loading: true,
    recordsLoading: false,
    submitting: false,
    // 折叠状态（AI 助手 / BOM 降级为可折叠）
    aiCollapsed: false,
    bomCollapsed: true,
    // 兼容旧版
    detail: null,
    images: [],
  },

  onLoad: function (options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;

    var orderId = '';
    var warehousingNo = '';
    if (options && options.orderId) {
      orderId = String(options.orderId).trim();
    }
    if (options && options.warehousingNo) {
      try {
        warehousingNo = decodeURIComponent(String(options.warehousingNo)).trim();
      } catch (_e) {
        warehousingNo = String(options.warehousingNo).trim();
      }
    }

    if (!orderId && options && options.data) {
      try {
        var legacy = JSON.parse(decodeURIComponent(options.data));
        orderId = String(legacy.orderId || '').trim();
        warehousingNo = String(legacy.warehousingNo || '').trim();
        this._processLegacyDetail(legacy);
      } catch (e) {
        console.error('[QualityDetail] parse legacy data error:', e);
      }
    }

    if (!orderId) {
      toast.error('缺少订单ID');
      this.setData({ loading: false });
      return;
    }

    this.setData({ orderId: orderId, warehousingNo: warehousingNo });
    this.fetchBriefing();
    this.fetchQcRecords();
    this.fetchPendingBundles();
    this.fetchAiSuggestion();
    this._bindWsEvents();
  },

  onUnload: function () {
    this._unbindWsEvents();
  },

  onPullDownRefresh: function () {
    var self = this;
    Promise.all([
      this.fetchBriefing(),
      this.fetchQcRecords(),
      this.fetchPendingBundles(),
      this.fetchAiSuggestion(),
    ]).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 获取质检简报
   */
  fetchBriefing: function () {
    var self = this;
    var orderId = this.data.orderId;
    if (!orderId) return Promise.resolve();

    return api.production
      .qualityBriefing(orderId)
      .then(function (briefing) {
        if (!briefing || typeof briefing !== 'object') {
          self.setData({ loading: false });
          return;
        }
        var order = briefing.order || {};
        var style = briefing.style || null;
        var bom = Array.isArray(briefing.bom) ? briefing.bom : [];

        // 交期倒计时（与 dashboard/factory 共用 calcDeliveryInfo）
        var delivery = calcDeliveryInfo(order);
        order.deliveryDateStr = delivery.deliveryDateStr;
        order.remainDaysText = delivery.remainDaysText;
        order.remainDaysClass = delivery.remainDaysClass;

        var styleCover = '';
        if (style && style.cover) {
          styleCover = getAuthedImageUrl(style.cover);
        } else if (order.styleCover) {
          styleCover = getAuthedImageUrl(order.styleCover);
        }

        bom = bom.map(function (b) {
          b.materialTypeText = MATERIAL_TYPE_MAP[b.materialType] || b.materialType || '-';
          return b;
        });

        self.setData({
          briefing: briefing,
          order: order,
          style: style,
          bom: bom,
          styleCover: styleCover,
          loading: false,
        });
      })
      .catch(function (err) {
        console.error('[QualityDetail] fetchBriefing failed:', err);
        if (self.data.detail) {
          self.setData({ loading: false });
        } else {
          self.setData({ loading: false });
          toast.error('加载质检简报失败');
        }
      });
  },

  /**
   * 获取 AI 质检建议
   */
  fetchAiSuggestion: function () {
    var self = this;
    var orderId = this.data.orderId;
    if (!orderId) return Promise.resolve();

    this.setData({ aiLoading: true });

    return api.production
      .getQualityAiSuggestion(orderId)
      .then(function (suggestion) {
        if (!suggestion || typeof suggestion !== 'object') {
          self.setData({ aiSuggestion: null, aiLoading: false });
          return;
        }
        var checkpoints = Array.isArray(suggestion.checkpoints)
          ? suggestion.checkpoints : [];
        var defectSuggestions = suggestion.defectSuggestions || {};
        var defectList = [];
        if (defectSuggestions && typeof defectSuggestions === 'object') {
          Object.keys(defectSuggestions).forEach(function (key) {
            var label = DEFECT_CATEGORY_MAP[key] || key;
            var advice = defectSuggestions[key];
            if (advice) {
              defectList.push({ category: key, label: label, advice: String(advice) });
            }
          });
        }
        var historicalDefectRateText = '-';
        if (suggestion.historicalDefectRate != null) {
          var rate = Number(suggestion.historicalDefectRate);
          if (!isNaN(rate)) {
            historicalDefectRateText = (rate * 100).toFixed(1) + '%';
          }
        }
        var historicalVerdict = suggestion.historicalVerdict || '';
        var verdictText = '';
        var verdictCls = '';
        if (historicalVerdict === 'good') {
          verdictText = '良好';
          verdictCls = 'verdict-good';
        } else if (historicalVerdict === 'warn') {
          verdictText = '需关注';
          verdictCls = 'verdict-warn';
        } else if (historicalVerdict === 'critical') {
          verdictText = '高风险';
          verdictCls = 'verdict-critical';
        }

        self.setData({
          aiSuggestion: {
            urgentTip: suggestion.urgentTip || '',
            checkpoints: checkpoints,
            defectList: defectList,
            historicalDefectRateText: historicalDefectRateText,
            historicalVerdictText: verdictText,
            historicalVerdictCls: verdictCls,
            hasHistoricalData: suggestion.historicalDefectRate != null,
          },
          aiLoading: false,
        });
      })
      .catch(function (err) {
        console.warn('[QualityDetail] fetchAiSuggestion failed:', err);
        self.setData({ aiSuggestion: null, aiLoading: false });
      });
  },

  /**
   * 获取质检记录列表
   */
  fetchQcRecords: function () {
    var self = this;
    var orderId = this.data.orderId;
    if (!orderId) return Promise.resolve();

    this.setData({ recordsLoading: true });

    return api.production
      .listWarehousing({ orderId: orderId, page: 1, pageSize: 500 })
      .then(function (res) {
        var records = [];
        if (Array.isArray(res)) {
          records = res;
        } else if (res && Array.isArray(res.records)) {
          records = res.records;
        } else if (res && Array.isArray(res.list)) {
          records = res.list;
        }

        records = records.map(function (r) {
          return self._processQcRecord(r);
        });

        var stats = self._calcQcStats(records);

        // 取高亮记录或第一条作为质检信息卡/明细卡的数据源
        var latestRecord = null;
        if (records.length > 0) {
          latestRecord = records.find(function (r) { return r.isHighlighted; }) || records[0];
        }

        self.setData({
          qcRecords: records,
          qcStats: stats,
          latestRecord: latestRecord,
          recordsLoading: false,
          // 记录刷新后收起内联入库表单（记录顺序可能变化）
          whExpandIndex: -1,
        });
      })
      .catch(function (err) {
        console.error('[QualityDetail] fetchQcRecords failed:', err);
        self.setData({ recordsLoading: false });
        toast.error('质检记录加载失败');
      });
  },

  /**
   * 获取待质检菲号列表（过滤当前订单）
   */
  fetchPendingBundles: function () {
    var self = this;
    var orderId = this.data.orderId;
    if (!orderId) return Promise.resolve();

    return api.production
      .pendingBundles('pendingQc', orderId)
      .then(function (res) {
        var bundles = Array.isArray(res) ? res : (res && res.records ? res.records : []);
        bundles = bundles.map(function (b) {
          b.bundleNoShort = self._truncateBundleNo(b.bundleQrCode || b.bundleNo || b.cuttingBundleQrCode, b.orderNo || self.data.orderNo);
          // 多选用 key：优先 qrCode，缺省回退 bundleId
          b.selectKey = b.qrCode || b.bundleId || '';
          b.selected = false;
          return b;
        });
        self.setData({
          pendingBundles: bundles,
          selectedBundleQrs: [],
          selectedBundleTotalQty: 0,
          batchUnqualFormVisible: false,
        });
      })
      .catch(function (err) {
        console.warn('[QualityDetail] fetchPendingBundles failed:', err);
      });
  },

  _processQcRecord: function (r) {
    if (!r) return r;

    if (!r.operatorName && r.qualityOperatorName) r.operatorName = r.qualityOperatorName;
    if (!r.bundleNo && r.cuttingBundleNo) r.bundleNo = r.cuttingBundleNo;
    if (!r.bundleQrCode && r.cuttingBundleQrCode) r.bundleQrCode = r.cuttingBundleQrCode;
    if (!r.quantity && r.warehousingQuantity) r.quantity = r.warehousingQuantity;

    var statusKey = String(r.qualityStatus || '').trim().toLowerCase();
    var statusMap = QUALITY_STATUS_MAP[statusKey];
    var cat;
    if (!statusMap) {
      cat = getQualityCategory(r);
      if (cat === 'qualified') statusMap = QUALITY_STATUS_MAP.qualified;
      else if (cat === 'unqualified') statusMap = QUALITY_STATUS_MAP.unqualified;
      else if (cat === 'repaired') statusMap = QUALITY_STATUS_MAP.repaired;
      else statusMap = QUALITY_STATUS_MAP.pending;
    }
    r.qualityStatusText = statusMap.text;
    r.qualityStatusCls = statusMap.cls;
    r.qualityCategory = cat || getQualityCategory(r);

    r.defectCategoryText = DEFECT_CATEGORY_MAP[r.defectCategory] || r.defectCategory || '';

    // 菲号显示：订单号+菲号（与 PC 端 orderNo-bundleNo 对齐）
    r.bundleNoShort = this._truncateBundleNo(r.bundleQrCode || r.bundleNo || r.cuttingBundleQrCode, r.orderNo || this.data.orderNo);

    r.isHighlighted = !!this.data.warehousingNo &&
      String(r.warehousingNo || '').trim() === this.data.warehousingNo;

    // 判断是否可入库（已质检合格 + 有合格数 + 无仓库）
    r.canWarehouse = (r.qualityCategory === 'qualified' || r.qualityStatus === 'qualified')
      && Number(r.qualifiedQuantity || 0) > 0
      && !String(r.warehouse || '').trim();

    // 判断是否可标记返修
    r.canMarkRepaired = r.qualityCategory === 'unqualified'
      && String(r.repairStatus || '').trim() === '';

    if (r.scanTime || r.createTime) {
      r.displayTime = this._formatTime(r.scanTime || r.createTime);
    } else {
      r.displayTime = '';
    }

    r.imageList = [];
    if (r.unqualifiedImageUrls) {
      try {
        var urls = typeof r.unqualifiedImageUrls === 'string'
          ? JSON.parse(r.unqualifiedImageUrls)
          : r.unqualifiedImageUrls;
        if (Array.isArray(urls)) {
          r.imageList = urls.filter(Boolean).map(function (u) {
            return getAuthedImageUrl(u);
          });
        }
      } catch (_e) {
        r.imageList = [];
      }
    }

    return r;
  },

  _calcQcStats: function (records) {
    var total = 0;
    var qualified = 0;
    var unqualified = 0;
    var warehoused = 0;
    var pendingWarehouse = 0;

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      var wq = Number(r.warehousingQuantity || 0);
      var qq = Number(r.qualifiedQuantity || 0);
      var uq = Number(r.unqualifiedQuantity || 0);
      total += wq;
      qualified += qq;
      unqualified += uq;

      var qs = String(r.qualityStatus || '').trim().toLowerCase();
      var hasWarehouse = !!String(r.warehouse || '').trim();
      var isQualified = qs === 'qualified' || (!qs && qq > 0);

      if (isQualified && hasWarehouse) {
        warehoused += qq;
      } else if (isQualified && !hasWarehouse) {
        pendingWarehouse += qq;
      }
    }

    var passRate = '-';
    if (total > 0) {
      passRate = Math.round((qualified / total) * 100) + '%';
    }

    return {
      total: total,
      qualified: qualified,
      unqualified: unqualified,
      count: records.length,
      warehoused: warehoused,
      pendingWarehouse: pendingWarehouse,
      passRate: passRate,
    };
  },

  _formatTime: function (t) {
    if (!t) return '';
    var s = String(t).replace(/-/g, '/');
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(t);
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = d.getHours();
    var min = d.getMinutes();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day) +
      ' ' + (h < 10 ? '0' + h : h) + ':' + (min < 10 ? '0' + min : min);
  },

  _processLegacyDetail: function (legacy) {
    if (!legacy) return;
    this.setData({ detail: legacy });
  },

  /**
   * 菲号格式化：订单号+菲号（与 PC 端 orderNo-bundleNo 对齐）
   */
  _truncateBundleNo: function (qr, orderNo) {
    if (!qr) {
      if (orderNo) return orderNo + '-?';
      return '-';
    }
    var t = String(qr).split('|')[0].trim();
    if (!t) return '-';
    var parts = t.split('-');
    var bundleSeq = parts[parts.length - 1] || '';
    var ord = orderNo || parts[0] || '';
    if (ord && bundleSeq) {
      return ord + '-' + bundleSeq;
    }
    return parts.length > 3 ? parts.slice(-3).join('-') : t;
  },

  // ========== 菲号多选（页面内操作，与 PC 端 InspectionDetail 对齐） ==========

  /**
   * 切换单个菲号选中状态
   */
  onToggleBundle: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    var bundles = this.data.pendingBundles.slice();
    var idx = -1;
    for (var i = 0; i < bundles.length; i++) {
      if (bundles[i].selectKey === key) { idx = i; break; }
    }
    if (idx < 0) return;
    bundles[idx].selected = !bundles[idx].selected;
    this.setData({ pendingBundles: bundles });
    this._recomputeSelection();
  },

  /**
   * 全选
   */
  onSelectAllBundles: function () {
    var bundles = this.data.pendingBundles.slice();
    for (var i = 0; i < bundles.length; i++) bundles[i].selected = true;
    this.setData({ pendingBundles: bundles });
    this._recomputeSelection();
  },

  /**
   * 反选
   */
  onInvertBundles: function () {
    var bundles = this.data.pendingBundles.slice();
    for (var i = 0; i < bundles.length; i++) bundles[i].selected = !bundles[i].selected;
    this.setData({ pendingBundles: bundles });
    this._recomputeSelection();
  },

  /**
   * 清空选择
   */
  onClearBundles: function () {
    var bundles = this.data.pendingBundles.slice();
    for (var i = 0; i < bundles.length; i++) bundles[i].selected = false;
    this.setData({ pendingBundles: bundles });
    this._recomputeSelection();
  },

  /**
   * 重新计算已选菲号二维码列表与合计件数，并同步质检表单
   */
  _recomputeSelection: function () {
    var bundles = this.data.pendingBundles;
    var selected = [];
    var totalQty = 0;
    for (var i = 0; i < bundles.length; i++) {
      if (bundles[i].selected) {
        selected.push(bundles[i].selectKey);
        totalQty += Number(bundles[i].quantity || 0);
      }
    }
    this.setData({
      selectedBundleQrs: selected,
      selectedBundleTotalQty: totalQty,
      batchUnqualFormVisible: false,
    });
    this._syncQcSheetFromSelection();
  },

  /**
   * 已选数量为 1 时，把该菲号数据填充到质检表单；否则清空表单
   */
  _syncQcSheetFromSelection: function () {
    var bundles = this.data.pendingBundles;
    var selected = [];
    for (var i = 0; i < bundles.length; i++) {
      if (bundles[i].selected) selected.push(bundles[i]);
    }
    if (selected.length === 1) {
      var bundle = selected[0];
      var qty = Number(bundle.quantity || 0);
      this.setData({
        qcSheetData: {
          bundleId: bundle.bundleId || '',
          bundleNo: bundle.bundleNo || '',
          qrCode: bundle.qrCode || '',
          quantity: qty,
          qualifiedQty: qty,
          unqualifiedQty: 0,
          defectCategory: '',
          defectRemark: '',
          remark: '',
          imageUrls: [],
        },
      });
    } else {
      this.setData({
        qcSheetData: {
          bundleId: '', bundleNo: '', qrCode: '', quantity: 0,
          qualifiedQty: 0, unqualifiedQty: 0,
          defectCategory: '', defectRemark: '', remark: '', imageUrls: [],
        },
      });
    }
  },

  /**
   * 获取所有已选菲号对象
   */
  _getSelectedBundles: function () {
    var bundles = this.data.pendingBundles;
    var result = [];
    for (var i = 0; i < bundles.length; i++) {
      if (bundles[i].selected) result.push(bundles[i]);
    }
    return result;
  },

  // ========== 页面内质检表单（单选时显示，原弹窗内容移至此） ==========

  onQcQualifiedQtyChange: function (e) {
    var val = Number(e.detail.value || 0);
    var total = Number(this.data.qcSheetData.quantity || 0);
    if (val < 0) val = 0;
    if (val > total) val = total;
    var unqualified = total - val;
    this.setData({
      'qcSheetData.qualifiedQty': val,
      'qcSheetData.unqualifiedQty': unqualified,
    });
  },

  onQcUnqualifiedQtyChange: function (e) {
    var val = Number(e.detail.value || 0);
    var total = Number(this.data.qcSheetData.quantity || 0);
    if (val < 0) val = 0;
    if (val > total) val = total;
    var qualified = total - val;
    this.setData({
      'qcSheetData.unqualifiedQty': val,
      'qcSheetData.qualifiedQty': qualified,
    });
  },

  onDefectCategoryChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.defectCategoryOptions[index];
    this.setData({ 'qcSheetData.defectCategory': opt ? opt.value : '' });
  },

  onDefectRemarkChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.defectRemarkOptions[index];
    this.setData({ 'qcSheetData.defectRemark': opt ? opt.value : '' });
  },

  onQcRemarkInput: function (e) {
    this.setData({ 'qcSheetData.remark': e.detail.value || '' });
  },

  onQcImageAdd: function () {
    var self = this;
    var current = this.data.qcSheetData.imageUrls || [];
    if (current.length >= 5) {
      toast.info('最多上传 5 张照片');
      return;
    }
    wx.chooseMedia({
      count: 5 - current.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var newUrls = res.tempFiles.map(function (f) { return f.tempFilePath; });
        self.setData({
          'qcSheetData.imageUrls': current.concat(newUrls),
        });
      },
    });
  },

  onQcImageRemove: function (e) {
    var index = e.currentTarget.dataset.index;
    var urls = this.data.qcSheetData.imageUrls.slice();
    urls.splice(index, 1);
    this.setData({ 'qcSheetData.imageUrls': urls });
  },

  onQcImagePreview: function (e) {
    var url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.qcSheetData.imageUrls,
    });
  },

  /**
   * 提交质检（与 PC 端 useWarehousingSubmit.handleSubmit 对齐）
   * POST /api/production/warehousing
   */
  onSubmitQc: function () {
    var self = this;
    if (this.data.submitting) return;

    var d = this.data.qcSheetData;
    if (!d.bundleId) {
      toast.error('菲号信息缺失');
      return;
    }

    var unqualifiedQty = Number(d.unqualifiedQty || 0);
    var qualifiedQty = Number(d.qualifiedQty || 0);

    if (unqualifiedQty > 0) {
      if (!d.defectCategory) {
        toast.error('请选择缺陷类别');
        return;
      }
      if (!d.defectRemark) {
        toast.error('请选择处理方式');
        return;
      }
    }

    var userInfo = getUserInfo() || {};
    var payload = {
      orderId: this.data.orderId,
      cuttingBundleId: d.bundleId,
      cuttingBundleQrCode: d.qrCode,
      warehousingQuantity: d.quantity,
      qualifiedQuantity: qualifiedQty,
      unqualifiedQuantity: unqualifiedQty,
      qualityStatus: unqualifiedQty > 0 ? 'unqualified' : 'qualified',
      warehousingType: 'manual',
      operatorName: userInfo.name || userInfo.username || '',
    };

    if (unqualifiedQty > 0) {
      payload.defectCategory = d.defectCategory;
      payload.defectRemark = d.defectRemark;
      if (d.remark) payload.remark = d.remark;
      if (d.imageUrls && d.imageUrls.length > 0) {
        payload.unqualifiedImageUrls = JSON.stringify(d.imageUrls);
      }
    }

    this.setData({ submitting: true });
    api.production
      .saveWarehousing(payload)
      .then(function () {
        toast.success('质检已提交');
        self.setData({ submitting: false });
        self.fetchQcRecords();
        self.fetchPendingBundles();
        self.fetchBriefing();
        eventBus.emit(Events.DATA_CHANGED, { type: 'quality' });
      })
      .catch(function (err) {
        console.error('[QualityDetail] submitQc failed:', err);
        self.setData({ submitting: false });
        wx.showModal({
          title: '提交失败',
          content: err.message || err.errMsg || '请稍后重试',
          showCancel: false,
          confirmText: '知道了',
        });
      });
  },

  // ========== 批量质检（多选时显示） ==========

  /**
   * 批量合格质检（与 PC 端 handleBatchQualifiedSubmit 对齐）
   * POST /api/production/warehousing/batch
   */
  onBatchQualified: function () {
    var self = this;
    if (this.data.submitting) return;
    var selected = this._getSelectedBundles();
    if (selected.length === 0) {
      toast.info('请先选择菲号');
      return;
    }
    var items = [];
    for (var i = 0; i < selected.length; i++) {
      var qty = Number(selected[i].quantity || 0);
      if (qty > 0 && selected[i].qrCode) {
        items.push({ cuttingBundleQrCode: selected[i].qrCode, warehousingQuantity: qty });
      }
    }
    if (items.length === 0) {
      toast.error('没有可批量提交的菲号');
      return;
    }
    wx.showModal({
      title: '批量合格质检',
      content: '确认对 ' + items.length + ' 个菲号执行批量合格质检？',
      confirmText: '确认',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        self.setData({ submitting: true });
        api.production
          .batchSaveWarehousing({
            orderId: self.data.orderId,
            warehousingType: 'manual',
            items: items,
          })
          .then(function () {
            toast.success('批量合格质检成功');
            self.setData({ submitting: false });
            self.fetchQcRecords();
            self.fetchPendingBundles();
            self.fetchBriefing();
            eventBus.emit(Events.DATA_CHANGED, { type: 'quality' });
          })
          .catch(function (err) {
            console.error('[QualityDetail] batchQualified failed:', err);
            self.setData({ submitting: false });
            wx.showModal({
              title: '批量合格失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  /**
   * 批量不合格质检：展开内联缺陷/处理方式表单
   * 小程序无 batch-unqualified 接口，确认后循环调用单个 saveWarehousing
   */
  onBatchUnqualified: function () {
    var selected = this._getSelectedBundles();
    if (selected.length === 0) {
      toast.info('请先选择菲号');
      return;
    }
    this.setData({
      batchUnqualFormVisible: true,
      batchUnqualData: { defectCategory: '', defectRemark: '' },
    });
  },

  onBatchUnqualDefectCategoryChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.defectCategoryOptions[index];
    this.setData({ 'batchUnqualData.defectCategory': opt ? opt.value : '' });
  },

  onBatchUnqualDefectRemarkChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.defectRemarkOptions[index];
    this.setData({ 'batchUnqualData.defectRemark': opt ? opt.value : '' });
  },

  onCancelBatchUnqualified: function () {
    this.setData({ batchUnqualFormVisible: false });
  },

  /**
   * 确认批量不合格质检（循环调用 saveWarehousing，与 PC 端 handleBatchUnqualifiedSubmit 语义对齐）
   */
  onConfirmBatchUnqualified: function () {
    var self = this;
    if (this.data.submitting) return;
    var d = this.data.batchUnqualData;
    if (!d.defectCategory) { toast.error('请选择缺陷类别'); return; }
    if (!d.defectRemark) { toast.error('请选择处理方式'); return; }
    var selected = this._getSelectedBundles();
    if (selected.length === 0) return;
    var userInfo = getUserInfo() || {};
    var operatorName = userInfo.name || userInfo.username || '';

    var tasks = [];
    for (var i = 0; i < selected.length; i++) {
      var b = selected[i];
      var qty = Number(b.quantity || 0);
      if (qty <= 0 || !b.qrCode) continue;
      tasks.push({
        orderId: this.data.orderId,
        cuttingBundleId: b.bundleId,
        cuttingBundleQrCode: b.qrCode,
        warehousingQuantity: qty,
        qualifiedQuantity: 0,
        unqualifiedQuantity: qty,
        qualityStatus: 'unqualified',
        warehousingType: 'manual',
        operatorName: operatorName,
        defectCategory: d.defectCategory,
        defectRemark: d.defectRemark,
      });
    }
    if (tasks.length === 0) {
      toast.error('没有可批量提交的菲号');
      return;
    }
    this.setData({ submitting: true });
    var promises = tasks.map(function (p) {
      return api.production.saveWarehousing(p);
    });
    Promise.all(promises)
      .then(function () {
        toast.success('批量不合格质检成功');
        self.setData({ submitting: false, batchUnqualFormVisible: false });
        self.fetchQcRecords();
        self.fetchPendingBundles();
        self.fetchBriefing();
        eventBus.emit(Events.DATA_CHANGED, { type: 'quality' });
      })
      .catch(function (err) {
        console.error('[QualityDetail] batchUnqualified failed:', err);
        self.setData({ submitting: false });
        wx.showModal({
          title: '批量不合格失败',
          content: err.message || err.errMsg || '请稍后重试',
          showCancel: false,
          confirmText: '知道了',
        });
      });
  },

  // ========== 页面内入库表单（记录下方展开，原弹窗内容移至此） ==========

  /**
   * 点击"入库"按钮：在记录下方展开/收起入库表单（原 onOpenWhSheet，改为页面内切换）
   */
  onOpenWhSheet: function (e) {
    var index = e.currentTarget.dataset.index;
    var record = this.data.qcRecords[index];
    if (!record) return;

    // 再次点击同一条：收起
    if (this.data.whExpandIndex === index) {
      this.setData({ whExpandIndex: -1 });
      return;
    }

    this.setData({
      whExpandIndex: index,
      whSheetData: {
        recordId: record.id,
        warehousingNo: record.warehousingNo || '',
        qualifiedQty: Number(record.qualifiedQuantity || 0),
        bundleNo: record.bundleNo || '',
        warehouseAreaId: '',
        warehouseAreaName: '',
        warehouseLocationCode: '',
      },
      locationOptions: [],
    });

    this._loadWarehouseOptions();
  },

  _loadWarehouseOptions: function () {
    var self = this;
    if (this.data.warehouseOptions.length > 0) return;

    api.warehouse
      .listWarehouseAreas('FINISHED')
      .then(function (res) {
        var list = Array.isArray(res) ? res : (res && res.records ? res.records : []);
        var options = list.map(function (item) {
          return {
            id: item.id,
            name: item.areaName || item.name || item.warehouseName || '-',
            code: item.areaCode || item.code || '',
          };
        });
        self.setData({ warehouseOptions: options });
        self._warehouseAreaMap = {};
        options.forEach(function (opt) {
          self._warehouseAreaMap[opt.id] = opt;
        });
      })
      .catch(function (err) {
        console.warn('[QualityDetail] loadWarehouseOptions failed:', err);
      });
  },

  onWarehouseChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.warehouseOptions[index];
    if (!opt) return;

    this.setData({
      'whSheetData.warehouseAreaId': opt.id,
      'whSheetData.warehouseAreaName': opt.name,
      'whSheetData.warehouseLocationCode': '',
      locationOptions: [],
    });

    this._loadLocationOptions(opt.id);
  },

  _loadLocationOptions: function (areaId) {
    var self = this;
    if (!areaId) return;

    api.warehouse
      .listLocations('FINISHED', areaId)
      .then(function (res) {
        var list = Array.isArray(res) ? res : (res && res.records ? res.records : []);
        var options = list.map(function (item) {
          return {
            code: item.locationCode || item.code || '',
            name: item.locationName || item.name || item.locationCode || '-',
          };
        });
        self.setData({ locationOptions: options });
      })
      .catch(function (err) {
        console.warn('[QualityDetail] loadLocationOptions failed:', err);
      });
  },

  onLocationChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.locationOptions[index];
    if (!opt) return;
    this.setData({ 'whSheetData.warehouseLocationCode': opt.code });
  },

  /**
   * 提交入库（与 PC 端 handleWarehouseSubmit 对齐）
   * PUT /api/production/warehousing
   * body: { id, warehouse, warehouseAreaId }
   */
  onSubmitWarehouse: function () {
    var self = this;
    if (this.data.submitting) return;

    var d = this.data.whSheetData;
    if (!d.recordId) {
      toast.error('记录ID缺失');
      return;
    }
    if (!d.warehouseAreaId) {
      toast.error('请选择仓库');
      return;
    }
    if (!d.warehouseLocationCode) {
      toast.error('请选择库位');
      return;
    }

    var payload = {
      id: d.recordId,
      warehouse: d.warehouseLocationCode,
      warehouseAreaId: d.warehouseAreaId,
    };

    this.setData({ submitting: true });
    api.production
      .updateWarehousing(payload)
      .then(function () {
        toast.success('入库成功');
        self.setData({ submitting: false, whExpandIndex: -1 });
        self.fetchQcRecords();
        self.fetchBriefing();
        eventBus.emit(Events.DATA_CHANGED, { type: 'warehouse' });
      })
      .catch(function (err) {
        console.error('[QualityDetail] submitWarehouse failed:', err);
        self.setData({ submitting: false });
        wx.showModal({
          title: '入库失败',
          content: err.message || err.errMsg || '请稍后重试',
          showCancel: false,
          confirmText: '知道了',
        });
      });
  },

  // ========== 返修 / 报废 ==========

  /**
   * 标记开始返修
   */
  onStartRepair: function (e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var record = this.data.qcRecords[index];
    if (!record) return;

    var bundleId = record.cuttingBundleId || record.bundleId;
    if (!bundleId) {
      toast.error('菲号信息缺失');
      return;
    }

    wx.showModal({
      title: '开始返修',
      content: '确认菲号 ' + (record.bundleNoShort || record.bundleNo || '') + ' 开始返修？',
      confirmText: '确认',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        var userInfo = getUserInfo() || {};
        api.production
          .startBundleRepair(bundleId, userInfo.name || userInfo.username || '')
          .then(function () {
            toast.success('已开始返修');
            self.fetchQcRecords();
            eventBus.emit(Events.DATA_CHANGED, { type: 'repair' });
          })
          .catch(function (err) {
            wx.showModal({
              title: '操作失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  /**
   * 标记返修完成
   */
  onCompleteRepair: function (e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var record = this.data.qcRecords[index];
    if (!record) return;

    var bundleId = record.cuttingBundleId || record.bundleId;
    if (!bundleId) return;

    wx.showModal({
      title: '返修完成',
      content: '确认菲号 ' + (record.bundleNoShort || record.bundleNo || '') + ' 返修完成？',
      confirmText: '确认完成',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.production
          .completeBundleRepair(bundleId)
          .then(function () {
            toast.success('返修已完成');
            self.fetchQcRecords();
            eventBus.emit(Events.DATA_CHANGED, { type: 'repair' });
          })
          .catch(function (err) {
            wx.showModal({
              title: '操作失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  /**
   * 报废
   */
  onScrap: function (e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var record = this.data.qcRecords[index];
    if (!record) return;

    var bundleId = record.cuttingBundleId || record.bundleId;
    if (!bundleId) return;

    wx.showModal({
      title: '报废确认',
      content: '确认报废菲号 ' + (record.bundleNoShort || record.bundleNo || '') + '？此操作不可撤销。',
      confirmText: '确认报废',
      confirmColor: '#ff3b30',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.production
          .scrapBundle(bundleId)
          .then(function () {
            toast.success('已报废');
            self.fetchQcRecords();
            eventBus.emit(Events.DATA_CHANGED, { type: 'scrap' });
          })
          .catch(function (err) {
            wx.showModal({
              title: '操作失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  // ========== 图片预览 ==========

  onPreviewImage: function (e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls || [url];
    wx.previewImage({
      current: url,
      urls: urls,
    });
  },

  // ========== 折叠 / 滚动跳转 ==========

  onToggleAi: function () {
    this.setData({ aiCollapsed: !this.data.aiCollapsed });
  },

  onToggleBom: function () {
    this.setData({ bomCollapsed: !this.data.bomCollapsed });
  },

  /**
   * 滚动到待质检菲号区块
   */
  onScrollToPending: function () {
    if (this.data.pendingBundles.length === 0) {
      toast.info('暂无待质检菲号');
      return;
    }
    var query = wx.createSelectorQuery();
    query.select('.section-pending').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec(function (res) {
      if (res && res[0] && res[1]) {
        wx.pageScrollTo({
          scrollTop: res[0].top + res[1].scrollTop - 20,
          duration: 300,
        });
      }
    });
  },

  /**
   * 滚动到质检记录区块
   */
  onScrollToRecords: function () {
    if (this.data.qcStats.pendingWarehouse === 0) {
      toast.info('暂无待入库记录');
      return;
    }
    var query = wx.createSelectorQuery();
    query.select('.section-records').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec(function (res) {
      if (res && res[0] && res[1]) {
        wx.pageScrollTo({
          scrollTop: res[0].top + res[1].scrollTop - 20,
          duration: 300,
        });
      }
    });
  },

  // ========== WebSocket ==========

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    var self = this;
    this._onDataChanged = function () {
      self.fetchQcRecords();
      self.fetchPendingBundles();
    };
    this._onScanSuccess = function () {
      self.fetchQcRecords();
      self.fetchPendingBundles();
    };
    this._onRefreshAll = function () {
      self.fetchBriefing();
      self.fetchQcRecords();
      self.fetchPendingBundles();
      self.fetchAiSuggestion();
    };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.SCAN_SUCCESS, this._onScanSuccess);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents: function () {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onScanSuccess) eventBus.off(Events.SCAN_SUCCESS, this._onScanSuccess);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },
});
