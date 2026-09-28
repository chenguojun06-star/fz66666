const i18n = require('../../../utils/i18n/index');

const NS = 'mp.unitPrice.';

const api = require('../../../utils/api');
const { normalizeProcessName } = require('../../../utils/displayHelper');

// 阶段 code → 语言包键名（code 保持英文，显示文案由 stageLabel 按语言取）
const STAGE_KEYS = {
  sample: 'stageSample',
  procurement: 'stageProcurement',
  cutting: 'stageCutting',
  secondary: 'stageSecondary',
  sewing: 'stageSewing',
  quality: 'stageQuality',
  tail: 'stageTail',
  warehouse: 'stageWarehouse',
};

function stageLabel(stage, lang) {
  var k = STAGE_KEYS[stage];
  return k ? i18n.t(NS + k, lang) : (stage || i18n.t(NS + 'ungrouped', lang));
}

const STAGE_ORDER = ['sample', 'procurement', 'cutting', 'secondary', 'sewing', 'quality', 'tail', 'warehouse'];

Page({
  data: {
    t: {},
    loading: true,
    styleOptions: [],
    selectedStyleNo: '',
    selectedStyleName: '',
    styleSearchText: '',
    stylePickerVisible: false,
    filteredStyleOptions: [],

    templateInfo: null,
    steps: [],
    sizes: [],
    matchedScope: '',
    matchedScopeText: '',
    totalPrice: 0,

    groupByStage: true,
    groupedSteps: [],
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        selectStyle: t('selectStyle'),
        processCount: t('processCount'),
        totalPrice: t('totalPrice'),
        sizeCount: t('sizeCount'),
        listView: t('listView'),
        stageView: t('stageView'),
        loading: i18n.t('common.loading', lang),
        selectStyleHint: t('selectStyleHint'),
        searchHint: t('searchHint'),
        emptyData: t('emptyData'),
        emptyDataHint: t('emptyDataHint'),
        sizePrice: t('sizePrice'),
        machinePrefix: t('machinePrefix'),
        timePrefix: t('timePrefix'),
        difficultyPrefix: t('difficultyPrefix'),
        tapView: t('tapView'),
        subtotalPrefix: t('subtotalPrefix'),
        chooseStyle: t('chooseStyle'),
        noMatchStyle: t('noMatchStyle'),
        searchPlaceholder: t('searchPlaceholder'),
      },
      // 列表里的阶段标签跟着语言重算
      steps: (this.data.steps || []).map((it) => ({ ...it, _stageLabel: stageLabel(it.progressStage, lang) })),
      groupedSteps: (this.data.groupedSteps || []).map((g) => ({ ...g, stageLabel: stageLabel(g.stage, lang) })),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad: function (options) {
    const styleNo = options?.styleNo || '';
    if (styleNo) {
      this.setData({ selectedStyleNo: styleNo });
    }
    this.loadStyleOptions('').then(() => {
      if (styleNo) {
        this.loadTemplate(styleNo);
      } else {
        this.setData({ loading: false });
      }
    });
  },

  onPullDownRefresh: function () {
    if (this.data.selectedStyleNo) {
      this.loadTemplate(this.data.selectedStyleNo).finally(function () { wx.stopPullDownRefresh(); });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  loadStyleOptions: function (keyword) {
    const that = this;
    return api.templateLibrary.processPriceStyleOptions(keyword || '').then(function (res) {
      const list = Array.isArray(res) ? res : (res.data || res.records || []);
      const options = list.map(function (item) {
        return {
          styleNo: item.styleNo || item.value || '',
          styleName: item.styleName || item.label || '',
        };
      }).filter(function (item) { return !!item.styleNo; });
      that.setData({
        styleOptions: options,
        filteredStyleOptions: options,
      });
      return options;
    }).catch(function (err) {
      console.warn('[unit-price] loadStyleOptions failed:', err);
      return [];
    });
  },

  onTapStyleSelect: function () {
    this.setData({
      stylePickerVisible: true,
      filteredStyleOptions: this.data.styleOptions,
      styleSearchText: '',
    });
  },

  onStyleSearchInput: function (e) {
    const kw = e.detail.value || '';
    this.setData({ styleSearchText: kw });
    if (!kw.trim()) {
      this.setData({ filteredStyleOptions: this.data.styleOptions });
      return;
    }
    const lower = kw.toLowerCase();
    const filtered = this.data.styleOptions.filter(function (item) {
      return (item.styleNo && item.styleNo.toLowerCase().indexOf(lower) >= 0)
        || (item.styleName && item.styleName.toLowerCase().indexOf(lower) >= 0);
    });
    this.setData({ filteredStyleOptions: filtered });
  },

  onSelectStyle: function (e) {
    const styleNo = e.currentTarget.dataset.styleno;
    const item = this.data.styleOptions.find(function (it) { return it.styleNo === styleNo; });
    this.setData({
      selectedStyleNo: styleNo,
      selectedStyleName: item?.styleName || '',
      stylePickerVisible: false,
    });
    this.loadTemplate(styleNo);
  },

  onCloseStylePicker: function () {
    this.setData({ stylePickerVisible: false });
  },

  toggleGroupByStage: function () {
    this.setData({ groupByStage: !this.data.groupByStage });
  },

  loadTemplate: function (styleNo) {
    const that = this;
    this.setData({ loading: true, steps: [], sizes: [], templateInfo: null, groupedSteps: [] });

    return api.templateLibrary.processPriceTemplate(styleNo).then(function (res) {
      const data = res.data || res;
      const steps = (data.steps || []).map(function (step, idx) {
        return {
          ...step,
          processName: normalizeProcessName(step.processName || step.name || ''),
          _index: idx + 1,
          _stageLabel: stageLabel(step.progressStage, that._lang),
          _hasSizePrices: step.sizePrices && Object.keys(step.sizePrices).length > 0,
          _unitPriceText: step.unitPrice != null ? step.unitPrice : '--',
        };
      });

      const sizes = data.sizes || [];
      const matchedScope = data.matchedScope || '';
      let scopeText = '';
      if (matchedScope === 'style') scopeText = i18n.t(NS + 'scopeStyle', that._lang);
      else if (matchedScope === 'order') scopeText = i18n.t(NS + 'scopeOrder', that._lang);
      else if (matchedScope === 'empty') scopeText = i18n.t(NS + 'scopeEmpty', that._lang);
      else scopeText = matchedScope;

      // 按阶段分组
      const groupMap = {};
      steps.forEach(function (step) {
        const stage = step.progressStage || 'other';
        if (!groupMap[stage]) {
          groupMap[stage] = {
            stage: stage,
            stageLabel: stageLabel(stage, that._lang) || i18n.t(NS + 'otherGroup', that._lang),
            steps: [],
            subtotal: 0,
          };
        }
        groupMap[stage].steps.push(step);
        if (step.unitPrice != null && !isNaN(Number(step.unitPrice))) {
          groupMap[stage].subtotal += Number(step.unitPrice);
        }
      });

      const groupedSteps = STAGE_ORDER
        .filter(function (s) { return groupMap[s]; })
        .map(function (s) { return groupMap[s]; });
      // 把其他不在预设列表中的阶段放最后
      Object.keys(groupMap).forEach(function (s) {
        if (STAGE_ORDER.indexOf(s) < 0) {
          groupedSteps.push(groupMap[s]);
        }
      });

      // 计算总价（非分码价的单价相加）
      let total = 0;
      steps.forEach(function (s) {
        if (s.unitPrice != null && !isNaN(Number(s.unitPrice)) && !s._hasSizePrices) {
          total += Number(s.unitPrice);
        }
      });

      that.setData({
        loading: false,
        steps: steps,
        sizes: sizes,
        templateInfo: {
          templateId: data.templateId || '',
          templateName: data.templateName || '',
          templateKey: data.templateKey || '',
          exists: !!data.exists,
        },
        matchedScope: matchedScope,
        matchedScopeText: scopeText,
        totalPrice: Number(total.toFixed(2)),
        groupedSteps: groupedSteps,
      });
    }).catch(function (err) {
      console.warn('[unit-price] loadTemplate failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: i18n.t(NS + 'loadFailed', that._lang), icon: 'none' });
    });
  },

  onStepTap: function (e) {
    const idx = e.currentTarget.dataset.index;
    const step = this.data.steps[idx];
    if (!step || !step._hasSizePrices) return;

    const sizePrices = step.sizePrices;
    const sizeItems = Object.keys(sizePrices).map(function (sz) {
      return { size: sz, price: sizePrices[sz] || 0 };
    });

    wx.showModal({
      title: step.processName + ' - ' + i18n.t(NS + 'sizePrice', this._lang),
      content: sizeItems.map(function (it) { return it.size + '：¥' + it.price; }).join('\n'),
      showCancel: false,
      confirmText: i18n.t('common.gotIt', this._lang),
    });
  },

  preventTouchMove: function () {},
});
