/**
 * 裁剪任务处理器 - 从 scan/index.js 拆分
 *
 * 职责：裁剪任务的加载、领取、菲号生成、数据验证
 * 包含：从铃铛跳入、SKU数据获取、菲号参数构建等
 *
 * @module CuttingHandler
 * @version 1.0
 * @date 2026-02-09
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

const { eventBus } = require('../../../utils/eventBus');

/**
 * 检查是否有待处理的裁剪任务（从铃铛点击过来）
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function checkPendingCuttingTask(ctx) {
  try {
    const taskStr = wx.getStorageSync('pending_cutting_task');
    if (taskStr) {
      wx.removeStorageSync('pending_cutting_task');
      const task = JSON.parse(taskStr);
      setTimeout(() => {
        handleCuttingTaskFromBell(ctx, task);
      }, 800);
    }
  } catch (e) {
    console.error('检查裁剪任务失败:', e);
  }
}

/**
 * 处理从铃铛点击的裁剪任务
 * @param {Object} ctx - Page 上下文
 * @param {Object} task - 裁剪任务对象
 * @returns {Promise<void>} 加载完成后更新弹窗
 */
async function handleCuttingTaskFromBell(ctx, task) {
  ctx.setData({ loading: true });

  try {
    const orderNo = task.productionOrderNo || task.orderNo;
    const orderId = task.productionOrderId || task.id;

    const skuItems = await _fetchCuttingSkuItems(orderNo, task);
    const cuttingTasks = _buildCuttingTasksFromItems(skuItems);

    ctx.setData({
      scanConfirm: {
        visible: true,
        loading: false,
        remain: 30,
        detail: { orderId, orderNo, scanCode: orderNo, styleNo: task.styleNo, progressStage: '裁剪', taskId: task.id, quantity: task.orderQuantity || 0 },
        cuttingTasks: cuttingTasks,
        cuttingTaskReceived: true,
        fromMyTasks: true,
        skuList: [],
        materialPurchases: [],
      },
    });

    toast.success('已打开裁剪任务');
  } catch (e) {
    toast.error('加载裁剪任务失败');
  } finally {
    ctx.setData({ loading: false });
  }
}

/**
 * 获取裁剪任务的SKU列表
 * @param {string} orderNo - 订单号
 * @param {Object} task - 任务对象（兜底数据源）
 * @returns {Promise<Array>} SKU列表
 * @private
 */
async function _fetchCuttingSkuItems(orderNo, task) {
  try {
    const orderDetail = await api.production.orderDetailByOrderNo(orderNo);
    if (orderDetail && orderDetail.items && orderDetail.items.length > 0) {
      return orderDetail.items;
    }
    if (orderDetail && orderDetail.orderLines && orderDetail.orderLines.length > 0) {
      return orderDetail.orderLines;
    }
  } catch (_err) {
    // 获取订单详情失败，使用任务本身的颜色尺码
  }
  return [{ color: task.color, size: task.size, quantity: task.orderQuantity || 0 }];
}

/**
 * 将SKU列表转为裁剪任务格式
 * 自动拆分逗号分隔的尺码（如 "S,M,L,XL,XXL"），每个尺码独立一行
 * @param {Array} skuItems - SKU条目列表
 * @returns {Array} 裁剪任务列表
 * @private
 */
function _buildCuttingTasksFromItems(skuItems) {
  const result = [];
  for (const item of skuItems) {
    const totalQty = item.quantity || item.num || 0;
    const sizeStr = String(item.size || '').trim();
    const sizes = sizeStr.includes(',')
      ? sizeStr.split(',').map(s => s.trim()).filter(Boolean)
      : [sizeStr || '均码'];

    if (sizes.length <= 1) {
      // 单尺码，直接显示
      result.push({
        color: item.color,
        size: sizes[0],
        plannedQuantity: totalQty,
        cuttingInput: totalQty || '',
      });
    } else {
      // 多尺码拆分，每个尺码单独一行，平均分配数量
      const perSize = Math.floor(totalQty / sizes.length);
      const remainder = totalQty % sizes.length;
      for (let i = 0; i < sizes.length; i++) {
        const qty = perSize + (i < remainder ? 1 : 0);
        result.push({
          color: item.color,
          size: sizes[i],
          plannedQuantity: qty,
          cuttingInput: qty || '',
        });
      }
    }
  }
  return result;
}

