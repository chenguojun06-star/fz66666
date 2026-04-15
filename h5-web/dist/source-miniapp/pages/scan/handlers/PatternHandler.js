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
  PROCUREMENT: '采购',
  CUTTING: '裁剪',
  SECONDARY: '二次工艺',
  SEWING: '车缝',
  TAIL: '尾部',
  REVIEW: '样衣审核',
  WAREHOUSE_IN: '样衣入库',
  WAREHOUSE_OUT: '样衣出库',
  WAREHOUSE_RETURN: '样衣归还',
};

const WAREHOUSE_OPERATIONS = new Set(['WAREHOUSE_IN', 'WAREHOUSE_OUT', 'WAREHOUSE_RETURN']);
// 一键领取时排除的类型：仓库类（需仓位编号）+ 审核（需填备注）
const CLAIM_EXCLUDED_OPS = new Set(['WAREHOUSE_IN', 'WAREHOUSE_OUT', 'WAREHOUSE_RETURN', 'REVIEW']);

function _isPatternInScanConfirm(page) {
  const detail = page.data && page.data.scanConfirm && page.data.scanConfirm.detail;
  return !!(detail && detail.isPattern);
}

function _getPatternState(page) {
  if (_isPatternInScanConfirm(page)) {
    const detail = page.data.scanConfirm.detail || {};
    return {
      loading: !!page.data.scanConfirm.loading,
      patternId: detail.patternId,
      styleNo: detail.styleNo,
      color: detail.color,
      quantity: detail.quantity,
      warehouseCode: detail.warehouseCode,
      status: detail.status,
      operationType: detail.operationType,
      operationLabel: detail.operationLabel,
      operationOptions: detail.operationOptions || [],
      designer: detail.designer,
      patternDeveloper: detail.patternDeveloper,
      deliveryTime: detail.deliveryTime,
      patternDetail: detail.patternDetail,
      remark: detail.remark,
    };
  }
  return page.data.patternConfirm || {};
}

function _setPatternField(page, field, value) {
  if (_isPatternInScanConfirm(page)) {
    page.setData({ [`scanConfirm.detail.${field}`]: value });
    return;
  }
  page.setData({ [`patternConfirm.${field}`]: value });
}

