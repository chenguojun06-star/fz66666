const api = require('../../../utils/api');
const { normalizeProcessName } = require('../../../utils/displayHelper');

const STAGE_LABEL_MAP = {
  sample: '样衣',
  procurement: '采购',
  cutting: '裁剪',
  secondary: '二次工艺',
  sewing: '车缝',
  quality: '质检',
  tail: '后整',
  warehouse: '入库',
};

const STAGE_ORDER = ['sample', 'procurement', 'cutting', 'secondary', 'sewing', 'quality', 'tail', 'warehouse'];

Page({
  data: {
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
          _stageLabel: STAGE_LABEL_MAP[step.progressStage] || step.progressStage || '未分组',
          _hasSizePrices: step.sizePrices && Object.keys(step.sizePrices).length > 0,
          _unitPriceText: step.unitPrice != null ? step.unitPrice : '--',
        };
      });

      const sizes = data.sizes || [];
      const matchedScope = data.matchedScope || '';
      let scopeText = '';
      if (matchedScope === 'style') scopeText = '款式模板';
      else if (matchedScope === 'order') scopeText = '订单流程（参考）';
      else if (matchedScope === 'empty') scopeText = '默认模板';
      else scopeText = matchedScope;

      // 按阶段分组
      const groupMap = {};
      steps.forEach(function (step) {
        const stage = step.progressStage || 'other';
        if (!groupMap[stage]) {
          groupMap[stage] = {
            stage: stage,
            stageLabel: STAGE_LABEL_MAP[stage] || '其他',
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
      wx.showToast({ title: '加载失败', icon: 'none' });
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
      title: step.processName + ' - 分码价',
      content: sizeItems.map(function (it) { return it.size + '：¥' + it.price; }).join('\n'),
      showCancel: false,
      confirmText: '知道了',
    });
  },

  preventTouchMove: function () {},
});