/**
 * 加载我的裁剪任务列表
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 加载完成后更新任务数据
 */
async function loadMyCuttingTasks(ctx) {
  try {
    const tasks = await api.production.myCuttingTasks();
    const taskList = Array.isArray(tasks) ? tasks : [];
    ctx.setData({ 'my.cuttingTasks': taskList });
  } catch (_e) {
    // 加载失败静默处理
  }
}

/**
 * 处理裁剪任务点击（来自"我的裁剪任务"）
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {Promise<void>} 打开裁剪弹窗
 */
async function onHandleCutting(ctx, e) {
  const { taskId } = e.currentTarget.dataset;

  const task = ctx.data.my.cuttingTasks.find(t => t.id === taskId);
  if (!task) {
    toast.error('未找到裁剪任务');
    return;
  }

  ctx.setData({ loading: true });

  try {
    const orderNo = task.productionOrderNo;
    const orderId = task.productionOrderId;

    const skuItems = await _fetchCuttingSkuItems(orderNo, task);
    const cuttingTasks = _buildCuttingTasksFromItems(skuItems);

    ctx.setData({
      scanConfirm: {
        visible: true,
        loading: false,
        remain: 30,
        detail: { orderId, orderNo, scanCode: orderNo, styleNo: task.styleNo, progressStage: '裁剪', taskId, quantity: task.orderQuantity || 0 },
        cuttingTasks: cuttingTasks,
        cuttingTaskReceived: true,
        fromMyTasks: true,
        skuList: [],
        materialPurchases: [],
      },
    });
  } catch (err) {
    toast.error(err.errMsg || err.message || '加载失败');
  } finally {
    ctx.setData({ loading: false });
  }
}

/**
 * 领取裁剪任务
 * @param {Object} ctx - Page 上下文
 * @param {Object} detail - 任务详情
 * @param {Object} userInfo - 用户信息
 * @returns {Promise<void>} 领取成功后刷新列表
 */
async function receiveCuttingTask(ctx, detail, userInfo) {
  // 使用 orderNo（如 PO2026...）查询裁剪任务，而非 orderId（UUID）
  const orderNo = detail.orderNo || (detail.orderDetail && detail.orderDetail.orderNo) || '';
  if (!orderNo) {
    throw new Error('订单号缺失，无法查询裁剪任务');
  }
  const taskData = await api.production.getCuttingTaskByOrderId(orderNo);
  if (!taskData || !taskData.records || taskData.records.length === 0) {
    throw new Error('未找到裁剪任务，请确认订单已创建裁剪任务');
  }

  const task = taskData.records[0];
  await api.production.receiveCuttingTaskById(
    task.id,
    userInfo.id,
    userInfo.realName || userInfo.username,
  );

  toast.success('裁剪任务领取成功，可在"我的裁剪任务"中开始裁剪');
  ctx.setData({ 'scanConfirm.visible': false, 'scanConfirm.loading': false });
  ctx.loadMyPanel(true);
  loadMyCuttingTasks(ctx);
}

/**
 * 一键导入裁剪数量（按计划数量填充）
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onAutoImportCutting(ctx) {
  const cuttingTasks = ctx.data.scanConfirm.cuttingTasks || [];
  if (cuttingTasks.length === 0) {
    toast.error('无裁剪任务数据');
    return;
  }

  const updated = cuttingTasks.map(task => ({
    ...task,
    cuttingInput: task.plannedQuantity || 0,
  }));

  ctx.setData({ 'scanConfirm.cuttingTasks': updated });
  toast.success('已按计划数量填充');
}

/**
 * 清空裁剪数量输入
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onClearCuttingInput(ctx) {
  const cuttingTasks = ctx.data.scanConfirm.cuttingTasks || [];
  const cleared = cuttingTasks.map(task => ({ ...task, cuttingInput: 0 }));
  ctx.setData({ 'scanConfirm.cuttingTasks': cleared });
}

/**
 * 弹窗输入变更（裁剪数量）
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onModalCuttingInput(ctx, e) {
  const idx = e.currentTarget.dataset.idx;
  const val = e.detail.value;
  ctx.setData({ [`scanConfirm.cuttingTasks[${idx}].cuttingInput`]: val });
}

/**
 * 验证裁剪任务数据
 * @param {Array} cuttingTasks - 裁剪任务列表
 * @param {string} orderId - 订单ID
 * @returns {void}
 * @throws {Error} 数据验证失败
 * @private
 */
