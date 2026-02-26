/**
 * 采购任务处理器 - 从 scan/index.js 拆分
 *
 * 职责：采购任务的加载、领取、提交、验证
 * 包含：从铃铛跳入、从"我的任务"打开、到货数量提交等
 *
 * @module ProcurementHandler
 * @version 1.0
 * @date 2026-02-09
 */

const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');

const { eventBus } = require('../../../utils/eventBus');

/**
 * 将API返回值规范化为数组（兼容分页对象 { records: [...] } 和直接数组）
 * @param {*} res - API返回值
 * @returns {Array} 标准数组
 * @private
 */
function _normalizeToArray(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.records)) return res.records;
  return [];
}

function _normalizeStatus(rawStatus) {
  return String(rawStatus || '').trim().toLowerCase();
}

function _isSameReceiver(item, receiverId, receiverName) {
  const existingReceiverId = String(item.receiverId || '').trim();
  const existingReceiverName = String(item.receiverName || '').trim();
  if (receiverId && existingReceiverId) {
    return receiverId === existingReceiverId;
  }
  if (receiverName && existingReceiverName) {
    return receiverName === existingReceiverName;
  }
  return false;
}

function _shouldCallReceive(item, receiverId, receiverName) {
  if (!item) return false;
  const status = _normalizeStatus(item.status);
  if (!status) return true;
  if (status === 'completed' || status === 'cancelled') {
    return false;
  }
  if (status === 'pending') {
    return true;
  }
  if (status === 'received' || status === 'partial') {
    return !_isSameReceiver(item, receiverId, receiverName);
  }
  return false;
}

function _isActionableForUser(item, receiverId, receiverName) {
  if (!item) return false;
  const status = _normalizeStatus(item.status);
  if (!status || status === 'pending') return true;
  if (status === 'completed' || status === 'cancelled') return false;
  if (status === 'received' || status === 'partial') {
    return _isSameReceiver(item, receiverId, receiverName);
  }
  return false;
}

function _filterActionablePurchases(items, receiverId, receiverName) {
  const list = Array.isArray(items) ? items : [];
  return list.filter(item => _isActionableForUser(item, receiverId, receiverName));
}

/**
 * 检查是否有待处理的采购任务（从铃铛点击过来）
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function checkPendingProcurementTask(ctx) {
  try {
    const taskStr = wx.getStorageSync('pending_procurement_task');
    if (taskStr) {
      wx.removeStorageSync('pending_procurement_task');
      const task = JSON.parse(taskStr);
      setTimeout(() => {
        handleProcurementTaskFromBell(ctx, task);
      }, 800);
    }
  } catch (e) {
    console.error('检查采购任务失败:', e);
  }
}

/**
 * 处理从铃铛点击的采购任务
 * @param {Object} ctx - Page 上下文
 * @param {Object} task - 采购任务对象
 * @returns {Promise<void>} 加载完成后打开确认弹窗
 */
async function handleProcurementTaskFromBell(ctx, task) {
  ctx.setData({ loading: true });

  try {
    const orderNo = task.orderNo || task.productionOrderNo || '';
    const styleNo = task.styleNo || '';
    const purchaseId = task.id || task.purchaseId || '';

    const materialPurchases = await _fetchProcurementData(orderNo, purchaseId, task);
    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.realName || userInfo.username || '').trim();
    const actionablePurchases = _filterActionablePurchases(materialPurchases, receiverId, receiverName);

    if (!actionablePurchases || actionablePurchases.length === 0) {
      const baseMsg = orderNo ? `未找到订单【${orderNo}】的采购单` : '未找到采购单';
      toast.error(baseMsg + '\n\n可能的原因：\n1. 采购任务已完成\n2. 采购任务已被他人领取\n3. 采购任务已被删除\n\n请返回刷新任务列表后重试');
      return;
    }

    ctx.showConfirmModal({
      isProcurement: true,
      materialPurchases: actionablePurchases,
      orderNo: task.orderNo || actionablePurchases[0].orderNo || 'unknown',
      styleNo: styleNo || actionablePurchases[0].styleNo || '',
      progressStage: '采购',
      fromMyTasks: true,
    });

    toast.success('已打开采购任务');
  } catch (e) {
    toast.error(e.errMsg || e.message || '加载采购任务失败');
  } finally {
    ctx.setData({ loading: false });
  }
}

