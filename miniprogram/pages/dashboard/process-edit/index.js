const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

const STAGE_MAP = [
  { id: 'procurement', name: '采购' },
  { id: 'cutting', name: '裁剪' },
  { id: 'secondaryProcess', name: '二次工艺' },
  { id: 'carSewing', name: '车缝' },
  { id: 'tailProcess', name: '尾部' },
  { id: 'warehousing', name: '入库' },
];

const STAGE_NAME_TO_ID = {};
STAGE_MAP.forEach(function (s) { STAGE_NAME_TO_ID[s.name] = s.id; });

const STATUS_CN = {
  pending: '待生产', production: '生产中', completed: '已完成',
  cancelled: '已取消', paused: '已暂停',
};
const STATUS_CLASS = {
  pending: 'order-status--other', production: 'order-status--production',
  completed: 'order-status--completed', cancelled: 'order-status--other',
  paused: 'order-status--other',
};
const EDITABLE_STATUSES = ['production'];

Page({
  data: {
    loading: true,
    orderId: '',
    orderNo: '',
    styleNo: '',
    styleId: '',
    status: '',
    statusCn: '',
    statusClass: '',
    editable: false,
    hasChanges: false,
    stages: [],
    processEditId: null,
    editForm: {},
    addStageId: null,
    addForm: { stageId: '', stageName: '', processName: '', machineType: '', price: '', standardTime: '', difficulty: '中', description: '' },
    processDict: [],
    keyboardOpen: false,
    totalProcessCount: 0,
    totalPrice: 0,
  },

  onLoad: function (options) {
    const orderId = options.orderId || '';
    const orderNo = options.orderNo || '';
    this.setData({ orderId: orderId, orderNo: orderNo });
    if (orderId) {
      this._loadOrderAndProcesses(orderId);
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少订单ID', icon: 'none' });
    }
    this._loadDictData();
  },

  onShow: function () {
    this._bindKeyboardEvents();
  },

  onHide: function () {
    this._unbindKeyboardEvents();
  },

  onUnload: function () {
    this._unbindKeyboardEvents();
  },

  _bindKeyboardEvents: function () {
    const that = this;
    this._onFocusHandler = function () { that.setData({ keyboardOpen: true }); };
    this._onBlurHandler = function () { that.setData({ keyboardOpen: false }); };
    // H5 端用 resize 监听键盘
    if (typeof window !== 'undefined') {
      this._onResizeHandler = function () {
        const isKeyboard = window.innerHeight < (that._winHeight || window.innerHeight);
        that._winHeight = that._winHeight || window.innerHeight;
        that.setData({ keyboardOpen: isKeyboard });
      };
      window.addEventListener('resize', this._onResizeHandler);
    }
  },

  _unbindKeyboardEvents: function () {
    if (typeof window !== 'undefined' && this._onResizeHandler) {
      window.removeEventListener('resize', this._onResizeHandler);
    }
  },

  _loadDictData: function () {
    const that = this;
    api.system.getDictList('process_name').then(function (res) {
      const list = Array.isArray(res) ? res : (res && res.records) || [];
      that.setData({ processDict: list });
    }).catch(function () {});
  },

  _loadOrderAndProcesses: function (orderId) {
    const that = this;
    that.setData({ loading: true });

    api.production.orderDetail(orderId).then(function (res) {
      let order = null;
      if (res) {
        if (res.records && res.records.length) {
          order = res.records[0];
        } else if (Array.isArray(res) && res.length) {
          order = res[0];
        } else if (res.id) {
          order = res;
        }
      }
      if (!order) {
        that.setData({ loading: false });
        toast.error('订单不存在');
        return;
      }
      const status = order.status || '';
      const editable = EDITABLE_STATUSES.indexOf(status) !== -1;
      const styleId = order.styleId || '';
      that.setData({
        orderId: order.id || that.data.orderId,
        orderNo: order.orderNo || that.data.orderNo,
        styleNo: order.styleNo || order.styleNumber || '',
        styleId: styleId,
        status: status,
        statusCn: STATUS_CN[status] || status,
        statusClass: STATUS_CLASS[status] || 'order-status--other',
        editable: editable,
      });

      // 优先从 t_style_process 表读取工序（真实数据源）
      // 兜底从 order.progressWorkflowJson 读（向后兼容旧数据）
      if (styleId) {
        api.style.listProcesses({ styleId: styleId }).then(function (procRes) {
          const list = Array.isArray(procRes) ? procRes : (procRes && procRes.data) || [];
          let processes;
          if (list && list.length > 0) {
            processes = list.map(function (p, i) {
              return {
                id: p.id || ('proc_' + i),
                processName: p.processName || '',
                processCode: p.processCode || String(i + 1).padStart(2, '0'),
                processCodeText: p.processCode || String(i + 1).padStart(2, '0'),
                progressStage: p.progressStage || '',
                machineType: p.machineType || '',
                standardTime: p.standardTime || 0,
                price: Number(p.price || 0),
                difficulty: p.difficulty || '',
                description: p.description || '',
                sortOrder: p.sortOrder != null ? p.sortOrder : i,
                _modified: false,
              };
            });
          } else {
            processes = that._extractProcesses(order);
          }
          that._buildStages(processes);
          that._originalProcesses = JSON.parse(JSON.stringify(processes));
          that._deletedIds = [];
          that._newProcesses = [];
          that._recalcTotals();
          that.setData({ loading: false });
        }).catch(function (err) {
          console.warn('[process-edit] 加载工序列表失败,回退到JSON:', err);
          const processes = that._extractProcesses(order);
          that._buildStages(processes);
          that._originalProcesses = JSON.parse(JSON.stringify(processes));
          that._deletedIds = [];
          that._newProcesses = [];
          that._recalcTotals();
          that.setData({ loading: false });
        });
      } else {
        const processes = that._extractProcesses(order);
        that._buildStages(processes);
        that._originalProcesses = JSON.parse(JSON.stringify(processes));
        that._deletedIds = [];
        that._newProcesses = [];
        that._recalcTotals();
        that.setData({ loading: false });
      }
    }).catch(function (err) {
      console.error('[process-edit] 加载订单失败:', err);
      that.setData({ loading: false });
      toast.error('加载失败');
    });
  },

  _extractProcesses: function (order) {
    let wf = order.progressWorkflowJson;
    if (typeof wf === 'string') {
      try { wf = JSON.parse(wf); } catch (e) { wf = null; }
    }

    const processesByNode = wf && wf.processesByNode;
    if (processesByNode && typeof processesByNode === 'object') {
      const result = [];
      Object.keys(processesByNode).forEach(function (stageKey) {
        const subList = processesByNode[stageKey];
        if (!Array.isArray(subList)) return;
        subList.forEach(function (n, i) {
          const code = n.processCode || String(i + 1).padStart(2, '0');
          result.push({
            id: n.id || ('proc_' + stageKey + '_' + i),
            processName: n.name || n.processName || '',
            processCode: code,
            processCodeText: code,
            progressStage: stageKey,
            machineType: n.machineType || '',
            standardTime: n.standardTime || 0,
            price: Number(n.unitPrice || n.price || 0),
            difficulty: n.difficulty || '',
            description: n.description || '',
            sortOrder: n.sortOrder != null ? n.sortOrder : i,
            _modified: false,
          });
        });
      });
      if (result.length > 0) return result;
    }

    const nodes = (wf && wf.nodes) || [];
    return nodes.map(function (n, i) {
      const code = n.processCode || String(i + 1).padStart(2, '0');
      return {
        id: n.id || ('proc_' + i),
        processName: n.name || '',
        processCode: code,
        processCodeText: code,
        progressStage: n.progressStage || n.name || '',
        machineType: n.machineType || '',
        standardTime: n.standardTime || 0,
        price: Number(n.unitPrice || n.price || 0),
        difficulty: n.difficulty || '',
        description: n.description || '',
        sortOrder: n.sortOrder != null ? n.sortOrder : i,
        _modified: false,
      };
    });
  },

  _buildStages: function (processes) {
    const stageMap = {};
    STAGE_MAP.forEach(function (s) { stageMap[s.id] = { id: s.id, name: s.name, processes: [], subtotal: 0 }; });

    processes.forEach(function (p) {
      const raw = p.progressStage || '';
      let stageId = stageMap[raw] ? raw : null;
      if (!stageId) stageId = STAGE_NAME_TO_ID[raw] || null;
      if (!stageId) stageId = 'tailProcess';
      stageMap[stageId].processes.push(p);
    });

    const stages = STAGE_MAP.map(function (s) {
      const stage = stageMap[s.id];
      stage.subtotal = stage.processes.reduce(function (sum, p) { return sum + (Number(p.price) || 0); }, 0).toFixed(2);
      return stage;
    });
    this.setData({ stages: stages });
    this._recalcTotals();
  },

  _recalcTotals: function () {
    const stages = this.data.stages;
    let count = 0;
    let total = 0;
    stages.forEach(function (s) {
      count += s.processes.length;
      s.processes.forEach(function (p) {
        total += Number(p.price) || 0;
      });
    });
    this.setData({
      totalProcessCount: count,
      totalPrice: total.toFixed(2),
    });
  },

  _markModified: function (id) {
    const stages = this.data.stages;
    const original = this._originalProcesses || [];
    const origMap = {};
    original.forEach(function (p) { origMap[p.id] = p; });

    stages.forEach(function (s) {
      s.processes.forEach(function (p) {
        if (p.id === id) {
          const orig = origMap[id];
          if (!orig) {
            p._modified = true; // 新增的
          } else {
            p._modified = (
              p.processName !== orig.processName ||
              p.machineType !== orig.machineType ||
              Number(p.price) !== Number(orig.price) ||
              Number(p.standardTime) !== Number(orig.standardTime) ||
              p.difficulty !== orig.difficulty ||
              p.description !== orig.description
            );
          }
        }
      });
    });

    // 重新计算小计
    stages.forEach(function (s) {
      s.subtotal = s.processes.reduce(function (sum, p) { return sum + (Number(p.price) || 0); }, 0).toFixed(2);
    });

    this.setData({ stages: stages });
    this._recalcTotals();
  },

  onToggleAddForm: function (e) {
    const stageId = e.currentTarget.dataset.stageId;
    const stageName = e.currentTarget.dataset.stageName;
    if (this.data.addStageId === stageId) {
      this.setData({ addStageId: null });
    } else {
      this.setData({
        addStageId: stageId,
        addForm: { stageId: stageId, stageName: stageName, processName: '', machineType: '', price: '', standardTime: '', difficulty: '中', description: '' },
      });
    }
  },

  onCancelAdd: function () {
    this.setData({ addStageId: null });
  },

  onAddFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    const key = 'addForm.' + field;
    const obj = {};
    obj[key] = val;
    this.setData(obj);
  },

  onDictPickProcess: function (e) {
    const idx = e.detail.value;
    const dict = this.data.processDict;
    if (dict && dict[idx]) {
      this.setData({ 'addForm.processName': dict[idx].dictLabel || dict[idx].name || dict[idx].dictValue || '' });
    }
  },

  _doAddProcess: function (keepForm) {
    const form = this.data.addForm;
    if (!form.processName.trim()) {
      wx.showToast({ title: '请输入工序名称', icon: 'none' });
      return false;
    }
    const newProcess = {
      id: 'new_' + Date.now(),
      processName: form.processName.trim(),
      processCode: String(Date.now()).slice(-4),
      processCodeText: String(Date.now()).slice(-4),
      progressStage: form.stageId,
      machineType: form.machineType || '',
      standardTime: parseInt(form.standardTime) || 0,
      price: parseFloat(form.price) || 0,
      difficulty: form.difficulty || '中',
      description: form.description || '',
      sortOrder: 999,
      _modified: true,
    };

    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].id === form.stageId) {
        stages[i].processes.push(newProcess);
        stages[i].subtotal = stages[i].processes.reduce(function (sum, p) { return sum + (Number(p.price) || 0); }, 0).toFixed(2);
        break;
      }
    }
    this._newProcesses.push(newProcess);

    if (keepForm) {
      // 保留阶段，清空字段方便连续添加
      this.setData({
        stages: stages,
        hasChanges: true,
        addForm: { stageId: form.stageId, stageName: form.stageName, processName: '', machineType: '', price: '', standardTime: '', difficulty: '中', description: '' },
      });
    } else {
      this.setData({ stages: stages, addStageId: null, hasChanges: true });
    }
    this._recalcTotals();
    return true;
  },

  onConfirmAdd: function () {
    this._doAddProcess(false);
  },

  onConfirmAddContinue: function () {
    this._doAddProcess(true);
  },

  onEditProcess: function (e) {
    const id = e.currentTarget.dataset.id;
    const stageId = e.currentTarget.dataset.stageId;
    let process = null;
    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].id === stageId) {
        for (let j = 0; j < stages[i].processes.length; j++) {
          if (stages[i].processes[j].id === id) {
            process = stages[i].processes[j];
            break;
          }
        }
        break;
      }
    }
    if (!process) return;
    this.setData({
      processEditId: id,
      editForm: {
        id: process.id,
        processName: process.processName,
        machineType: process.machineType || '',
        price: String(process.price || ''),
        standardTime: String(process.standardTime || ''),
        difficulty: process.difficulty || '中',
        description: process.description || '',
        progressStage: process.progressStage,
        processCode: process.processCode,
        sortOrder: process.sortOrder,
      },
    });
  },

  onEditFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    const key = 'editForm.' + field;
    const obj = {};
    obj[key] = val;
    this.setData(obj);
  },

  onSetDifficulty: function (e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ 'editForm.difficulty': val });
  },

  onAddSetDifficulty: function (e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ 'addForm.difficulty': val });
  },

  onCancelEdit: function () {
    this.setData({ processEditId: null, editForm: {} });
  },

  onSaveEdit: function () {
    const form = this.data.editForm;
    if (!form.processName || !form.processName.trim()) {
      wx.showToast({ title: '请输入工序名称', icon: 'none' });
      return;
    }
    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      const procs = stages[i].processes;
      for (let j = 0; j < procs.length; j++) {
        if (procs[j].id === form.id) {
          procs[j].processName = form.processName.trim();
          procs[j].machineType = form.machineType || '';
          procs[j].price = parseFloat(form.price) || 0;
          procs[j].standardTime = parseInt(form.standardTime) || 0;
          procs[j].difficulty = form.difficulty || '中';
          procs[j].description = form.description || '';
          break;
        }
      }
    }
    this.setData({ stages: stages, processEditId: null, editForm: {}, hasChanges: true });
    this._markModified(form.id);
  },

  onDeleteProcess: function (e) {
    const id = e.currentTarget.dataset.id;
    const stageId = e.currentTarget.dataset.stageId;
    const that = this;
    // 内联确认（H5友好）
    wx.showModal({
      title: '删除工序',
      content: '删除后保存生效，确定？',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (!res.confirm) return;
        const stages = that.data.stages;
        const deletedIds = that._deletedIds;
        for (let i = 0; i < stages.length; i++) {
          if (stages[i].id === stageId) {
            var newProcs = [];
            stages[i].processes.forEach(function (p) {
              if (p.id === id) {
                if (!String(id).startsWith('new_')) deletedIds.push(id);
              } else {
                newProcs.push(p);
              }
            });
            stages[i].processes = newProcs;
            stages[i].subtotal = stages[i].processes.reduce(function (sum, p) { return sum + (Number(p.price) || 0); }, 0).toFixed(2);
            break;
          }
        }
        that.setData({ stages: stages, hasChanges: true });
        that._recalcTotals();
      },
    });
  },

  onMoveUp: function (e) {
    const id = e.currentTarget.dataset.id;
    const stageId = e.currentTarget.dataset.stageId;
    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].id === stageId) {
        const procs = stages[i].processes;
        for (let j = 0; j < procs.length; j++) {
          if (procs[j].id === id && j > 0) {
            const tmp = procs[j - 1];
            procs[j - 1] = procs[j];
            procs[j] = tmp;
            procs[j - 1]._modified = true;
            procs[j]._modified = true;
            this.setData({ stages: stages, hasChanges: true });
            return;
          }
        }
        break;
      }
    }
  },

  onMoveDown: function (e) {
    const id = e.currentTarget.dataset.id;
    const stageId = e.currentTarget.dataset.stageId;
    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].id === stageId) {
        const procs = stages[i].processes;
        for (let j = 0; j < procs.length; j++) {
          if (procs[j].id === id && j < procs.length - 1) {
            const tmp = procs[j + 1];
            procs[j + 1] = procs[j];
            procs[j] = tmp;
            procs[j + 1]._modified = true;
            procs[j]._modified = true;
            this.setData({ stages: stages, hasChanges: true });
            return;
          }
        }
        break;
      }
    }
  },

  onResetChanges: function () {
    const that = this;
    wx.showModal({
      title: '重置修改',
      content: '将撤销所有修改，确定？',
      success: function (res) {
        if (!res.confirm) return;
        that._buildStages(that._originalProcesses || []);
        that._deletedIds = [];
        that._newProcesses = [];
        that.setData({ hasChanges: false, processEditId: null, editForm: {} });
      },
    });
  },

  onSaveAll: function () {
    const that = this;
    const stages = that.data.stages;
    const styleId = that.data.styleId;
    const orderId = that.data.orderId;

    if (!styleId) {
      toast.error('缺少款式ID,无法保存工序');
      return;
    }

    // 收集所有工序（保持顺序）
    const allProcesses = [];
    let sortOrder = 0;
    STAGE_MAP.forEach(function (stageDef) {
      for (let i = 0; i < stages.length; i++) {
        if (stages[i].id === stageDef.id) {
          stages[i].processes.forEach(function (p) {
            allProcesses.push({
              id: p.id,
              isNew: String(p.id).startsWith('new_'),
              isModified: !!p._modified,
              processName: p.processName,
              processCode: p.processCode || String(sortOrder + 1).padStart(2, '0'),
              progressStage: p.progressStage || stageDef.id,
              machineType: p.machineType || '',
              standardTime: p.standardTime || 0,
              price: p.price || 0,
              difficulty: p.difficulty || '',
              description: p.description || '',
              sortOrder: sortOrder,
            });
            sortOrder++;
          });
          break;
        }
      }
    });

    wx.showLoading({ title: '保存中...' });

    // 1. 删除已标记的工序
    const deletePromises = (that._deletedIds || []).map(function (pid) {
      return api.style.deleteProcess(pid).catch(function (err) {
        console.warn('[process-edit] 删除工序失败:', pid, err);
      });
    });

    Promise.all(deletePromises).then(function () {
      // 2. 新增和修改工序
      const savePromises = allProcesses.map(function (p) {
        const payload = {
          styleId: styleId,
          processName: p.processName,
          processCode: p.processCode,
          progressStage: p.progressStage,
          machineType: p.machineType,
          standardTime: p.standardTime,
          price: p.price,
          difficulty: p.difficulty,
          description: p.description,
          sortOrder: p.sortOrder,
        };
        if (p.isNew) {
          return api.style.createProcess(payload).catch(function (err) {
            console.error('[process-edit] 新增工序失败:', p.processName, err);
            throw err;
          });
        } else if (p.isModified) {
          payload.id = p.id;
          return api.style.updateProcess(p.id, payload).catch(function (err) {
            console.error('[process-edit] 更新工序失败:', p.processName, err);
            throw err;
          });
        }
        return Promise.resolve();
      });
      return Promise.all(savePromises);
    }).then(function () {
      // 3. 同步更新订单的 progressWorkflowJson（向后兼容,PC端兜底读取）
      const nodes = allProcesses.map(function (p) {
        return {
          id: p.isNew ? 'proc_' + p.sortOrder : p.id,
          name: p.processName,
          processCode: p.processCode,
          progressStage: p.progressStage,
          machineType: p.machineType,
          standardTime: p.standardTime,
          unitPrice: p.price,
          difficulty: p.difficulty,
          description: p.description,
          sortOrder: p.sortOrder,
        };
      });
      const workflowJson = JSON.stringify({ nodes: nodes });
      const orderPayload = {
        id: orderId,
        progressWorkflowJson: workflowJson,
      };
      return api.production.quickEditOrder(orderPayload);
    }).then(function () {
      // 4. 保存成功后重新拉取数据验证
      return that._loadOrderAndProcesses(orderId);
    }).then(function () {
      that._deletedIds = [];
      that._newProcesses = [];
      that.setData({ hasChanges: false });
      wx.hideLoading();
      toast.success('保存成功');
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[process-edit] 保存失败:', err);
      toast.error('保存失败:' + (err && err.message ? err.message : '请重试'));
    });
  },
});