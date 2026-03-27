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

const ENABLE_CUTTING_BOM_LOOKUP = false;

// ==================== 配比面板核心算法 ====================

/**
 * 根据当前配比数据重新计算所有派生值（与PC端 useMemo 算法完全一致）
 * @param {Object} data - 当前 cuttingRatio 状态
 * @returns {Object} 更新后的完整配比状态
 */
function _computeRatioData(data) {
  const rows = data.ratioRows || [];
  const totalQty = Number(data.totalQty) || 0;
  const piecesPerBundle = Number(data.piecesPerBundle) || 0;
  const sizeUsageMap = data.sizeUsageMap || {};
  const hasUsageMap = Object.keys(sizeUsageMap).length > 0;

  const totalRatio = rows.reduce((s, r) => s + (Number(r.ratio) || 0), 0);
  const baseCount = (totalRatio > 0 && totalQty > 0) ? Math.ceil(totalQty / totalRatio) : 0;

  let actualTotal = 0;
  let consumedFabric = 0;
  let totalBundles = 0;

  const updatedRows = rows.map(r => {
    const ratio = Number(r.ratio) || 0;
    const qty = ratio * baseCount;
    const sizeBundles = (piecesPerBundle > 0 && qty > 0) ? Math.ceil(qty / piecesPerBundle) : 0;
    actualTotal += qty;
    if (hasUsageMap && sizeUsageMap[r.size] != null) {
      consumedFabric += qty * Number(sizeUsageMap[r.size]);
    }
    if (piecesPerBundle > 0) totalBundles += sizeBundles;
    const row = { ...r, qty, sizeBundles };
    if (hasUsageMap) {
      const u = sizeUsageMap[r.size];
      row.usage = (u != null) ? Number(u).toFixed(2) : '-';
    }
    return row;
  });

  if (!piecesPerBundle) totalBundles = baseCount;

  const arrived = Number(data.arrivedFabric) || 0;
  const consumed = Math.round(consumedFabric * 100) / 100;
  const fabricOk = arrived <= 0 || consumed <= arrived;

  return {
    ...data,
    ratioRows: updatedRows,
    hasUsageMap,
    totalRatio,
    bundles: totalBundles,
    actualTotal,
    consumedFabric: consumed > 0 ? consumed.toFixed(2) : '0',
    fabricOk,
  };
}

/**
 * 从 SKU列表 + 任务对象构建初始配比面板状态（同步）
 * @param {Array} skuItems - 订单SKU条目
 * @param {Object} task - 任务/订单对象（兜底颜色/件数）
 * @returns {Object} 完整的 cuttingRatio 初始状态
 */
function buildCuttingRatioState(skuItems, task) {
  const items = (Array.isArray(skuItems) && skuItems.length > 0)
    ? skuItems
    : [{ color: (task && task.color) || '', size: (task && task.size) || '均码', quantity: (task && (task.orderQuantity || task.quantity)) || 0 }];

  const colorSizeMap = new Map();
  let firstColor = '';
  for (const item of items) {
    const color = String(item.color || '').trim() || '默认色';
    const sizeStr = String(item.size || '').trim();
    const qty = Number(item.quantity || item.num || 0);
    const sizes = sizeStr.includes(',')
      ? sizeStr.split(',').map(s => s.trim()).filter(Boolean)
      : [sizeStr || '均码'];
    if (!firstColor) firstColor = color;
    for (const size of sizes) {
      const key = color + '|' + size;
      const prev = colorSizeMap.get(key) || { color, size, qty: 0 };
      const perSize = sizes.length > 1 ? Math.round(qty / sizes.length) : qty;
      colorSizeMap.set(key, { color, size, qty: prev.qty + perSize });
    }
  }

  const allEntries = Array.from(colorSizeMap.values());
  const targetColor = (task && (task.color || task.orderColor)) || firstColor;
  const colorEntries = allEntries.filter(e => e.color === targetColor);
  const rowEntries = colorEntries.length > 0 ? colorEntries : allEntries;

  const totalQty = rowEntries.reduce((s, e) => s + e.qty, 0)
    || Number((task && (task.orderQuantity || task.quantity)) || 0);
  const ratioRows = rowEntries.map(e => ({ size: e.size, ratio: 1, qty: 0, sizeBundles: 0 }));

  return _computeRatioData({
    color: targetColor || firstColor,
    totalQty,
    arrivedFabric: '',
    piecesPerBundle: '',
    sizeUsageMap: {},
    hasUsageMap: false,
    ratioRows,
    totalRatio: 0,
    bundles: 0,
    actualTotal: 0,
    consumedFabric: '0',
    fabricOk: true,
  });
}

