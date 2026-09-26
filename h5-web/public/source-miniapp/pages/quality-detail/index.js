const i18n = require('../../utils/i18n/index');
const NS = 'mp.qualityDetail.';
const api = require('../../utils/api');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const { eventBus, Events } = require('../../utils/eventBus');
const { getUserInfo } = require('../../utils/storage');
const qualityHelper = require('../../utils/quality-helper');
const { calcDeliveryInfo } = require('../../utils/deliveryHelper');
const { QUALITY_STATUS_LABEL } = require('../../utils/displayHelper');
const { splitStyleOptions } = require('../../utils/styleOptions');
const { sortSizeNames } = require('../../utils/sizeUtils');

const getQualityCategory = qualityHelper.getQualityCategory;
const DEFECT_CATEGORY_MAP = qualityHelper.DEFECT_CATEGORY_MAP;

/**
 * 缺陷类别（与 PC 端 DEFECT_CATEGORY_KEYS 对齐）
 */
// 缺陷类别：value 是载荷英文码，label 走 i18n（applyLanguage 里重建）
const DEFECT_CATEGORY_KEYS = [
  { value: 'appearance_integrity', nameKey: 'catAppearance' },
  { value: 'size_accuracy', nameKey: 'catSize' },
  { value: 'process_compliance', nameKey: 'catProcess' },
  { value: 'functional_effectiveness', nameKey: 'catFunction' },
  { value: 'other', nameKey: 'mp.stageDetail.otherWord' },
];

/**
 * 处理方式（与 PC 端 DEFECT_REMARK_OPTIONS 对齐）
 */
// ⚠️ value 是后端载荷（defectRemark）保持中文；label 走 i18n（applyLanguage 重建）
const DEFECT_REMARK_OPTIONS = [
  { value: '返修', nameKey: 'mp.defect.handleRepair' },
  { value: '报废', nameKey: 'mp.defect.handleScrap' },
];

// 质检状态 CSS 类映射（displayHelper 提供 text，cls 本地维护与 PC 端对齐）
const QUALITY_STATUS_CLS = {
  qualified: 'status-success',
  unqualified: 'status-error',
  repaired: 'status-warning',
  pending: 'status-info',
  checking: 'status-processing',
};

// 本地兜底：displayHelper.QUALITY_STATUS_LABEL 未覆盖的质检状态文案
const LOCAL_QUALITY_STATUS_FALLBACK = {
  // displayHelper 已覆盖全部已知质检状态（qualified/unqualified/repaired/pending/checking），暂无需兜底
};

/**
 * 质检状态映射（与 PC 端 getQualityStatusConfig 对齐）
 * text 优先取 displayHelper.QUALITY_STATUS_LABEL，本地兜底未覆盖值
 * cls 本地维护（displayHelper 用 color 变量，小程序用 CSS 类名）
 */
const QUALITY_STATUS_MAP = (function () {
  var map = {};
  Object.keys(QUALITY_STATUS_LABEL).forEach(function (key) {
    map[key] = { text: QUALITY_STATUS_LABEL[key], cls: QUALITY_STATUS_CLS[key] || 'status-info' };
  });
  Object.keys(LOCAL_QUALITY_STATUS_FALLBACK).forEach(function (key) {
    if (!map[key]) {
      map[key] = { text: LOCAL_QUALITY_STATUS_FALLBACK[key], cls: QUALITY_STATUS_CLS[key] || 'status-info' };
    }
  });
  return map;
})();

const MATERIAL_TYPE_MAP = {
  fabric: 'matFabricW',
  accessory: 'matAuxW',
  lining: 'matLiningW',
  other: 'mp.stageDetail.otherWord',
};

