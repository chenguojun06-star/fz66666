const api = require('../../../utils/api');

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
    status: '',
    statusCn: '',
    statusClass: '',
    editable: false,
    hasChanges: false,
    stages: [],
    totalCount: 0,
    totalPrice: 0,
    modifiedCount: 0,
    processEditId: null,
    editForm: {},
    showAddModal: false,
    addForm: { stageId: '', stageName: '', processName: '', machineType: '', price: '', standardTime: '', difficulty: '中' },
    processDict: [],
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
        wx.showToast({ title: '订单不存在', icon: 'none' });
        return;
      }
      const status = order.status || '';
      const editable = EDITABLE_STATUSES.indexOf(status) !== -1;
      that.setData({
        orderId: order.id || that.data.orderId,
        orderNo: order.orderNo || that.data.orderNo,
        styleNo: order.styleNo || order.styleNumber || '',
        status: status,
        statusCn: STATUS_CN[status] || status,
        statusClass: STATUS_CLASS[status] || 'order-status--other',
        editable: editable,
      });

      const processes = that._extractProcesses(order);
      that._buildStages(processes);
      that._originalProcesses = JSON.parse(JSON.stringify(processes));
      that._deletedIds = [];
      that._newProcesses = [];
      that.setData({ loading: false });
    }).catch(function (err) {
      console.error('[process-edit] 加载订单失败:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  _extractProcesses: function (order) {
    let wf = order.progressWorkflowJson;
    if (typeof wf === 'string') {
      try { wf = JSON.parse(wf); } catch (e) { wf = null; }
    }

    // 优先从 processesByNode 读取子工序明细（含各子工序真实单价）
    // processesByNode 的 key 是父节点名（中文名或英文ID），value 是子工序数组
    const processesByNode = wf && wf.processesByNode;
    if (processesByNode && typeof processesByNode === 'object') {
      const result = [];
      Object.keys(processesByNode).forEach(function (stageKey) {
        const subList = processesByNode[stageKey];
        if (!Array.isArray(subList)) return;
        subList.forEach(function (n, i) {
          result.push({
            id: n.id || ('proc_' + stageKey + '_' + i),
            processName: n.name || n.processName || '',
            processCode: n.processCode || String(i + 1).padStart(2, '0'),
            progressStage: stageKey,
            machineType: n.machineType || '',
            standardTime: n.standardTime || 0,
            price: Number(n.unitPrice || n.price || 0),
            difficulty: n.difficulty || '',
            sortOrder: n.sortOrder != null ? n.sortOrder : i,
          });
        });
      });
      if (result.length > 0) return result;
    }

    // 回退：从 nodes（父节点汇总）读取，兼容旧格式或无子工序订单
    const nodes = (wf && wf.nodes) || [];
    return nodes.map(function (n, i) {
      return {
        id: n.id || ('proc_' + i),
        processName: n.name || '',
        processCode: n.processCode || String(i + 1).padStart(2, '0'),
        progressStage: n.progressStage || n.name || '',
        machineType: n.machineType || '',
        standardTime: n.standardTime || 0,
        price: Number(n.unitPrice || n.price || 0),
        difficulty: n.difficulty || '',
        sortOrder: n.sortOrder != null ? n.sortOrder : i,
      };
    });
  },

  _buildStages: function (processes) {
    const stageMap = {};
    STAGE_MAP.forEach(function (s) { stageMap[s.id] = { id: s.id, name: s.name, processes: [], totalPrice: 0 }; });

    processes.forEach(function (p) {
      const raw = p.progressStage || '';
      // 1. 精确匹配英文ID（如 'tailProcess', 'carSewing'）
      let stageId = stageMap[raw] ? raw : null;
      // 2. 精确匹配中文名（如 '尾部', '车缝'）
      if (!stageId) stageId = STAGE_NAME_TO_ID[raw] || null;
      // 3. 兜底归入尾部（与PC端默认规则一致）
      if (!stageId) stageId = 'tailProcess';
      p.modified = false;
      stageMap[stageId].processes.push(p);
      stageMap[stageId].totalPrice += Number(p.price || 0);
    });

    const stages = STAGE_MAP.map(function (s) {
      var st = stageMap[s.id];
      st.totalPrice = st.totalPrice.toFixed(2);
      return st;
    });
    this._recalcTotals(stages);
    this.setData({ stages: stages });
  },

  _recalcTotals: function (stages) {
    var totalCount = 0;
    var totalPrice = 0;
    var modifiedCount = 0;
    (stages || this.data.stages).forEach(function (st) {
      st.processes.forEach(function (p) {
        totalCount++;
        totalPrice += Number(p.price || 0);
        if (p.modified) modifiedCount++;
      });
    });
    this.setData({
      totalCount: totalCount,
      totalPrice: totalPrice.toFixed(2),
      modifiedCount: modifiedCount,
    });
  },

  onAddProcess: function (e) {
    const stageId = e.currentTarget.dataset.stageId;
    const stageName = e.currentTarget.dataset.stageName;
    this.setData({
      showAddModal: true,
      addForm: { stageId: stageId, stageName: stageName, processName: '', machineType: '', price: '', standardTime: '', difficulty: '中' },
    });
  },

  onCloseAddModal: function () {
    this.setData({ showAddModal: false });
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

  onConfirmAdd: function () {
    const form = this.data.addForm;
    if (!form.processName.trim()) {
      wx.showToast({ title: '请输入工序名称', icon: 'none' });
      return;
    }
    const newProcess = {
      id: 'new_' + Date.now(),
      processName: form.processName.trim(),
      processCode: String(Date.now()).slice(-4),
      progressStage: form.stageId,
      machineType: form.machineType || '',
      standardTime: parseInt(form.standardTime) || 0,
      price: parseFloat(form.price) || 0,
      difficulty: form.difficulty || '中',
      sortOrder: 999,
    };

    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].id === form.stageId) {
        stages[i].processes.push(newProcess);
        break;
      }
    }
    this._newProcesses.push(newProcess);
    this.setData({ stages: stages, showAddModal: false, hasChanges: true });
    this._recalcStageTotal(form.stageId);
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
          procs[j].modified = true;
          break;
        }
      }
    }
    // 重新计算阶段总价和全局统计
    stages.forEach(function (st) {
      var sum = 0;
      st.processes.forEach(function (p) { sum += Number(p.price || 0); });
      st.totalPrice = sum.toFixed(2);
    });
    this.setData({ stages: stages, processEditId: null, editForm: {}, hasChanges: true });
    this._recalcTotals(stages);
  },

  onDeleteProcess: function (e) {
    const id = e.currentTarget.dataset.id;
    const stageId = e.currentTarget.dataset.stageId;
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '删除后保存生效，确定删除该工序？',
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
            break;
          }
        }
        that.setData({ stages: stages, hasChanges: true });
        that._recalcStageTotal(stageId);
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
            procs[j - 1].modified = true;
            procs[j].modified = true;
            this.setData({ stages: stages, hasChanges: true });
            this._recalcTotals(stages);
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
            procs[j].modified = true;
            procs[j + 1].modified = true;
            this.setData({ stages: stages, hasChanges: true });
            this._recalcTotals(stages);
            return;
          }
        }
        break;
      }
    }
  },

  _recalcStageTotal: function (stageId) {
    const stages = this.data.stages;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].id === stageId) {
        var sum = 0;
        stages[i].processes.forEach(function (p) { sum += Number(p.price || 0); });
        stages[i].totalPrice = sum.toFixed(2);
        break;
      }
    }
    this.setData({ stages: stages });
    this._recalcTotals(stages);
  },

  onResetChanges: function () {
    const that = this;
    wx.showModal({
      title: '确认重置',
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
    const nodes = [];
    let sortOrder = 0;
    STAGE_MAP.forEach(function (stageDef) {
      for (let i = 0; i < stages.length; i++) {
        if (stages[i].id === stageDef.id) {
          stages[i].processes.forEach(function (p) {
            nodes.push({
              id: String(p.id).startsWith('new_') ? 'proc_' + sortOrder : p.id,
              name: p.processName,
              processCode: p.processCode || String(sortOrder + 1).padStart(2, '0'),
              progressStage: p.progressStage || stageDef.id,
              machineType: p.machineType || '',
              standardTime: p.standardTime || 0,
              unitPrice: p.price || 0,
              difficulty: p.difficulty || '',
              sortOrder: sortOrder,
            });
            sortOrder++;
          });
          break;
        }
      }
    });

    const workflowJson = JSON.stringify({ nodes: nodes });
    const deletedIds = that._deletedIds || [];
    const payload = {
      id: that.data.orderId,
      progressWorkflowJson: workflowJson,
      deletedIds: deletedIds,
    };

    wx.showLoading({ title: '保存中...' });
    api.production.quickEditOrder(payload).then(function () {
      wx.hideLoading();
      that._deletedIds = [];
      that._newProcesses = [];
      that.setData({ hasChanges: false });
      that._buildStages(nodes.map(function (n, _i) {
        return {
          id: n.id,
          processName: n.name,
          processCode: n.processCode,
          progressStage: n.progressStage,
          machineType: n.machineType,
          standardTime: n.standardTime,
          price: n.unitPrice,
          difficulty: n.difficulty,
          sortOrder: n.sortOrder,
        };
      }));
      that._originalProcesses = JSON.parse(JSON.stringify(nodes.map(function (n, _i) {
        return {
          id: n.id, processName: n.name, processCode: n.processCode,
          progressStage: n.progressStage, machineType: n.machineType,
          standardTime: n.standardTime, price: n.unitPrice,
          difficulty: n.difficulty, sortOrder: n.sortOrder,
        };
      })));
      wx.showToast({ title: '保存成功', icon: 'success' });
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[process-edit] 保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },
});