/**
 * 获取采购单数据（先按订单号查，再用任务本身兜底）
 * @param {string} orderNo - 订单号
 * @param {string} purchaseId - 采购单ID
 * @param {Object} task - 原始任务对象
 * @returns {Promise<Array>} 采购单列表
 * @private
 */
async function _fetchProcurementData(orderNo, purchaseId, task) {
  if (orderNo) {
    try {
      const res = await api.production.getMaterialPurchases({ orderNo });
      // 兼容：API可能返回数组或分页对象 { records: [...] }
      const list = _normalizeToArray(res);
      if (list.length > 0) { return list; }
    } catch (_err) {
      // 方案1失败，继续方案2
    }
  }

  if (purchaseId) {
    if (!task.orderNo && task.orderId) {
      try {
        const orderInfo = await api.production.orderDetail(task.orderId);
        if (orderInfo && orderInfo.orderNo) {
          task.orderNo = orderInfo.orderNo;
          task.styleNo = orderInfo.styleNo || task.styleNo;
        }
      } catch (_err) {
        // 获取订单信息失败，不影响主流程
      }
    }
    return [task];
  }

  return [];
}

/**
 * 加载我的采购任务列表
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 加载完成后更新任务数据
 */
async function loadMyProcurementTasks(ctx) {
  try {
    const tasks = await api.production.myProcurementTasks();

    const grouped = {};
    if (Array.isArray(tasks) && tasks.length > 0) {
      tasks.forEach(task => {
        const orderNo = task.orderNo || '未知订单';
        if (!grouped[orderNo]) {
          grouped[orderNo] = {
            orderNo: orderNo,
            styleNo: task.styleNo,
            styleName: task.styleName,
            totalCount: 0,
            items: [],
          };
        }
        grouped[orderNo].totalCount++;
        grouped[orderNo].items.push(task);
      });
    }

    ctx.setData({
      'my.procurementTasks': Object.values(grouped),
    });
  } catch (_e) {
    // 加载失败静默处理
  }
}

/**
 * 处理采购任务点击 (来自"我的采购任务"或"扫码记录")
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {Promise<void>} 加载采购单并打开弹窗
 */
async function onHandleProcurement(ctx, e) {
  const { orderNo, groupId, recordIdx } = e.currentTarget.dataset;

  let materialPurchases = [];
  let targetOrderNo = orderNo;
  let styleNo = '';

  ctx.setData({ loading: true });

  try {
    if (orderNo) {
      const task = ctx.data.my.procurementTasks.find(t => t.orderNo === orderNo);
      if (task) {
        styleNo = task.styleNo;
      }

      const res = await api.production.getMaterialPurchases({ orderNo });
      materialPurchases = _normalizeToArray(res);
    } else if (groupId && recordIdx !== undefined) {
      const group = ctx.data.my.groupedHistory.find(g => g.id === groupId);
      if (group && group.items[recordIdx]) {
        const record = group.items[recordIdx];
        targetOrderNo = record.orderNo;
        styleNo = record.styleNo;

        const res = await api.production.getMaterialPurchases({ orderNo: targetOrderNo });
        materialPurchases = _normalizeToArray(res);
      }
    }

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.realName || userInfo.username || '').trim();
    const actionablePurchases = _filterActionablePurchases(materialPurchases, receiverId, receiverName);

    if (!actionablePurchases || actionablePurchases.length === 0) {
      toast.error('未找到采购单');
      return;
    }

    ctx.showConfirmModal({
      isProcurement: true,
      materialPurchases: actionablePurchases,
      orderNo: targetOrderNo,
      styleNo: styleNo,
      progressStage: '采购',
      fromMyTasks: true,
    });
  } catch (_e) {
    toast.error('加载失败');
  } finally {
    ctx.setData({ loading: false });
  }
}