Page({
  data: {
    orderId: '',
    warehousingNo: '',
    // 质检明细 / 尺寸表 双 tab（尺寸表布局对齐样衣开发详情页）
    activeTab: 'qc',
    styleId: '',
    sizeColumns: [],
    sizeRows: [],
    sizeLoading: false,
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
    // D-517：菲号搜索（渲染用过滤结果，选中状态仍写回 pendingBundles）
    bundleSearchKey: '',
    filteredPendingBundles: [],
    // 仓库选项
    warehouseOptions: [],
    locationOptions: [],
    // D-517：可搜索选择器（库位量大，chip 平铺改可搜索弹层）
    pickerVisible: false, pickerKey: '', pickerTitle: '', pickerOptions: [], pickerValue: '',
    // 页面内质检表单（单选时显示，原弹窗内容）
    qcSheetData: {
      bundleId: '',
      bundleNo: '',
      qrCode: '',
      quantity: 0,
      qualifiedQty: 0,
      unqualifiedQty: 0,
      defectCategory: '',
      defectCategoryLabel: '',
      defectRemark: '',
      remark: '',
      imageUrls: [],
    },
    defectCategoryOptions: [],  // applyLanguage 重建
    defectRemarkOptions: [],  // applyLanguage 重建
    // 已选菲号二维码列表（多选）
    selectedBundleQrs: [],
    selectedBundleTotalQty: 0,
    // 批量不合格表单（多选时显示）
    batchUnqualFormVisible: false,
    batchUnqualData: {
      defectCategory: '',
      defectCategoryLabel: '',
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

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），缺陷类别选项数组重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        bundleWord: i18n.t('mp.scanResult.bundleWord', lang),
        defectCategory: i18n.t('mp.scanQuality.defectCategory', lang),
        handleMethod: i18n.t('mp.scanQuality.handleMethod', lang),
        cancel: i18n.t('common.cancel', lang),
        colorLabel: i18n.t('common.color', lang),
        sizeLabel: i18n.t('common.size', lang),
        qtyLabel: i18n.t('common.quantity', lang),
        deliveryLabel: i18n.t('mp.scanResult.deliveryLabel', lang),
        sizeTableTitle: i18n.t('mp.sampleDetail.tabSize', lang),
        qcPersonLabel: i18n.t(NS + 'qcPersonLabel', lang),
        qcTimeLabel: i18n.t(NS + 'qcTimeLabel', lang),
        remarkLabel: i18n.t('common.remark', lang),
        passQtyLabel: i18n.t(NS + 'passQtyLabel', lang),
        batchFailBtn: i18n.t(NS + 'batchFailBtn', lang),
        inboundNoLabel: i18n.t(NS + 'inboundNoLabel', lang),
        qcTitle: i18n.t('mp.defect.navTitleX', lang),
        pass: i18n.t('common.pass', lang),
        fail: i18n.t('common.fail', lang),
        merchLabel: i18n.t(NS + 'merchLabel', lang),
        producerLabel: i18n.t(NS + 'producerLabel', lang),
        styleNameLabel: i18n.t(NS + 'styleNameLabel', lang),
        qcInfoTitle: i18n.t(NS + 'qcInfoTitle', lang),
        scanModeLabel: i18n.t(NS + 'scanModeLabel', lang),
        processWord: i18n.t('mp.pattern.processWord', lang),
        defectPhotos: i18n.t('mp.scanQuality.defectPhotos', lang),
        pendingQcTab: i18n.t(NS + 'pendingQcTab', lang),
        startQcHint: i18n.t(NS + 'startQcHint', lang),
        noPendingTab: i18n.t(NS + 'noPendingTab', lang),
        pendingInboundTab: i18n.t(NS + 'pendingInboundTab', lang),
        goInboundHint: i18n.t(NS + 'goInboundHint', lang),
        noInboundTab: i18n.t(NS + 'noInboundTab', lang),
        passRateLabel: i18n.t('mp.defect.passRate', lang),
        pendingQcBundles: i18n.t(NS + 'pendingQcTab', lang),
        selectAll: i18n.t('common.selectAll', lang),
        invertSel: i18n.t(NS + 'invertSelW', lang),
        clearText: i18n.t('common.clear', lang),
        qualityEntry: i18n.t('mp.scanResult.qualityEntry', lang),
        qrWord: i18n.t(NS + 'qrWord', lang),
        qcTotalLabel: i18n.t(NS + 'qcTotalLabel', lang),
        defectQtyLabel: i18n.t(NS + 'defectQtyLabel', lang),
        remarkOptional: i18n.t(NS + 'remarkOptional', lang),
        photoOptionalHint: i18n.t(NS + 'photoOptionalHint', lang),
        addPhoto: i18n.t(NS + 'addPhoto', lang),
        submitQc: i18n.t('mp.scanQuality.submitQuality', lang),
        qcRecordsTitle: i18n.t(NS + 'qcRecordsTitle', lang),
        noRecordsW: i18n.t(NS + 'noRecordsW', lang),
        noQcRecordsW: i18n.t(NS + 'noQcRecordsW', lang),
        currentWord: i18n.t(NS + 'currentWord', lang),
        startRepairBtn: i18n.t('mp.defect.repairStart', lang),
        finishRepairBtn: i18n.t(NS + 'finishRepairBtn', lang),
        scrapBtn: i18n.t('mp.defect.scrapBtn', lang),
        orderClosed: i18n.t('mp.defect.orderClosed', lang),
        colorSizeLabel: i18n.t(NS + 'colorSizeLabel', lang),
        warehouseLabel: i18n.t('mp.scanResult.warehousePrefix', lang).replace(':', ''),
        inboundOpTitle: i18n.t(NS + 'inboundOpTitle', lang),
        selectWhPrefix: i18n.t(NS + 'selectWhPrefix', lang),
        noWhAvailable: i18n.t(NS + 'noWhAvailable', lang),
        noLocationInWh: i18n.t(NS + 'noLocationInWh', lang),
        confirmInbound: i18n.t(NS + 'confirmInbound', lang),
        aiAssistantTitle: i18n.t(NS + 'aiAssistantTitle', lang),
        aiAnalyzing: i18n.t(NS + 'aiAnalyzing', lang),
        histDefectRate: i18n.t(NS + 'histDefectRate', lang),
        riskLevelLabel: i18n.t(NS + 'riskLevelLabel', lang),
        qcPointsLabel: i18n.t(NS + 'qcPointsLabel', lang),
        defectSuggestion: i18n.t(NS + 'defectSuggestion', lang),
        tabBom: i18n.t('mp.sampleDetail.tabBom', lang),
        partHeader: i18n.t('mp.sampleDetail.partHeader', lang),
        noSizeHint: i18n.t('mp.sampleDetail.noSizeHint', lang),
        submitting: i18n.t('common.submitting', lang),
        checkedWord: i18n.t(NS + 'checkedWord', lang),
        checkedTimesW: i18n.t(NS + 'checkedTimesW', lang),
        searchBundlePhW: i18n.t(NS + 'searchBundlePhW', lang),
        cuttingLabelW: i18n.t(NS + 'cuttingLabelW', lang),
        qcLabelW: i18n.t(NS + 'qcLabelW', lang),
        remarkPhW: i18n.t(NS + 'remarkPhW', lang),
        usageLabelW: i18n.t(NS + 'usageLabelW', lang),
        lossLabelW: i18n.t(NS + 'lossLabelW', lang),
        collapseTextW: i18n.t('mp.sampleDev.collapseText', lang),
        expandTextW: i18n.t('mp.sampleDev.expandText', lang),
        scanModePiece: i18n.t(NS + 'scanModePieceW', lang),
        qcBeforePack: i18n.t(NS + 'qcBeforePackW', lang),
        noBundleMatch: i18n.t(NS + 'noSampleMatchX', lang),
        noPendingQcW: i18n.t(NS + 'noPendingQc', lang),
        selectDefectCatW: i18n.t(NS + 'selectDefectCat', lang),
        selectHandleMW: i18n.t(NS + 'selectHandleM', lang),
        batchFailTitleW: i18n.t(NS + 'batchFailTitle', lang),
        inboundBtnW: i18n.t('mp.pattern.submitWhIn', lang),
        pickLocationW: i18n.t(NS + 'pickLocation', lang),
        expandTextC: i18n.t('mp.sampleDev.expandText', lang),
        pieceUnit: i18n.t('common.piece', lang),
      },
      defectCategoryOptions: DEFECT_CATEGORY_KEYS.map(function (c) {
        return { value: c.value, label: i18n.t(c.nameKey.indexOf('.') >= 0 ? c.nameKey : NS + c.nameKey, lang) };
      }),
      defectRemarkOptions: DEFECT_REMARK_OPTIONS.map(function (c) {
        return { value: c.value, label: i18n.t(c.nameKey, lang) };
      }),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
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
      toast.error(i18n.t('mp.sampleDetail.missingStyleId', this._lang));
      this.setData({ loading: false });
      return;
    }

    this.setData({ orderId: orderId, warehousingNo: warehousingNo });
    this.fetchBriefing();
    this.fetchQcRecords();
    this.fetchPendingBundles();
    this.fetchAiSuggestion();
    this._bindWsEvents();

    // 隐私授权弹窗监听（拍照/选图需隐私授权），与 scan/quality 页面保持一致
    var self = this;
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', function (resolve) {
        try {
          var dialog = self.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_e) { /* 静默 */ }
      });
    }
  },

  onUnload: function () {
    this._unbindWsEvents();
    if (this._unsubPrivacy) { this._unsubPrivacy(); this._unsubPrivacy = null; }
  },

  onPullDownRefresh: function () {
    var self = this;
    Promise.all([
      this.fetchBriefing(),
      this.fetchQcRecords(),
      this.fetchPendingBundles(),
      this.fetchAiSuggestion(),
    ]).finally(function () {
      // 尺寸表随 briefing 的 styleId 一起刷新（fetchBriefing 内部已触发）
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 获取质检简报
   */
  fetchBriefing: function () {
    var self = this;
    var lang = self._lang || i18n.getLanguage();
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

        // 订单终态判断：已关单/已完成/已取消/已报废/已归档 → 不再显示返修/报废按钮
        var _orderStatus = String(order.status || '').trim().toLowerCase();
        order.orderTerminal = (_orderStatus === 'closed' || _orderStatus === 'completed'
          || _orderStatus === 'cancelled' || _orderStatus === 'scrapped' || _orderStatus === 'archived');

        var styleCover = '';
        if (style && style.cover) {
          styleCover = getAuthedImageUrl(style.cover);
        } else if (order.styleCover) {
          styleCover = getAuthedImageUrl(order.styleCover);
        }

        // 款式ID：尺寸表 tab 用（briefing.style.styleId，后端 buildStyleInfo 已补齐）
        var styleId = (style && (style.styleId || style.id)) || order.styleId || '';

        bom = bom.map(function (b) {
          var mtKey = MATERIAL_TYPE_MAP[b.materialType];
          b.materialTypeText = mtKey ? i18n.t(mtKey.indexOf('.') >= 0 ? mtKey : NS + mtKey, lang) : (b.materialType || '-');
          return b;
        });

        self.setData({
          briefing: briefing,
          order: order,
          style: style,
          bom: bom,
          styleCover: styleCover,
          styleId: styleId,
          loading: false,
        });

        // 尺寸表加载（styleId 就绪后异步拉取，不阻塞主流程）
        if (styleId) {
          self.fetchSizeTable(styleId);
        }
      })
      .catch(function (err) {
        console.error('[QualityDetail] fetchBriefing failed:', err);
        if (self.data.detail) {
          self.setData({ loading: false });
        } else {
          self.setData({ loading: false });
          toast.error(i18n.t(NS + 'briefLoadFailed', this._lang));
        }
      });
  },

  /**
   * 尺寸表 tab 切换
   */
  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key });
  },

  /**
   * 加载款式尺寸表（与样衣开发详情页同接口 /api/style/size/list）
   * 透视后：sizeColumns=尺码列，sizeRows=部位行（横向：部位为行，尺码为列）
   */
  fetchSizeTable: function (styleId) {
    var self = this;
    var sid = String(styleId || '').trim();
    if (!sid) {
      self.setData({ sizeLoading: false });
      return Promise.resolve();
    }
    self.setData({ sizeLoading: true });
    return api.style
      .listSizes({ styleId: sid })
      .then(function (res) {
        var list = (res && (res.data || res.records)) || res || [];
        if (!Array.isArray(list)) list = [];
        var table = self._pivotSizeTable(list);
        self.setData({
          sizeColumns: table.columns,
          sizeRows: table.rows,
          sizeLoading: false,
        });
      })
      .catch(function (err) {
        console.error('[QualityDetail] fetchSizeTable failed:', err);
        self.setData({ sizeLoading: false });
      });
  },

  /**
   * 尺寸表透视：把 [{partName, sizeName, standardValue}] 转成行=部位、列=尺码
   * 与样衣开发详情页 _pivotSizeTable 同口径：
   *  1. 合并尺码必须先展开成原子尺码（"S/M" → ["S","M"]），复用 utils/styleOptions.js splitStyleOptions
   *  2. 排序复用 utils/sizeUtils.js sortSizeNames，与下单页/列表页同一口径
   */
  _pivotSizeTable: function (rawList) {
    if (!rawList || rawList.length === 0) {
      return { columns: [], rows: [] };
    }

    // 1) 展开合并尺码 → 原子尺码
    var normalized = [];
    rawList.forEach(function (item) {
      var rawSize = String(item.sizeName || item.baseSize || '').trim();
      var atomic = splitStyleOptions(rawSize);
      var list = atomic.length ? atomic : (rawSize ? [rawSize] : []);
      list.forEach(function (sn) {
        normalized.push({
          partName: item.partName || '',
          sizeName: sn,
          value: item.standardValue,
          tolerance: item.tolerance,
        });
      });
    });

    // 2) 尺码列（去重 + 统一排序）
    var seen = {};
    var sizeSet = [];
    normalized.forEach(function (item) {
      if (item.sizeName && !seen[item.sizeName]) {
        seen[item.sizeName] = true;
        sizeSet.push(item.sizeName);
      }
    });
    var columns = sortSizeNames(sizeSet);

    // 3) 部位行（去重，保持首次出现顺序）
    var partList = [];
    var partSeen = {};
    normalized.forEach(function (item) {
      var p = item.partName;
      if (p && !partSeen[p]) {
        partSeen[p] = true;
        partList.push(p);
      }
    });

    // 4) partName + sizeName → 值（注意 0 是合法值，不能用 || 判空）
    var lookup = {};
    normalized.forEach(function (item) {
      var v = item.value;
      var text = (v !== null && v !== undefined && v !== '') ? v : (item.tolerance || '-');
      lookup[item.partName + '|' + item.sizeName] = text;
    });

    var rows = partList.map(function (part) {
      var values = {};
      columns.forEach(function (size) {
        var v = lookup[part + '|' + size];
        values[size] = (v === null || v === undefined || v === '') ? '-' : v;
      });
      return { partName: part, values: values };
    });

    return { columns: columns, rows: rows };
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
          verdictText = i18n.t(NS + 'verdictGood', this._lang);
          verdictCls = 'verdict-good';
        } else if (historicalVerdict === 'warn') {
          verdictText = i18n.t(NS + 'verdictWarn', this._lang);
          verdictCls = 'verdict-warn';
        } else if (historicalVerdict === 'critical') {
          verdictText = i18n.t(NS + 'verdictCritical', this._lang);
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
        toast.error(i18n.t(NS + 'recordsLoadFailed', this._lang));
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
          // 菲号显示带床号，区分同扎号不同床的重复菲号
          b.bundleNoShort = self._truncateBundleNo(b.bundleQrCode || b.bundleNo || b.cuttingBundleQrCode, b.orderNo || self.data.orderNo, b.bedNo, b.bedSubNo);
          // 多选用 key：优先 qrCode，缺省回退 bundleId
          b.selectKey = b.qrCode || b.bundleId || '';
          b.selected = false;
          return b;
        });
        self.setData({
          pendingBundles: bundles,
          // D-517：同步过滤结果（新数据默认无关键字 → 全量）
          filteredPendingBundles: bundles,
          bundleSearchKey: '',
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

    // 菲号显示：订单号+菲号+床号（与 PC 端 orderNo-bundleNo 对齐，带床号区分同扎号不同床）
    r.bundleNoShort = this._truncateBundleNo(r.bundleQrCode || r.bundleNo || r.cuttingBundleQrCode, r.orderNo || this.data.orderNo, r.bedNo, r.bedSubNo);

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
   * 菲号格式化：订单号+菲号+床号（与 PC 端 orderNo-bundleNo 对齐）
   * 床号（bedNo/bedSubNo）用于区分同一扎号在不同裁剪床的菲号，避免显示重复
   */
  _truncateBundleNo: function (qr, orderNo, bedNo, bedSubNo) {
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
      var label = ord + '-' + bundleSeq;
      if (bedNo) {
        label += i18n.tf(NS + 'bedSuffix', { n: bedNo + (bedSubNo ? '-' + bedSubNo : '') });
      }
      return label;
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
    this._refreshBundleFilter();
    this._recomputeSelection();
  },

  /**
   * 全选
   */
  onSelectAllBundles: function () {
    var bundles = this.data.pendingBundles.slice();
    for (var i = 0; i < bundles.length; i++) bundles[i].selected = true;
    this.setData({ pendingBundles: bundles });
    this._refreshBundleFilter();
    this._recomputeSelection();
  },

  /**
   * 反选
   */
  onInvertBundles: function () {
    var bundles = this.data.pendingBundles.slice();
    for (var i = 0; i < bundles.length; i++) bundles[i].selected = !bundles[i].selected;
    this.setData({ pendingBundles: bundles });
    this._refreshBundleFilter();
    this._recomputeSelection();
  },

  /**
   * 清空选择
   */
  onClearBundles: function () {
    var bundles = this.data.pendingBundles.slice();
    for (var i = 0; i < bundles.length; i++) bundles[i].selected = false;
    this.setData({ pendingBundles: bundles });
    this._refreshBundleFilter();
    this._recomputeSelection();
  },

  /* ═══ D-517：待质检菲号可搜索 ═══
     待检菲号多时（一个订单几十上百扎）只能一路翻，加关键字过滤（菲号/二维码/颜色/码数） */
  onBundleSearchInput: function (e) {
    // setData 后 this.data 已同步更新，直接刷新过滤结果（不依赖 setData 回调的 this）
    this.setData({ bundleSearchKey: e.detail.value || '' });
    this._refreshBundleFilter();
  },

  onBundleSearchClear: function () {
    this.setData({ bundleSearchKey: '' });
    this._refreshBundleFilter();
  },

  _refreshBundleFilter: function () {
    var kw = String(this.data.bundleSearchKey || '').trim().toLowerCase();
    var all = this.data.pendingBundles || [];
    if (!kw) {
      this.setData({ filteredPendingBundles: all });
      return;
    }
    var out = all.filter(function (b) {
      var hay = [b.bundleNoShort, b.bundleNo, b.qrCode, b.color, b.size].join('|').toLowerCase();
      return hay.indexOf(kw) !== -1;
    });
    this.setData({ filteredPendingBundles: out });
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
          defectCategoryLabel: '',
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
          defectCategory: '', defectCategoryLabel: '', defectRemark: '', remark: '', imageUrls: [],
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
    // 必须同时同步 value 与 label，否则底部弹窗确认后 picker 仍显示占位符，看起来像"选取不上"
    this.setData({
      'qcSheetData.defectCategory': opt ? opt.value : '',
      'qcSheetData.defectCategoryLabel': opt ? opt.label : '',
    });
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
      toast.info(i18n.t(NS + 'maxFivePhotoW', this._lang));
      return;
    }
    // 与全站其他选图入口一致：调用 chooseMedia 前清除残留 toast/loading，
    // 避免灰度基础库下原生提示条压住相册选择器导致静默无响应
    if (wx.hideToast) wx.hideToast();
    if (wx.hideLoading) wx.hideLoading();
    wx.chooseMedia({
      count: 5 - current.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var files = res.tempFiles || [];
        var tasks = files.map(function (f) {
          return api.common.uploadImage(f.tempFilePath);
        });
        Promise.all(tasks).then(function (urls) {
          // 上传后返回相对路径 /api/file/tenant-download/...，
          // <image> 标签无法携带 Authorization header，需追加 ?token=
          var authedUrls = urls.filter(Boolean).map(function (u) { return getAuthedImageUrl(u); });
          self.setData({
            'qcSheetData.imageUrls': current.concat(authedUrls),
          });
        }).catch(function () {
          toast.error(i18n.t('mp.scanQuality.photoUploadFailed', this._lang));
        });
      },
      fail: function (err) {
        console.warn('[QualityDetail] chooseMedia fail:', err);
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showModal({
            title: i18n.t('mp.scanQuality.cameraPermission', this._lang),
            content: i18n.t('mp.scanQuality.cameraPermissionMsg', this._lang),
            confirmText: i18n.t('mp.scanQuality.goSettings', this._lang),
            cancelText: i18n.t('common.cancel', this._lang),
            success: function (modalRes) {
              if (modalRes.confirm) wx.openSetting({ success: function () {} });
            },
          });
        }
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
      toast.error(i18n.t(NS + 'bundleMissing', this._lang));
      return;
    }

    var unqualifiedQty = Number(d.unqualifiedQty || 0);
    var qualifiedQty = Number(d.qualifiedQty || 0);

    if (unqualifiedQty > 0) {
      if (!d.defectCategory) {
        toast.error(i18n.t(NS + 'selectDefectCat', this._lang));
        return;
      }
      if (!d.defectRemark) {
        toast.error(i18n.t(NS + 'selectHandleM', this._lang));
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
        toast.success(i18n.t(NS + 'qcSubmitted', this._lang));
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
          title: i18n.t('common.submitFailed', this._lang),
          content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
          showCancel: false,
          confirmText: i18n.t('common.gotIt', this._lang),
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
      toast.info(i18n.t(NS + 'selectBundleFirst', this._lang));
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
      toast.error(i18n.t(NS + 'noBatchBundles', this._lang));
      return;
    }
    wx.showModal({
      title: i18n.t(NS + 'batchPassTitle', this._lang),
      content: i18n.tf(NS + 'batchPassConfirm', { count: items.length }, this._lang),
      confirmText: i18n.t('common.confirm', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
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
            toast.success(i18n.t(NS + 'batchPassOk', this._lang));
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
              title: i18n.t(NS + 'batchPassFail', this._lang),
              content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
              showCancel: false,
              confirmText: i18n.t('common.gotIt', this._lang),
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
      toast.info(i18n.t(NS + 'selectBundleFirst', this._lang));
      return;
    }
    this.setData({
      batchUnqualFormVisible: true,
      batchUnqualData: { defectCategory: '', defectCategoryLabel: '', defectRemark: '' },
    });
  },

  onBatchUnqualDefectCategoryChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.defectCategoryOptions[index];
    this.setData({
      'batchUnqualData.defectCategory': opt ? opt.value : '',
      'batchUnqualData.defectCategoryLabel': opt ? opt.label : '',
    });
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
    if (!d.defectCategory) { toast.error(i18n.t(NS + 'selectDefectCat', this._lang)); return; }
    if (!d.defectRemark) { toast.error(i18n.t(NS + 'selectHandleM', this._lang)); return; }
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
      toast.error(i18n.t(NS + 'noBatchBundles', this._lang));
      return;
    }
    this.setData({ submitting: true });
    var promises = tasks.map(function (p) {
      return api.production.saveWarehousing(p);
    });
    Promise.all(promises)
      .then(function () {
        toast.success(i18n.t(NS + 'batchFailOk', this._lang));
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
          title: i18n.t(NS + 'batchFailFail', this._lang),
          content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
          showCancel: false,
          confirmText: i18n.t('common.gotIt', this._lang),
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
        bundleNo: this._truncateBundleNo(record.bundleNo || record.bundleQrCode || '', record.orderNo || this.data.orderNo),
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
          var code = item.locationCode || item.code || '';
          var used = Number(item.usedCapacity || 0);
          var capacity = Number(item.capacity || 0);
          var isFull = capacity > 0 && used >= capacity;
          // D-171：库位显示已用/容量，满库位标注，避免超限
          var qty = capacity > 0 ? '（' + used + '/' + capacity + (isFull ? ' ' + i18n.t(NS + 'fullSuffix', this._lang) : '') + '）' : '';
          return {
            code: code,
            name: (code || item.locationName || item.name || '-') + qty,
            label: code || item.locationName || item.name || '-',
            capacityText: qty,
            isFull: isFull,
          };
        });
        self.setData({ locationOptions: options });
      })
      .catch(function (err) {
        console.warn('[QualityDetail] loadLocationOptions failed:', err);
      });
  },

  // D-185：仓库 chip 直选（页面内选，替代底部 picker 弹窗）
  onWarehouseChipTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var opt = (this.data.warehouseOptions || []).filter(function (o) { return String(o.id) === String(id); })[0];
    if (!opt) return;
    if (String(this.data.whSheetData.warehouseAreaId) === String(opt.id)) return;
    this.setData({
      'whSheetData.warehouseAreaId': opt.id,
      'whSheetData.warehouseAreaName': opt.name,
      'whSheetData.warehouseLocationCode': '',
      locationOptions: [],
    });
    this._loadLocationOptions(opt.id);
  },

  /* ═══ D-517：库位改可搜索选择器（满库位仍拦截） ═══ */
  _openPickerByKey: function (e) {
    var key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    if (key !== 'location') return;
    this.setData({
      pickerKey: key,
      pickerTitle: i18n.t(NS + 'pickLocation', this._lang),
      pickerValue: (this.data.whSheetData && this.data.whSheetData.warehouseLocationCode) || '',
      pickerOptions: (this.data.locationOptions || []).map(function (o) {
        // label 带容量（已用/容量），满库位标出来，让用户一眼避开
        return {
          label: String(o.label || o.code || '') + (o.capacityText ? '（' + o.capacityText + '）' : '') + (o.isFull ? ' ' + i18n.t(NS + 'fullDotSuffix', this._lang) : ''),
          value: String(o.code || ''),
          isFull: !!o.isFull,
        };
      }).filter(function (o) { return o.value; }),
      pickerVisible: true,
    });
  },

  _onPickerSelectByKey: function (e) {
    var d = (e && e.detail) || {};
    if (this.data.pickerKey !== 'location') return;
    if (d.item && d.item.isFull) {
      toast.error(i18n.t(NS + 'locationFullT', this._lang));
      return;
    }
    this.setData({ 'whSheetData.warehouseLocationCode': d.value || '' });
  },

  // D-185：库位 chip 直选，满库位拦截（chip 已下线，保留兜底）
  onLocationChipTap: function (e) {
    var code = e.currentTarget.dataset.code;
    var isFull = e.currentTarget.dataset.full === true || e.currentTarget.dataset.full === 'true';
    if (isFull) {
      toast.error(i18n.t(NS + 'locationFullT', this._lang));
      return;
    }
    if (!code) return;
    this.setData({ 'whSheetData.warehouseLocationCode': code });
  },

  onLocationChange: function (e) {
    var index = Number(e.detail.value || 0);
    var opt = this.data.locationOptions[index];
    if (!opt) return;
    // D-171：满库位拦截
    if (opt.isFull) {
      toast.error(i18n.t(NS + 'locationFullT', this._lang));
      return;
    }
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
      toast.error(i18n.t(NS + 'recordMissing', this._lang));
      return;
    }
    if (!d.warehouseAreaId) {
      toast.error(i18n.t(NS + 'selectWarehouse', this._lang));
      return;
    }
    if (!d.warehouseLocationCode) {
      toast.error(i18n.t(NS + 'selectLocationW', this._lang));
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
        toast.success(i18n.t(NS + 'inboundOk', this._lang));
        self.setData({ submitting: false, whExpandIndex: -1 });
        self.fetchQcRecords();
        self.fetchBriefing();
        eventBus.emit(Events.DATA_CHANGED, { type: 'warehouse' });
      })
      .catch(function (err) {
        console.error('[QualityDetail] submitWarehouse failed:', err);
        self.setData({ submitting: false });
        wx.showModal({
          title: i18n.t(NS + 'inboundFail', this._lang),
          content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
          showCancel: false,
          confirmText: i18n.t('common.gotIt', this._lang),
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
      toast.error(i18n.t(NS + 'bundleMissing', this._lang));
      return;
    }

    wx.showModal({
      title: i18n.t('mp.defect.repairStart', this._lang),
      content: '确认菲号 ' + (record.bundleNoShort || record.bundleNo || '') + ' 开始返修？',
      confirmText: i18n.t('common.confirm', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var userInfo = getUserInfo() || {};
        api.production
          .startBundleRepair(bundleId, userInfo.name || userInfo.username || '')
          .then(function () {
            toast.success(i18n.t('mp.defect.repairStarted', this._lang));
            self.fetchQcRecords();
            eventBus.emit(Events.DATA_CHANGED, { type: 'repair' });
          })
          .catch(function (err) {
            wx.showModal({
              title: i18n.t('common.operationFailed', this._lang),
              content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
              showCancel: false,
              confirmText: i18n.t('common.gotIt', this._lang),
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
      title: i18n.t('mp.defect.repairDoneBtn', this._lang),
      content: '确认菲号 ' + (record.bundleNoShort || record.bundleNo || '') + ' 返修完成？',
      confirmText: i18n.t('mp.defect.confirmComplete', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        api.production
          .completeBundleRepair(bundleId)
          .then(function () {
            toast.success(i18n.t('mp.defect.repairDone', this._lang));
            self.fetchQcRecords();
            eventBus.emit(Events.DATA_CHANGED, { type: 'repair' });
          })
          .catch(function (err) {
            wx.showModal({
              title: i18n.t('common.operationFailed', this._lang),
              content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
              showCancel: false,
              confirmText: i18n.t('common.gotIt', this._lang),
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
      title: i18n.t('mp.defect.scrapTitle', this._lang),
      content: '确认报废菲号 ' + (record.bundleNoShort || record.bundleNo || '') + '？此操作不可撤销。',
      confirmText: i18n.t('mp.defect.scrapConfirmBtn', this._lang),
      confirmColor: '#ff3b30',
      cancelText: i18n.t('common.cancel', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        api.production
          .scrapBundle(bundleId)
          .then(function () {
            toast.success(i18n.t('mp.defect.scrapped', this._lang));
            self.fetchQcRecords();
            eventBus.emit(Events.DATA_CHANGED, { type: 'scrap' });
          })
          .catch(function (err) {
            wx.showModal({
              title: i18n.t('common.operationFailed', this._lang),
              content: err.message || err.errMsg || i18n.t('common.retryLater', this._lang),
              showCancel: false,
              confirmText: i18n.t('common.gotIt', this._lang),
            });
          });
      },
    });
  },

  // ========== 图片预览 ==========

  onPreviewImage: function (e) {
    var d = e.currentTarget.dataset;
    var url = d.url;
    var urls;
    if (d.src === 'latest') {
      // 顶部"不良品照片"区：来自 latestRecord.imageList
      var latest = this.data.latestRecord;
      urls = (latest && Array.isArray(latest.imageList) && latest.imageList.length > 0)
        ? latest.imageList
        : [url];
    } else {
      // 质检记录列表：来自 qcRecords[recIdx].imageList
      var rec = this.data.qcRecords[Number(d.recIdx)];
      urls = (rec && Array.isArray(rec.imageList) && rec.imageList.length > 0)
        ? rec.imageList
        : [url];
    }
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
      toast.info(i18n.t(NS + 'noPendingQc', this._lang));
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
      toast.info(i18n.t(NS + 'noPendingInbound', this._lang));
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
  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || i18n.t('common.pleaseSelect', this._lang),
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
