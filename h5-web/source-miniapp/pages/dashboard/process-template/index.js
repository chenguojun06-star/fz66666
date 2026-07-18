const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');

const STAGES = [
  { id: 'procurement', name: '采购' },
  { id: 'cutting', name: '裁剪' },
  { id: 'secondaryProcess', name: '二次工艺' },
  { id: 'carSewing', name: '车缝' },
  { id: 'tailProcess', name: '尾部' },
  { id: 'warehousing', name: '入库' },
];

const DIFFICULTY_OPTIONS = ['易', '中', '难'];

Page({
  data: {
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
    difficultyOptions: DIFFICULTY_OPTIONS,
    stageOptions: STAGES,
    formStageIndex: 3,
    formDifficultyIndex: 1,
  },

  onLoad(options) {
    const styleId = options.styleId || '';
    const styleNo = options.styleNo || '';
    const styleName = options.styleName || '';
    this.setData({ styleId, styleNo, styleName });
    if (styleId) {
      this._loadProcesses(styleId);
    } else {
      this.setData({ loading: false });
      toast.error('缺少款式ID');
    }
    bindPageEvents(this, () => this._loadProcesses(this.data.styleId));
  },

  onUnload() {
    unbindPageEvents(this);
  },

  _loadProcesses(styleId) {
    this.setData({ loading: true });
    api.production.listStyleProcesses(styleId).then((res) => {
      const list = Array.isArray(res) ? res : (res && res.records) || [];
      this._buildStages(list);
      this._originalData = JSON.parse(JSON.stringify(list));
      this.setData({ loading: false });
    }).catch((err) => {
      console.error('[process-template] load error', err);
      this.setData({ loading: false });
      toast.error('加载工序模板失败');
    });
  },

  _buildStages(processes) {
    const stageMap = {};
    STAGES.forEach((s) => {
      stageMap[s.id] = { id: s.id, name: s.name, processes: [], collapsed: false };
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
      title: '确认删除',
      content: '确定删除此工序吗？',
      success: (res) => {
        if (!res.confirm) return;
        const stages = this.data.stages.map((s) => {
          if (s.id !== stageId) return s;
          return { ...s, processes: s.processes.filter((p) => p.id !== processId) };
        });
        this.setData({ stages });
        this._recalcTotals();
        // 如果是已保存的工序，调用删除 API
        if (processId && !String(processId).startsWith('temp_')) {
          api.production.deleteStyleProcess(processId).catch(() => {
            toast.error('删除失败，请重试');
          });
        }
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
      toast.error('请输入工序名称');
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
    const { stages, styleId } = this.data;
    if (!styleId) return;

    const allProcesses = [];
    stages.forEach((s) => {
      s.processes.forEach((p) => {
        allProcesses.push({ ...p, sortOrder: allProcesses.length });
      });
    });

    if (allProcesses.length === 0) {
      toast.error('请至少添加一个工序');
      return;
    }

    this.setData({ saving: true });
    try {
      // 逐个保存新增和修改的工序
      const savePromises = allProcesses.map((p) => {
        const payload = {
          id: p._isNew ? undefined : p.id,
          styleId,
          processCode: p.processCode,
          processName: p.processName,
          progressStage: p.progressStage,
          machineType: p.machineType,
          difficulty: p.difficulty,
          standardTime: p.standardTime,
          price: p.price,
          description: p.description,
          sortOrder: p.sortOrder,
        };
        return api.production.saveStyleProcess(payload);
      });

      await Promise.all(savePromises);
      toast.success('工序模板已保存');
      this._loadProcesses(styleId);
    } catch (err) {
      console.error('[process-template] save error', err);
      toast.error('保存失败：' + (err.errMsg || err.message || '请重试'));
    } finally {
      this.setData({ saving: false });
    }
  },
});