/**
 * 面料采购数量输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onMaterialInput(ctx, e) {
  const id = e.currentTarget.dataset.id;
  const value = e.detail.value;

  const materialPurchases = ctx.data.scanConfirm.materialPurchases.map(item => {
    if (item.id === id) {
      return { ...item, inputQuantity: value };
    }
    return item;
  });

  ctx.setData({ 'scanConfirm.materialPurchases': materialPurchases });
}

/**
 * 面料采购备注输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onMaterialRemarkInput(ctx, e) {
  const id = e.currentTarget.dataset.id;
  const value = e.detail.value;

  const materialPurchases = ctx.data.scanConfirm.materialPurchases.map(item => {
    if (item.id === id) {
      return { ...item, remarkInput: value };
    }
    return item;
  });

  ctx.setData({ 'scanConfirm.materialPurchases': materialPurchases });
}

/**
 * 领取采购任务
 * @param {Object} ctx - Page 上下文
 * @param {Object} userInfo - 用户信息
 * @returns {Promise<void>} 领取成功后刷新列表
 */
async function receiveProcurementTask(ctx, userInfo) {
  const materialPurchases = ctx.data.scanConfirm.materialPurchases || [];
  if (materialPurchases.length === 0) {
    throw new Error('暂无面料采购单');
  }

  const receiverId = String(
    userInfo?.id || userInfo?.userId || ''
  ).trim();
  const receiverName = String(
    userInfo?.realName || userInfo?.username || userInfo?.name || userInfo?.nickName || ''
  ).trim();

  if (!receiverId && !receiverName) {
    throw new Error('领取人信息缺失，请重新登录后再试');
  }

  const updates = materialPurchases
    .filter(item => _shouldCallReceive(item, receiverId, receiverName))
    .map(item => ({
      purchaseId: item.id || item.purchaseId,
      receiverId,
      receiverName,
    }))
    .filter(item => !!item.purchaseId);

  if (updates.length === 0) {
    toast.success('当前采购任务均已领取或已完成');
    ctx.setData({ 'scanConfirm.visible': false, 'scanConfirm.loading': false });
    ctx.loadMyPanel(true);
    loadMyProcurementTasks(ctx);
    return;
  }

  await Promise.all(updates.map(update => api.production.receivePurchase(update)));
  toast.success(`已领取 ${updates.length} 个面料采购任务`);
  ctx.setData({ 'scanConfirm.visible': false, 'scanConfirm.loading': false });
  ctx.loadMyPanel(true);
  loadMyProcurementTasks(ctx);
}

/**
 * 提交采购任务（来自"我的任务"列表，只更新到货数量）
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 提交成功后关闭弹窗并刷新
 */
async function onSubmitProcurement(ctx) {
  if (ctx.data.scanConfirm.loading) {
    toast.warning('正在提交中，请勿重复操作');
    return;
  }

  const materialPurchases = ctx.data.scanConfirm.materialPurchases || [];

  if (!materialPurchases || materialPurchases.length === 0) {
    toast.error('无采购数据，请刷新后重试');
    return;
  }

  const hasInput = materialPurchases.some(item => Number(item.inputQuantity) > 0);
  if (!hasInput) {
    toast.error('请至少输入一个到货数量');
    return;
  }

  ctx.setData({ 'scanConfirm.loading': true });
  wx.showLoading({ title: '提交中...', mask: true });

  try {
    const updates = _buildProcurementUpdatesOnly(materialPurchases);

    if (updates.length === 0) {
      wx.hideLoading();
      toast.warning('无需更新的数据');
      ctx.setData({ 'scanConfirm.loading': false });
      return;
    }

    await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));
    wx.hideLoading();

    toast.success(`✓ 提交成功！已更新${updates.length}条采购记录`);
    ctx.setData({ 'scanConfirm.visible': false, 'scanConfirm.loading': false });
    ctx.loadMyPanel(true);
    loadMyProcurementTasks(ctx);

    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH', { type: 'procurement' });
    }
  } catch (e) {
    wx.hideLoading();
    toast.error(_formatProcurementError(e));
    ctx.setData({ 'scanConfirm.loading': false });
  }
}