/**
 * 异步从BOM获取纸样用量并更新 cuttingRatio（可选，失败静默）
 * @param {Object} ctx - Page 上下文
 * @param {string} styleNo - 款式编号
 */
async function fetchBomAndUpdate(ctx, styleNo) {
  if (!ENABLE_CUTTING_BOM_LOOKUP) return;
  if (!styleNo) return;
  try {
    const res = await api.style.getBomList({ styleNo, pageSize: 50 });
    const list = Array.isArray(res) ? res : ((res && res.records) ? res.records : []);
    const fabricBom = list.find(
      b => String(b.materialType || '').toLowerCase().includes('fabric') && b.sizeUsageMap,
    );
    if (!fabricBom || !fabricBom.sizeUsageMap) return;
    const raw = typeof fabricBom.sizeUsageMap === 'string'
      ? JSON.parse(fabricBom.sizeUsageMap)
      : fabricBom.sizeUsageMap;
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      if (!isNaN(n) && n > 0) clean[k] = n;
    }
    if (!Object.keys(clean).length) return;
    const curr = ctx.data.scanConfirm && ctx.data.scanConfirm.cuttingRatio;
    if (!curr) return;
    ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, sizeUsageMap: clean }) });
  } catch (_) {
    // BOM 纸样用量是可选功能，失败静默处理
  }
}

/**
 * 从配比面板状态构建菲号生成参数（与PC端 handleConfirm 逻辑一致）
 * @param {Object} cuttingRatio - 当前配比状态
 * @returns {Array} bundleParams [{ color, size, quantity }]
 */
function _buildBundleParamsFromRatio(cuttingRatio) {
  if (!cuttingRatio || !cuttingRatio.ratioRows) {
    throw new Error('裁剪配比数据缺失');
  }
  const color = String(cuttingRatio.color || '').trim();
  const piecesPerBundle = Number(cuttingRatio.piecesPerBundle) || 0;
  const bundleParams = [];
  for (const r of cuttingRatio.ratioRows) {
    const size = String(r.size || '').trim();
    const qty = Number(r.qty) || 0;
    if (!size || qty <= 0) continue;
    if (piecesPerBundle > 0) {
      for (const chunkQty of _splitIntoChunks(qty, piecesPerBundle)) {
        bundleParams.push({ color, size, quantity: chunkQty });
      }
    } else {
      bundleParams.push({ color, size, quantity: qty });
    }
  }
  if (bundleParams.length === 0) {
    throw new Error('没有有效的裁剪数量，请检查配比设置后重试');
  }
  return bundleParams;
}

// ==================== 配比面板事件处理器 ====================

function onCuttingTotalQtyInput(ctx, e) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr) return;
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, totalQty: Number(e.detail.value) || 0 }) });
}

function onCuttingArrivedFabricInput(ctx, e) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr) return;
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, arrivedFabric: e.detail.value }) });
}

function onCuttingPiecesPerBundleInput(ctx, e) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr) return;
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, piecesPerBundle: e.detail.value }) });
}

function onCuttingRatioInput(ctx, e) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr) return;
  const idx = Number(e.currentTarget.dataset.idx);
  const rows = curr.ratioRows.map((r, i) => i === idx ? { ...r, ratio: Number(e.detail.value) || 0 } : r);
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, ratioRows: rows }) });
}

function onCuttingSizeInput(ctx, e) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr) return;
  const idx = Number(e.currentTarget.dataset.idx);
  const rows = curr.ratioRows.map((r, i) => i === idx ? { ...r, size: String(e.detail.value || '') } : r);
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, ratioRows: rows }) });
}

function onCuttingAddRow(ctx) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr) return;
  const rows = [...curr.ratioRows, { size: '', ratio: 1, qty: 0, sizeBundles: 0 }];
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, ratioRows: rows }) });
}

function onCuttingRemoveRow(ctx, e) {
  const curr = ctx.data.scanConfirm.cuttingRatio;
  if (!curr || curr.ratioRows.length <= 1) return;
  const idx = Number(e.currentTarget.dataset.idx);
  const rows = curr.ratioRows.filter((_, i) => i !== idx);
  ctx.setData({ 'scanConfirm.cuttingRatio': _computeRatioData({ ...curr, ratioRows: rows }) });
}

// ==================== 状态管理辅助 ====================

function _normalizeCuttingStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function _isSameCuttingReceiver(task, receiverId, receiverName) {
  const existingReceiverId = String(task.receiverId || '').trim();
  const existingReceiverName = String(task.receiverName || '').trim();
  if (receiverId && existingReceiverId) {
    return receiverId === existingReceiverId;
  }
  if (receiverName && existingReceiverName) {
    return receiverName === existingReceiverName;
  }
  return false;
}

