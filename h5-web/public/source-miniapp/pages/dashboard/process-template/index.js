const i18n = require('../../../utils/i18n/index');
const NS = 'mp.processTemplate.';
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');

// name 存键后缀（applyLanguage 重建 stageOptions）；stageName 载荷由调用点解析
const STAGES = [
  { id: 'procurement', i18nKey: 'stProcure' },
  { id: 'cutting', i18nKey: 'stCutting' },
  { id: 'secondaryProcess', i18nKey: 'stSecondary' },
  { id: 'carSewing', i18nKey: 'stSewing' },
  { id: 'tailProcess', i18nKey: 'stTail' },
  { id: 'warehousing', i18nKey: 'stWh' },
];

const DIFFICULTY_OPTIONS = ['易', '中', '难'];

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    loading: true,
    saving: false,
    styleId: '',
    styleNo: '',
    styleName: '',
    stages: [], // [{ id, name, processes: [], collapsed }]
    totalProcessCount: 0,
    totalPrice: 0,
    // 弹窗
    modalVisible: false,
    modalMode: 'add', // add / edit
    modalStageId: '',
    editId: null,
    form: {
      processName: '',
      processCode: '',
      progressStage: '',
      machineType: '',
      difficulty: '中',
      standardTime: '',
      price: '',
      description: '',
    },
    difficultyOptions: DIFFICULTY_OPTIONS,  // 值（载荷）；显示用 difficultyLabels
    stageOptions: STAGES,
    formStageIndex: 3,
    formDifficultyIndex: 1,
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），阶段/难度选项重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        noProcessHint: i18n.t(NS + 'noProcessHint', lang),
        addProcessBtn: i18n.t(NS + 'addProcessBtn', lang),
        saveTemplateBtn: i18n.t(NS + 'saveTemplateBtn', lang),
        processNameLabel: i18n.t(NS + 'processNameLabel', lang),
        processCodeLabel: i18n.t(NS + 'processCodeLabel', lang),
        stageLabel: i18n.t(NS + 'stageLabel', lang),
        machineTypeLabel: i18n.t(NS + 'machineTypeLabel', lang),
        difficultyLabel: i18n.t(NS + 'difficultyLabel', lang),
        stdTimeLabel: i18n.t(NS + 'stdTimeLabel', lang),
        priceLabel: i18n.t(NS + 'priceLabel', lang),
        descLabel: i18n.t(NS + 'descLabel', lang),
        cancelBtn: i18n.t(NS + 'cancelBtn', lang),
        confirmBtn: i18n.t(NS + 'confirmBtn', lang),
        processCountUnit: i18n.t(NS + 'processCountUnit', lang),
        editProcessTitle: i18n.t(NS + 'editProcessTitle', lang),
        namePh: i18n.t(NS + 'namePh', lang),
        codePh: i18n.t(NS + 'codePh', lang),
        machinePh: i18n.t(NS + 'machinePh', lang),
        stdTimePh: i18n.t(NS + 'stdTimePh', lang),
        pricePh: i18n.t(NS + 'pricePh', lang),
        descPh: i18n.t(NS + 'descPh', lang),
        totalWordW: i18n.t(NS + 'totalWordW', lang),
        namePh2: i18n.t(NS + 'namePh2', lang),
        codePh2: i18n.t(NS + 'codePh2', lang),
        machinePh2: i18n.t(NS + 'machinePh2', lang),
        stdTimePh2: i18n.t(NS + 'stdTimePh2', lang),
        pricePh2: i18n.t(NS + 'pricePh2', lang),
        descPh2: i18n.t(NS + 'descPh2', lang),
      },
      stageOptions: STAGES.map(function (st) { return { id: st.id, name: i18n.t(NS + st.i18nKey, lang) }; }),
      difficultyLabels: [i18n.t(NS + 'diffEasy', lang), i18n.t(NS + 'diffMedium', lang), i18n.t(NS + 'diffHard', lang)],
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    const styleId = options.styleId || '';
    const styleNo = options.styleNo || '';
    const styleName = options.styleName || '';
    this.setData({ styleId, styleNo, styleName });
    if (styleId) {
      this._loadProcesses(styleId);
    } else {
      this.setData({ loading: false });
      toast.error(i18n.t(NS + 'missingStyleId', this._lang));
    }
    bindPageEvents(this, () => this._loadProcesses(this.data.styleId));
  },

  onUnload() {
    unbindPageEvents(this);
  },

  async _loadProcesses(styleId) {
    this.setData({ loading: true });
    try {
      // 如果没有 styleNo，先根据 styleId 获取款式详情
      let styleNo = this.data.styleNo;
      if (!styleNo && styleId) {
        const styleRes = await api.style.detail(styleId);
        styleNo = styleRes && (styleRes.styleNo || styleRes.data && styleRes.data.styleNo) || '';
        if (styleNo) {
          this.setData({ styleNo });
        }
      }
      if (!styleNo) {
        this.setData({ loading: false });
        toast.error(i18n.t(NS + 'missingStyleNo', this._lang));
        return;
      }
      // 调用与PC端统一的工序单价模板API（TemplateLibrary）
      const res = await api.templateLibrary.processPriceTemplate(styleNo);
      const content = (res && res.content) || (res && res.data && res.data.content) || {};
      const steps = Array.isArray(content.steps) ? content.steps : [];
      // 映射 unitPrice → price，与小程序端UI字段保持一致
      const list = steps.map((s, idx) => ({
        id: s.processCode || String(idx),
        processName: s.processName || '',
        processCode: s.processCode || String(idx + 1).padStart(2, '0'),
        progressStage: s.progressStage || '',
        machineType: s.machineType || '',
        difficulty: s.difficulty || '中',
        standardTime: s.standardTime || 0,
        price: Number(s.unitPrice || s.price || 0),
        description: s.description || '',
        sortOrder: idx,
      }));
      this._buildStages(list);
      this._originalData = JSON.parse(JSON.stringify(list));
      this.setData({ loading: false });
    } catch (err) {
      console.error('[process-template] load error', err);
      this.setData({ loading: false });
      toast.error(i18n.t(NS + 'loadFail', this._lang));
    }
  },

  _buildStages(processes) {
    var lang = this._lang || i18n.getLanguage();
    const stageMap = {};
    STAGES.forEach((s) => {
      stageMap[s.id] = { id: s.id, name: i18n.t(NS + s.i18nKey, lang), processes: [], collapsed: false };
    });

    processes.forEach((p) => {
      const stageId = p.progressStage || 'carSewing';
      if (!stageMap[stageId]) {
        stageMap[stageId] = { id: stageId, name: stageId, processes: [], collapsed: false };
      }
      stageMap[stageId].processes.push({
        ...p,
        _isNew: false,
      });
    });

    // 按 sortOrder 排序
    Object.keys(stageMap).forEach((k) => {
      stageMap[k].processes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    });

    const stages = STAGES.map((s) => stageMap[s.id]).filter((s) => s.processes.length > 0 || true);
    this.setData({
      stages,
      totalProcessCount: processes.length,
      totalPrice: processes.reduce((sum, p) => sum + (Number(p.price) || 0), 0),
    });
  },

  onToggleCollapse(e) {
    const stageId = e.currentTarget.dataset.stageId;
    const stages = this.data.stages.map((s) =>
      s.id === stageId ? { ...s, collapsed: !s.collapsed } : s
    );
    this.setData({ stages });
  },

  onAddProcess(e) {
    const stageId = e.currentTarget.dataset.stageId || 'carSewing';
    const stageIdx = STAGES.findIndex((s) => s.id === stageId);
    this.setData({
      modalVisible: true,
      modalMode: 'add',
      modalStageId: stageId,
      editId: null,
      form: {
        processName: '',
        processCode: '',
        progressStage: stageId,
        machineType: '',
        difficulty: '中',
        standardTime: '',
        price: '',
        description: '',
      },
      formStageIndex: stageIdx >= 0 ? stageIdx : 3,
      formDifficultyIndex: 1,
    });
  },

  onEditProcess(e) {
    const { stageId, processId } = e.currentTarget.dataset;
    const stage = this.data.stages.find((s) => s.id === stageId);
    if (!stage) return;
    const proc = stage.processes.find((p) => p.id === processId);
    if (!proc) return;
    const stageIdx = STAGES.findIndex((s) => s.id === (proc.progressStage || stageId));
    const diffIdx = DIFFICULTY_OPTIONS.indexOf(proc.difficulty || '中');
    this.setData({
      modalVisible: true,
      modalMode: 'edit',
      modalStageId: stageId,
      editId: processId,
      form: {
        processName: proc.processName || '',
        processCode: proc.processCode || '',
        progressStage: proc.progressStage || stageId,
        machineType: proc.machineType || '',
        difficulty: proc.difficulty || '中',
        standardTime: String(proc.standardTime || ''),
        price: String(proc.price || ''),
        description: proc.description || '',
      },
      formStageIndex: stageIdx >= 0 ? stageIdx : 3,
      formDifficultyIndex: diffIdx >= 0 ? diffIdx : 1,
    });
  },

  onDeleteProcess(e) {
    const { stageId, processId } = e.currentTarget.dataset;
    wx.showModal({
      title: i18n.t(NS + 'delTitle', this._lang),
      content: i18n.t(NS + 'delMsg', this._lang),
      success: (res) => {
        if (!res.confirm) return;
        const stages = this.data.stages.map((s) => {
          if (s.id !== stageId) return s;
          return { ...s, processes: s.processes.filter((p) => p.id !== processId) };
        });
        this.setData({ stages });
        this._recalcTotals();
        // process-price-template 是整体保存模式，无需单独调用删除API
      },
    });
  },

  onFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onStageChange(e) {
    const idx = Number(e.detail.value);
    const selected = this.data.stageOptions[idx];
    if (selected) {
      this.setData({ 'form.progressStage': selected.id, formStageIndex: idx });
    }
  },

  onDifficultyChange(e) {
    const idx = Number(e.detail.value);
    const selected = DIFFICULTY_OPTIONS[idx];
    if (selected) {
      this.setData({ 'form.difficulty': selected, formDifficultyIndex: idx });
    }
  },

  onModalCancel() {
    this.setData({ modalVisible: false });
  },

  onModalConfirm() {
    const { form, modalMode, editId } = this.data;
    if (!form.processName.trim()) {
      toast.error(i18n.t(NS + 'processNameReq', this._lang));
      return;
    }
    const stageId = form.progressStage || this.data.modalStageId;
    const processData = {
      id: modalMode === 'edit' ? editId : 'temp_' + Date.now(),
      styleId: this.data.styleId,
      processName: form.processName.trim(),
      processCode: form.processCode.trim() || '',
      progressStage: stageId,
      machineType: form.machineType.trim(),
      difficulty: form.difficulty,
      standardTime: Number(form.standardTime) || 0,
      price: Number(form.price) || 0,
      description: form.description.trim(),
      sortOrder: 0,
      _isNew: modalMode === 'add',
    };

    const stages = this.data.stages.map((s) => {
      if (s.id !== stageId) return s;
      if (modalMode === 'edit') {
        return {
          ...s,
          processes: s.processes.map((p) => (p.id === editId ? { ...processData, _isNew: false } : p)),
        };
      }
      // 添加模式
      return { ...s, processes: [...s.processes, processData] };
    });

    this.setData({ stages, modalVisible: false });
    this._recalcTotals();
  },

  _recalcTotals() {
    let count = 0;
    let price = 0;
    this.data.stages.forEach((s) => {
      s.processes.forEach((p) => {
        count++;
        price += Number(p.price) || 0;
      });
    });
    this.setData({ totalProcessCount: count, totalPrice: price });
  },

  async onSaveAll() {
    const { stages, styleNo } = this.data;
    if (!styleNo) {
      toast.error(i18n.t(NS + 'saveNoStyleNo', this._lang));
      return;
    }

    const steps = [];
    stages.forEach((s) => {
      s.processes.forEach((p) => {
        steps.push({
          processCode: p.processCode || String(steps.length + 1).padStart(2, '0'),
          processName: p.processName,
          progressStage: p.progressStage || '',
          machineType: p.machineType || '',
          difficulty: p.difficulty || '中',
          standardTime: Number(p.standardTime) || 0,
          unitPrice: Number(p.price) || 0,
          description: p.description || '',
        });
      });
    });

    if (steps.length === 0) {
      toast.error(i18n.t(NS + 'needOneProcess', this._lang));
      return;
    }

    this.setData({ saving: true });
    try {
      // 统一调用与PC端相同的 process-price-template API（整体保存）
      await api.templateLibrary.saveProcessPriceTemplate({
        styleNo,
        templateContent: { steps },
      });
      toast.success(i18n.t(NS + 'saved', this._lang));
      this._loadProcesses(this.data.styleId);
    } catch (err) {
      console.error('[process-template] save error', err);
      toast.error(i18n.t(NS + 'saveFailPrefix', this._lang) + (err.errMsg || err.message || i18n.t(NS + 'retryW', this._lang)));
    } finally {
      this.setData({ saving: false });
    }
  },

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

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
      pickerTitle: ds.title || i18n.t(NS + 'selectW', this._lang),
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