/**
 * 构建采购更新列表（仅更新数量，不领取）
 * @param {Array} materialPurchases - 采购单列表
 * @returns {Array} 更新列表
 * @throws {Error} 无有效数据时抛出
 * @private
 */
function _buildProcurementUpdatesOnly(materialPurchases) {
  const updates = [];

  for (const item of materialPurchases) {
    const inputQty = Number(item.inputQuantity);
    if (inputQty > 0) {
      const newArrived = (Number(item.arrivedQuantity) || 0) + inputQty;
      const remark = _validateProcurementArrival(item, inputQty, newArrived);

      updates.push({
        id: item.id,
        arrivedQuantity: newArrived,
        remark: remark,
      });
    }
  }

  if (updates.length === 0) {
    throw new Error('请至少填写一项到货数量');
  }

  return updates;
}

/**
 * 验证采购到货数量（70%检查）
 * @param {Object} item - 采购项
 * @param {number} inputQty - 输入数量
 * @param {number} newArrived - 新到货总量
 * @returns {string} 备注内容
 * @private
 */
function _validateProcurementArrival(item, inputQty, newArrived) {
  const purchaseQty = Number(item.purchaseQuantity) || 0;
  const remark = (item.remarkInput || '').trim();

  if (purchaseQty > 0 && newArrived * 100 < purchaseQty * 70) {
    const arrivalRate = ((newArrived / purchaseQty) * 100).toFixed(1);
    const shortageQty = Math.ceil(purchaseQty * 0.7 - newArrived);

    if (!remark) {
      throw new Error(
        `到货不足提醒\n\n` +
        `物料名称：${item.materialName || '未知'}\n` +
        `采购数量：${purchaseQty}\n` +
        `实际到货：${newArrived}（${arrivalRate}%）\n` +
        `最低要求：${Math.ceil(purchaseQty * 0.7)}（70%）\n` +
        `还需到货：${shortageQty}\n\n` +
        `请在备注栏填写原因（如供应商延迟、分批到货等）`,
      );
    }
  }

  return remark;
}

/**
 * 构建采购更新数据（领取 + 更新到货数量）
 * @param {Array} materialPurchases - 采购单列表
 * @returns {Object} 领取和更新数据
 * @private
 */
function _buildProcurementUpdates(materialPurchases) {
  const receives = [];
  const updates = [];
  const userInfo = getUserInfo();
  const receiverName = (userInfo.realName || userInfo.username || '').trim();
  const receiverId = String(userInfo.id || userInfo.userId || '').trim();

  for (const item of materialPurchases) {
    if (!_isActionableForUser(item, receiverId, receiverName)) {
      continue;
    }

    if (_shouldCallReceive(item, receiverId, receiverName)) {
      receives.push({
        purchaseId: item.id,
        receiverId,
        receiverName,
      });
    }

    const inputQty = Number(item.inputQuantity);
    if (inputQty > 0) {
      const newArrived = (Number(item.arrivedQuantity) || 0) + inputQty;
      const remark = _validateProcurementArrival(item, inputQty, newArrived);

      updates.push({
        id: item.id,
        arrivedQuantity: newArrived,
        remark: remark,
      });
    }
  }

  return { receives, updates };
}

/**
 * 执行采购提交（领取 + 更新数量）
 * @param {Array} receives - 领取数据列表
 * @param {Array} updates - 更新数据列表
 * @returns {Promise<void>} 执行完成
 * @private
 */