function _pickActionableCuttingTask(records, receiverId, receiverName) {
  const taskList = Array.isArray(records) ? records : [];
  const actionable = taskList.filter(task => {
    const status = _normalizeCuttingStatus(task.status);
    if (!status || status === 'pending') return true;
    if (status === 'received') {
      return _isSameCuttingReceiver(task, receiverId, receiverName);
    }
    return false;
  });

  const sameReceiverTask = actionable.find(task => _normalizeCuttingStatus(task.status) === 'received');
  return sameReceiverTask || actionable[0] || null;
}

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
      }, 300);
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
    const cuttingRatio = buildCuttingRatioState(skuItems, {
      ...task,
      orderQuantity: task.orderQuantity || 0,
    });

    ctx.setData({
      scanConfirm: {
        visible: true,
        loading: false,
        detail: { orderId, orderNo, scanCode: orderNo, styleNo: task.styleNo, progressStage: '裁剪', taskId: task.id, quantity: task.orderQuantity || 0 },
        cuttingRatio: cuttingRatio,
        cuttingTasks: [],
        cuttingTaskReceived: true,
        fromMyTasks: true,
        skuList: [],
        materialPurchases: [],
      },
    });

    // 异步加载BOM纸样用量（成功则自动更新面板）
    fetchBomAndUpdate(ctx, task.styleNo);
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
    const cuttingRatio = buildCuttingRatioState(skuItems, {
      ...task,
      orderQuantity: task.orderQuantity || 0,
    });

    ctx.setData({
      scanConfirm: {
        visible: true,
        loading: false,
        detail: { orderId, orderNo, scanCode: orderNo, styleNo: task.styleNo, progressStage: '裁剪', taskId, quantity: task.orderQuantity || 0 },
        cuttingRatio: cuttingRatio,
        cuttingTasks: [],
        cuttingTaskReceived: true,
        fromMyTasks: true,
        skuList: [],
        materialPurchases: [],
      },
    });

    // 异步加载BOM纸样用量
    fetchBomAndUpdate(ctx, task.styleNo);
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

  const receiverId = String(userInfo.id || userInfo.userId || '').trim();
  const receiverName = String(userInfo.name || userInfo.username || '').trim();
  const task = _pickActionableCuttingTask(taskData.records, receiverId, receiverName);

  if (!task) {
    throw new Error('当前裁剪任务已完成或已被他人领取，请刷新后重试');
  }

  await api.production.receiveCuttingTaskById(
    task.id,
    receiverId,
    receiverName,
  );

  toast.success('裁剪任务领取成功，请继续确认并生成裁剪单');
  // 不要关闭弹窗！将状态直接转换为"提交模式"，实现连贯操作
  ctx.setData({
    'scanConfirm.loading': false,
    'scanConfirm.fromMyTasks': true,
    'scanConfirm.cuttingTaskReceived': true
  });
  ctx.loadMyPanel(true);
  loadMyCuttingTasks(ctx);
}

/**
 * 一键导入裁剪数量（按计划数量填充，并前端预拆分为多行显示）
 * 与PC端 splitQuantity 逻辑对齐，让用户看到实际会生成的菲号数量
 * 例：100件 → [20,20,20,20,20] 显示5行，每行20件
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onAutoImportCutting(ctx) {
  const cuttingTasks = ctx.data.scanConfirm.cuttingTasks || [];
  if (cuttingTasks.length === 0) {
    toast.error('无裁剪任务数据');
    return;
  }

  const PER_BUNDLE = 20; // 每菲件数
  const updated = [];

  for (const task of cuttingTasks) {
    const plannedQty = Number(task.plannedQuantity || 0);

    if (plannedQty <= 0) {
      continue; // 跳过0数量
    }

    // ✅ 前端拆分显示（与PC端保持一致）
    const chunks = _splitIntoChunks(plannedQty, PER_BUNDLE);
    for (const qty of chunks) {
      updated.push({
        ...task,
        plannedQuantity: qty,  // 单行菲号的计划数量
        cuttingInput: qty,    // 填充为单行数量
      });
    }
  }

  if (updated.length === 0) {
    toast.error('所有任务数量均为0');
    return;
  }

  ctx.setData({ 'scanConfirm.cuttingTasks': updated });

  // ℹ️ 向用户展示最终会生成多少条菲号
  const bundleCount = updated.length;
  const totalQty = updated.reduce((sum, t) => sum + (t.cuttingInput || 0), 0);
  toast.success(`已按每菲20件拆分，共生成${bundleCount}条菲号（合计${totalQty}件）`);
}

/**
 * 清空裁剪输入（配比面板回到初始ratio=1状态）
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onClearCuttingInput(ctx) {
  const cuttingRatio = ctx.data.scanConfirm.cuttingRatio;
  if (cuttingRatio) {
    const resetRows = cuttingRatio.ratioRows.map(r => ({ ...r, ratio: 1 }));
    const updated = _computeRatioData({
      ...cuttingRatio,
      ratioRows: resetRows,
      arrivedFabric: '',
      piecesPerBundle: '',
    });
    ctx.setData({ 'scanConfirm.cuttingRatio': updated });
  }
  // 旧模型兼容（以防旧数据遗留）
  const cuttingTasks = ctx.data.scanConfirm.cuttingTasks || [];
  if (cuttingTasks.length > 0) {
    ctx.setData({ 'scanConfirm.cuttingTasks': cuttingTasks.map(t => ({ ...t, cuttingInput: 0 })) });
  }
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
 * 将数量按每菲件数拆分为数组
 * 例：qty=100, perBundle=20 → [20,20,20,20,20]
 * @param {number} qty - 总件数
 * @param {number} perBundle - 每菲件数（默认20）
 * @returns {number[]}
 * @private
 */
