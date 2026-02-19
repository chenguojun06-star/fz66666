/**
 * 样板生产 Handler
 * 从 scan/index.js 抽取，处理样板确认弹窗及提交逻辑
 */
const toast = require('../../../utils/uiHelper').toast;

const OPERATION_LABELS = {
  RECEIVE: '领取样板',
  PLATE: '车板扫码',
  FOLLOW_UP: '跟单确认',
  COMPLETE: '完成确认',
  WAREHOUSE_IN: '样衣入库',
  WAREHOUSE_OUT: '样衣出库',
  WAREHOUSE_RETURN: '样衣归还',
};

const WAREHOUSE_OPERATIONS = new Set(['WAREHOUSE_IN', 'WAREHOUSE_OUT', 'WAREHOUSE_RETURN']);

function getExecutableOperations(patternConfirm) {
  const options = Array.isArray(patternConfirm.operationOptions)
    ? patternConfirm.operationOptions
    : [];
  return options
    .map(item => ({
      value: item && item.value,
      label: item && item.label,
    }))
    .filter(item => !!item.value);
}

function normalizePositiveInt(value, fallback = 1) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

/**
 * 显示样板确认弹窗
 * @param {Object} page - 页面实例
 * @param {Object} data - 样板扫码数据
 * @returns {void}
 */
function showPatternConfirmModal(page, data) {
  const patternDetail = data.patternDetail || {};
  const operationOptions = Array.isArray(data.operationOptions) ? data.operationOptions : [];
  const defaultOption = operationOptions.find(item => item.value === data.operationType) || operationOptions[0] || null;
  const operationType = defaultOption ? defaultOption.value : data.operationType;
  const operationLabel = defaultOption
    ? defaultOption.label
    : (OPERATION_LABELS[operationType] || data.operationLabel || '操作');
  const confirmedQty = normalizePositiveInt(data.quantity, 1);
  page.setData({
    patternConfirm: {
      visible: true,
      loading: false,
      patternId: data.patternId,
      styleNo: data.styleNo,
      color: data.color,
      quantity: confirmedQty,
      warehouseCode: '',
      status: data.status,
      operationType,
      operationLabel,
      operationOptions,
      designer: data.designer || patternDetail.designer || '-',
      patternDeveloper: data.patternDeveloper || patternDetail.patternDeveloper || '-',
      deliveryTime: patternDetail.deliveryTime || '-',
      patternDetail: patternDetail,
      remark: '',
    },
  });
}

/**
 * 样板数量输入
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onPatternQuantityInput(page, e) {
  page.setData({ 'patternConfirm.quantity': e.detail.value });
}

function onPatternWarehouseInput(page, e) {
  page.setData({ 'patternConfirm.warehouseCode': e.detail.value });
}

/**
 * 关闭样板确认弹窗
 * @param {Object} page - 页面实例
 * @returns {void}
 */
function closePatternConfirm(page) {
  page.setData({ 'patternConfirm.visible': false });
}

/**
 * 样板操作类型切换
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onPatternOperationChange(page, e) {
  const operationType = e.currentTarget.dataset.type;
  const options = Array.isArray(page.data.patternConfirm.operationOptions)
    ? page.data.patternConfirm.operationOptions
    : [];
  const selected = options.find(item => item.value === operationType);
  page.setData({
    'patternConfirm.operationType': operationType,
    'patternConfirm.operationLabel': (selected && selected.label) || OPERATION_LABELS[operationType] || '操作',
  });
}

/**
 * 样板备注输入
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onPatternRemarkInput(page, e) {
  page.setData({ 'patternConfirm.remark': e.detail.value });
}

/**
 * 提交样板生产扫码
 * @param {Object} page - 页面实例
 * @returns {Promise<void>} 异步提交样板扫码
 */