async function _executeProcurementSubmit(receives, updates) {
  if (receives.length > 0) {
    try {
      await Promise.all(receives.map(r => api.production.receivePurchase(r)));
    } catch (err) {
      const rawMessage = _extractProcurementErrorText(err);
      const friendlyMessage = _mapProcurementBusinessError(rawMessage);
      throw new Error('领取任务失败：' + friendlyMessage);
    }
  }

  if (updates.length > 0) {
    try {
      await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));
    } catch (err) {
      const rawMessage = _extractProcurementErrorText(err);
      const friendlyMessage = _mapProcurementBusinessError(rawMessage);
      if (receives.length > 0) {
        throw new Error('任务已领取，但更新数量失败：' + friendlyMessage);
      }
      throw new Error('提交数据失败：' + friendlyMessage);
    }
  }
}

function _extractProcurementErrorText(err) {
  if (!err) return '';
  const candidates = [
    err.message,
    err.errMsg,
    err.data && err.data.message,
    err.data && err.data.msg,
    err.resp && err.resp.message,
    err.resp && err.resp.msg,
    err.raw && err.raw.errMsg,
  ];
  for (const item of candidates) {
    if (item !== null && item !== undefined && String(item).trim()) {
      return String(item).trim();
    }
  }
  return '';
}

function _mapProcurementBusinessError(message) {
  const text = String(message || '').trim();
  if (!text) return '网络或服务器错误，请稍后重试';

  if (text.includes('已被') && text.includes('领取')) {
    return '该任务已被他人领取，请刷新列表后继续处理';
  }
  if (text.includes('已领取') && text.includes('其他')) {
    return '该任务已被他人领取，请刷新列表后继续处理';
  }
  if (
    text.includes('已完成') ||
    text.includes('completed') ||
    text.includes('已结束') ||
    text.includes('cancelled') ||
    text.includes('已取消')
  ) {
    return '该任务已完成或已取消，请刷新列表';
  }
  if (text.includes('不存在')) {
    return '该任务不存在，可能已被删除，请刷新列表';
  }
  if (text.includes('参数') || text.includes('不能为空')) {
    return '提交参数不完整，请刷新后重试';
  }
  if (text.includes('权限') || text.includes('无权')) {
    return '没有操作权限，请联系管理员';
  }
  if (text.includes('超时')) {
    return '请求超时，请重试';
  }
  if (text.includes('network') || text.includes('request:fail') || text.includes('网络')) {
    return '网络连接失败，请检查网络后重试';
  }

  return text;
}

/**
 * 处理采购任务提交（领取 + 更新到货数量）
 * @param {Object} ctx - Page 上下文
 * @param {Object} params - 提交参数
 * @param {Array} params.materialPurchases - 采购单列表
 * @returns {Promise<void>} 提交完成后刷新列表
 */
async function processProcurementSubmit(ctx, { materialPurchases }) {
  const { receives, updates } = _buildProcurementUpdates(materialPurchases);
  await _executeProcurementSubmit(receives, updates);

  toast.success('提交成功');
  ctx.loadMyPanel(true);
  loadMyProcurementTasks(ctx);
}

/**
 * 验证采购提交数据
 * @returns {Object} 用户信息对象
 * @throws {Error} 未登录或用户信息不完整时抛出
 */
function validateProcurementData() {
  const userInfo = getUserInfo();
  if (!userInfo || !userInfo.id) {
    throw new Error('请先登录');
  }
  const receiverName = userInfo.realName || userInfo.username;
  if (!receiverName) {
    throw new Error('用户信息不完整(无姓名)');
  }
  return { userInfo, receiverName };
}

/**
 * 格式化采购提交错误消息
 * @param {Error} e - 错误对象
 * @returns {string} 用户友好的错误消息
 * @private
 */
function _formatProcurementError(e) {
  const message = _extractProcurementErrorText(e);
  if (!message) return '提交失败';
  return _mapProcurementBusinessError(message);
}

module.exports = {
  checkPendingProcurementTask,
  handleProcurementTaskFromBell,
  loadMyProcurementTasks,
  onHandleProcurement,
  onMaterialInput,
  onMaterialRemarkInput,
  receiveProcurementTask,
  onSubmitProcurement,
  processProcurementSubmit,
  validateProcurementData,
};