function _splitIntoChunks(qty, perBundle) {
  const per = Math.max(1, perBundle || 20);
  const chunks = [];
  let remain = Math.max(0, qty);
  while (remain > 0) {
    chunks.push(Math.min(per, remain));
    remain -= per;
  }
  return chunks;
}

/**
 * 构建菲号生成参数（每菲最多 PER_BUNDLE 件，与PC端 splitQuantity 逻辑对齐）
 * @param {Array} cuttingTasks - 裁剪任务列表
 * @returns {Array} 菲号生成参数列表
 * @throws {Error} 没有有效的任务数据
 * @private
 */
const PER_BUNDLE = 20; // 每菲件数，与 PC 端保持一致

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
          for (const qty of _splitIntoChunks(size.quantity, PER_BUNDLE)) {
            bundleParams.push({
              color: task.color,
              size: size.size,
              quantity: qty,
            });
          }
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

      for (const qty of _splitIntoChunks(inputQty, PER_BUNDLE)) {
        bundleParams.push({
          color: task.color,
          size: sizeStr,
          quantity: qty,
        });
      }
    }
  }

  if (bundleParams.length === 0) {
    throw new Error('请至少输入一个颜色的数量');
  }

  return bundleParams;
}

/**
 * 确认生成菲号（优先使用配比面板模型，兼容旧模型）
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 生成完成后关闭弹窗并刷新
 */
async function onRegenerateCuttingBundles(ctx) {
  if (ctx.data.scanConfirm.loading) return;
  ctx.setData({ 'scanConfirm.loading': true });

  try {
    const detail = ctx.data.scanConfirm.detail;
    const orderId = detail.orderId || (detail.orderDetail && detail.orderDetail.id) || '';
    if (!orderId) throw new Error('订单ID缺失');

    // ★ 优先使用新配比面板模型
    const cuttingRatio = ctx.data.scanConfirm.cuttingRatio;
    let bundleParams;
    if (cuttingRatio && cuttingRatio.ratioRows && cuttingRatio.ratioRows.length > 0) {
      bundleParams = _buildBundleParamsFromRatio(cuttingRatio);
    } else {
      // 兜底旧模型
      const cuttingTasks = ctx.data.scanConfirm.cuttingTasks || [];
      _validateCuttingData(cuttingTasks, orderId);
      bundleParams = _buildBundleParams(cuttingTasks);
    }

    await api.production.generateCuttingBundles(orderId, bundleParams);

    toast.success('菲号生成成功');
    ctx.setData({ 'scanConfirm.visible': false, 'scanConfirm.loading': false });
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
  // 配比面板状态构建（供 ConfirmModalHandler 调用）
  buildCuttingRatioState,
  fetchBomAndUpdate,
  // 任务加载与领取
  checkPendingCuttingTask,
  handleCuttingTaskFromBell,
  loadMyCuttingTasks,
  onHandleCutting,
  receiveCuttingTask,
  // 配比面板事件处理器（新增）
  onCuttingTotalQtyInput,
  onCuttingArrivedFabricInput,
  onCuttingPiecesPerBundleInput,
  onCuttingRatioInput,
  onCuttingSizeInput,
  onCuttingAddRow,
  onCuttingRemoveRow,
  // 提交 / 清空
  onClearCuttingInput,
  onRegenerateCuttingBundles,
  // 旧版（向下兼容保留）
  onAutoImportCutting,
  onModalCuttingInput,
};