function _setPatternLoading(page, loading) {
  if (_isPatternInScanConfirm(page)) {
    page.setData({ 'scanConfirm.loading': loading });
    return;
  }
  page.setData({ 'patternConfirm.loading': loading });
}

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
  const requiresWarehouseInput = WAREHOUSE_OPERATIONS.has(operationType);
  const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
  const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
  const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';
  const requiresReviewBeforeInbound = operationType === 'WAREHOUSE_IN' && !reviewApproved;
  const confirmedQty = normalizePositiveInt(data.quantity, 1);
  // 计算"一键领取"可批量提交的工序（排除仓库类和审核）
  const productionOnlyOps = operationOptions.filter(
    op => !CLAIM_EXCLUDED_OPS.has(String(op.value || '').toUpperCase())
  );
  const hasClaimAllOps = productionOnlyOps.length >= 1;
  page.setData({
    scanConfirm: {
      visible: true,
      loading: false,
      detail: {
        isPattern: true,
        patternId: data.patternId,
        styleNo: data.styleNo,
        color: data.color,
        quantity: confirmedQty,
        warehouseCode: '',
        status: data.status,
        operationType,
        operationLabel,
        operationOptions,
        requiresWarehouseInput,
        requiresReviewBeforeInbound,
        reviewApproved,
        hasClaimAllOps,
        designer: data.designer || patternDetail.designer || '-',
        patternDeveloper: data.patternDeveloper || patternDetail.patternDeveloper || '-',
        deliveryTime: patternDetail.deliveryTime || '-',
        patternDetail,
        remark: '',
      },
      skuList: [],
      summary: {},
      cuttingTasks: [],
      materialPurchases: [],
      bomFallback: false,
      fromMyTasks: false,
    },
    patternConfirm: {
      ...page.data.patternConfirm,
      visible: false,
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
  _setPatternField(page, 'quantity', e.detail.value);
}

function onPatternWarehouseInput(page, e) {
  _setPatternField(page, 'warehouseCode', e.detail.value);
}

/**
 * 关闭样板确认弹窗
 * @param {Object} page - 页面实例
 * @returns {void}
 */
function closePatternConfirm(page) {
  if (_isPatternInScanConfirm(page)) {
    page.setData({ 'scanConfirm.visible': false });
    return;
  }
  page.setData({ 'patternConfirm.visible': false });
}

/**
 * 样板操作类型切换
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onPatternOperationChange(page, e) {
  // 无二次工艺等禁用项：直接忽略点击
  if (e.currentTarget.dataset.disabled) return;
  const operationType = e.currentTarget.dataset.type;
  if (!operationType) return;
  const state = _getPatternState(page);
  const options = Array.isArray(state.operationOptions)
    ? state.operationOptions
    : [];
  const selected = options.find(item => item.value === operationType);
  const patternDetail = state.patternDetail || {};
  const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
  const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
  const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';
  _setPatternField(page, 'operationType', operationType);
  _setPatternField(page, 'operationLabel', (selected && selected.label) || OPERATION_LABELS[operationType] || '操作');
  _setPatternField(page, 'requiresWarehouseInput', WAREHOUSE_OPERATIONS.has(operationType));
  _setPatternField(page, 'requiresReviewBeforeInbound', operationType === 'WAREHOUSE_IN' && !reviewApproved);
}

/**
 * 样板备注输入
 * @param {Object} page - 页面实例
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onPatternRemarkInput(page, e) {
  _setPatternField(page, 'remark', e.detail.value);
}

/**
 * 提交样板生产扫码
 * @param {Object} page - 页面实例
 * @returns {Promise<void>} 异步提交样板扫码
 */
async function submitPatternScan(page) {
  const patternConfirm = _getPatternState(page);
  if (patternConfirm.loading) return;
  if (!patternConfirm.operationType) {
    toast.error('请选择操作工序');
    return;
  }
  const operationType = String(patternConfirm.operationType || '').toUpperCase();
  const confirmedQty = normalizePositiveInt(patternConfirm.quantity, 0);
  const reviewRemark = String(patternConfirm.remark || '').trim();
  if (operationType !== 'REVIEW' && confirmedQty <= 0) {
    toast.error('请输入正确数量');
    return;
  }
  if ((operationType === 'REVIEW'
      || (operationType === 'WAREHOUSE_IN' && patternConfirm.requiresReviewBeforeInbound))
      && !reviewRemark) {
    toast.error('请填写样衣审核备注');
    return;
  }
  if (WAREHOUSE_OPERATIONS.has(operationType) && !String(patternConfirm.warehouseCode || '').trim()) {
    toast.error('仓库操作请填写仓位编号');
    return;
  }

  _setPatternLoading(page, true);

  try {
    const result = await page.scanHandler.submitPatternScan({
      patternId: patternConfirm.patternId,
      operationType,
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
          operationType,
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
    _setPatternLoading(page, false);
  }
}

/**
 * 一键提交样板全部剩余工序
 * @param {Object} page - 页面实例
 * @returns {Promise<void>} 异步批量提交
 */
async function submitPatternScanAll(page) {
  const patternConfirm = _getPatternState(page);
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

  const selectedOperation = operations.find(item => item.value === patternConfirm.operationType) || null;
  if (!selectedOperation) {
    toast.error('请选择要提交的工序');
    return;
  }

  const reviewRemark = String(patternConfirm.remark || '').trim();
  if ((selectedOperation.value === 'REVIEW'
      || (selectedOperation.value === 'WAREHOUSE_IN' && patternConfirm.requiresReviewBeforeInbound))
      && !reviewRemark) {
    toast.error('请填写样衣审核备注');
    return;
  }

  if (WAREHOUSE_OPERATIONS.has(selectedOperation.value) && !String(patternConfirm.warehouseCode || '').trim()) {
    toast.error('仓库操作请填写仓位编号');
    return;
  }

  _setPatternLoading(page, true);

  try {
    const result = await page.scanHandler.submitPatternScan({
      patternId: patternConfirm.patternId,
      operationType: selectedOperation.value,
      operatorRole: 'PLATE_WORKER',
      quantity: confirmedQty,
      warehouseCode: patternConfirm.warehouseCode,
      remark: patternConfirm.remark,
    });

    if (!result.success) {
      throw new Error(result.message || `${selectedOperation.label || selectedOperation.value} 提交失败`);
    }

    toast.success(result.message || '提交成功');
    closePatternConfirm(page);

    page.addToLocalHistory({
      time: new Date().toLocaleString(),
      type: 'pattern',
      data: {
        patternId: patternConfirm.patternId,
        styleNo: patternConfirm.styleNo,
        color: patternConfirm.color,
        quantity: confirmedQty,
        operationType: selectedOperation.value,
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
    _setPatternLoading(page, false);
  }
}

/**
 * 一键领取样板全部生产工序（排除仓库/审核，逐个顺序提交）
 * @param {Object} page - 页面实例
 * @returns {Promise<void>} 异步批量提交
 */
async function claimAllPatternOps(page) {
  const patternConfirm = _getPatternState(page);
  if (patternConfirm.loading) return;

  const confirmedQty = normalizePositiveInt(patternConfirm.quantity, 0);
  if (confirmedQty <= 0) {
    toast.error('请输入正确数量');
    return;
  }

  const ops = (patternConfirm.operationOptions || [])
    .filter(op => !CLAIM_EXCLUDED_OPS.has(String(op.value || '').toUpperCase()));
  if (!ops.length) {
    toast.error('当前没有可领取的生产工序');
    return;
  }

  _setPatternLoading(page, true);
  try {
    let successCount = 0;
    for (const op of ops) {
      // eslint-disable-next-line no-await-in-loop
      const result = await page.scanHandler.submitPatternScan({
        patternId: patternConfirm.patternId,
        operationType: op.value,
        operatorRole: 'PLATE_WORKER',
        quantity: confirmedQty,
        warehouseCode: '',
        remark: '',
      });
      if (result && result.success) {
        successCount++;
      } else {
        toast.error(`${op.label || op.value} 提交失败：${(result && result.message) || '未知错误'}`);
        break;
      }
    }
    if (successCount > 0) {
      toast.success(`已领取 ${successCount} 个工序`);
      closePatternConfirm(page);
      page.addToLocalHistory({
        time: new Date().toLocaleString(),
        type: 'pattern',
        data: {
          patternId: patternConfirm.patternId,
          styleNo: patternConfirm.styleNo,
          color: patternConfirm.color,
          quantity: confirmedQty,
          operationType: 'CLAIM_ALL',
        },
      });
      const eventBus = getApp().globalData && getApp().globalData.eventBus;
      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('DATA_REFRESH');
      }
    }
  } catch (e) {
    console.error('[扫码页] 样板一键领取失败:', e);
    toast.error(e.errMsg || e.message || '一键领取失败');
  } finally {
    _setPatternLoading(page, false);
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
  claimAllPatternOps,
};