function _validateCuttingData(cuttingTasks, orderId) {
  if (!cuttingTasks || cuttingTasks.length === 0) {
    throw new Error('没有裁剪任务数据');
  }
  if (!orderId) {
    throw new Error('订单ID缺失');
  }
}

/**
 * 构建菲号生成参数
 * @param {Array} cuttingTasks - 裁剪任务列表
 * @returns {Array} 菲号生成参数列表
 * @throws {Error} 没有有效的任务数据
 * @private
 */
function _buildBundleParams(cuttingTasks) {
  const bundleParams = [];

  for (const task of cuttingTasks) {
    const inputQty = task.cuttingInput ? Number(task.cuttingInput) : 0;
    if (inputQty <= 0) {
      continue;
    }

    if (task.sizeDetails && task.sizeDetails.length > 0) {
      for (const size of task.sizeDetails) {
        if (size.quantity > 0) {
          bundleParams.push({
            color: task.color,
            size: size.size,
            quantity: size.quantity,
          });
        }
      }
    } else {
      const sizeStr = String(task.size || '').trim();

      if (sizeStr.includes(',')) {
        throw new Error(
          `颜色【${task.color}】的尺码包含逗号分隔符，请分别为每个尺码填写数量。\n` +
          `错误值：${sizeStr}\n` +
          `正确做法：在"尺码分布"中为每个尺码单独录入数量`,
        );
      }
      if (!sizeStr) {
        throw new Error(
          `颜色【${task.color}】缺少尺码信息，请填写尺码或添加尺码分布明细`,
        );
      }

      bundleParams.push({
        color: task.color,
        size: sizeStr,
        quantity: inputQty,
      });
    }
  }

  if (bundleParams.length === 0) {
    throw new Error('请至少输入一个颜色的数量');
  }

  return bundleParams;
}

/**
 * 重新生成裁剪菲号
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 生成完成后关闭弹窗并刷新
 */
async function onRegenerateCuttingBundles(ctx) {
  if (ctx.data.scanConfirm.loading) {
    return;
  }
  ctx.setData({ 'scanConfirm.loading': true });

  try {
    const detail = ctx.data.scanConfirm.detail;
    const cuttingTasks = ctx.data.scanConfirm.cuttingTasks;

    // orderId 优先取 detail.orderId，兜底从 orderDetail.id 获取
    const orderId = detail.orderId || (detail.orderDetail && detail.orderDetail.id) || '';
    _validateCuttingData(cuttingTasks, orderId);
    const bundleParams = _buildBundleParams(cuttingTasks);

    await api.production.generateCuttingBundles(orderId, bundleParams);

    toast.success('菲号生成成功');

    ctx.setData({
      'scanConfirm.visible': false,
      'scanConfirm.loading': false,
    });

    ctx.loadMyPanel(true);
    loadMyCuttingTasks(ctx);

    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
      eventBus.emit('taskStatusChanged');
    }

    const appEventBus = getApp()?.globalData?.eventBus;
    if (appEventBus && typeof appEventBus.emit === 'function') {
      appEventBus.emit('taskStatusChanged');
      appEventBus.emit('refreshBellTasks');
    }
  } catch (e) {
    toast.error(e.errMsg || e.message || '生成失败');
  } finally {
    ctx.setData({ 'scanConfirm.loading': false });
  }
}

module.exports = {
  checkPendingCuttingTask,
  handleCuttingTaskFromBell,
  loadMyCuttingTasks,
  onHandleCutting,
  receiveCuttingTask,
  onAutoImportCutting,
  onClearCuttingInput,
  onModalCuttingInput,
  onRegenerateCuttingBundles,
};