async function submitPatternScan(page) {
  const { patternConfirm } = page.data;
  if (patternConfirm.loading) return;
  if (!patternConfirm.operationType) {
    toast.error('请选择操作工序');
    return;
  }
  const confirmedQty = normalizePositiveInt(patternConfirm.quantity, 0);
  if (confirmedQty <= 0) {
    toast.error('请输入正确数量');
    return;
  }
  if (WAREHOUSE_OPERATIONS.has(patternConfirm.operationType) && !String(patternConfirm.warehouseCode || '').trim()) {
    toast.error('仓库操作请填写仓位编号');
    return;
  }

  page.setData({ 'patternConfirm.loading': true });

  try {
    const result = await page.scanHandler.submitPatternScan({
      patternId: patternConfirm.patternId,
      operationType: patternConfirm.operationType,
      operatorRole: 'PLATE_WORKER',
      quantity: confirmedQty,
      warehouseCode: patternConfirm.warehouseCode,
      remark: patternConfirm.remark,
    });

    if (result.success) {
      toast.success(result.message || '操作成功');
      closePatternConfirm(page);

      page.addToLocalHistory({
        time: new Date().toLocaleString(),
        type: 'pattern',
        data: {
          patternId: patternConfirm.patternId,
          styleNo: patternConfirm.styleNo,
          color: patternConfirm.color,
          quantity: confirmedQty,
          operationType: patternConfirm.operationType,
        },
      });

      const eventBus = getApp().globalData?.eventBus;
      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('DATA_REFRESH');
      }
    } else {
      toast.error(result.message || '操作失败');
    }
  } catch (e) {
    console.error('[扫码页] 样板扫码提交失败:', e);
    toast.error(e.errMsg || e.message || '提交失败');
  } finally {
    page.setData({ 'patternConfirm.loading': false });
  }
}

/**
 * 一键提交样板全部剩余工序
 * @param {Object} page - 页面实例
 * @returns {Promise<void>} 异步批量提交
 */
async function submitPatternScanAll(page) {
  const { patternConfirm } = page.data;
  if (patternConfirm.loading) return;

  const confirmedQty = normalizePositiveInt(patternConfirm.quantity, 0);
  if (confirmedQty <= 0) {
    toast.error('请输入正确数量');
    return;
  }

  const operations = getExecutableOperations(patternConfirm);
  if (!operations.length) {
    toast.error('没有可提交的工序');
    return;
  }
  const hasWarehouseOperation = operations.some(item => WAREHOUSE_OPERATIONS.has(item.value));
  if (hasWarehouseOperation && !String(patternConfirm.warehouseCode || '').trim()) {
    toast.error('包含仓库操作时请填写仓位编号');
    return;
  }

  page.setData({ 'patternConfirm.loading': true });

  try {
    for (const operation of operations) {
      const result = await page.scanHandler.submitPatternScan({
        patternId: patternConfirm.patternId,
        operationType: operation.value,
        operatorRole: 'PLATE_WORKER',
        quantity: confirmedQty,
        warehouseCode: patternConfirm.warehouseCode,
        remark: patternConfirm.remark,
      });

      if (!result.success) {
        throw new Error(result.message || `${operation.label || operation.value} 提交失败`);
      }
    }

    toast.success(`已完成 ${operations.length} 道工序`);
    closePatternConfirm(page);

    page.addToLocalHistory({
      time: new Date().toLocaleString(),
      type: 'pattern',
      data: {
        patternId: patternConfirm.patternId,
        styleNo: patternConfirm.styleNo,
        color: patternConfirm.color,
        quantity: confirmedQty,
        operationType: 'ALL',
      },
    });

    const eventBus = getApp().globalData?.eventBus;
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
    }
  } catch (e) {
    console.error('[扫码页] 样板一键提交失败:', e);
    toast.error(e.errMsg || e.message || '一键提交失败');
  } finally {
    page.setData({ 'patternConfirm.loading': false });
  }
}

module.exports = {
  showPatternConfirmModal,
  closePatternConfirm,
  onPatternOperationChange,
  onPatternQuantityInput,
  onPatternWarehouseInput,
  onPatternRemarkInput,
  submitPatternScan,
  submitPatternScanAll,
};
