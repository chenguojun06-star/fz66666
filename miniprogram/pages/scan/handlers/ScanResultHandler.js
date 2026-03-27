/**
 * 扫码结果确认处理器 - 从 scan/index.js 拆分
 *
 * 职责：扫码结果确认页的显示/关闭、工序选择、领取记录提交
 *
 * @module ScanResultHandler
 * @version 1.0
 * @date 2026-02-09
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('./helpers/ScanModeResolver');

/**
 * 将值转为正整数，非正整数时返回 fallback
 * @param {*} value - 待转换的值
 * @param {number} [fallback=1] - 默认值
 * @returns {number} 正整数
 */
function normalizePositiveInt(value, fallback = 1) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

/**
 * 从 stageResult 构建可用工序选项（过滤已扫工序）
 * @param {string} processName - 当前工序名
 * @param {string} progressStage - 当前阶段名
 * @param {Object} stageResult - 阶段扫码结果
 * @returns {{options: Array, index: number}} 工序选项与默认选中下标
 */
function buildProcessOptions(processName, progressStage, stageResult) {
  const scannedSet = new Set(stageResult?.scannedProcessNames || []);
  const allBundleProcesses = stageResult?.allBundleProcesses || [];
  const options = allBundleProcesses
    .filter(p => !scannedSet.has(p.processName))
    .map(p => ({
      label: `${p.processName}（¥${Number(p.price || p.unitPrice || 0).toFixed(1)}）`,
      value: p.processName,
      scanType: normalizeScanType(p.processName, p.scanType),
      unitPrice: Number(p.price || p.unitPrice || 0),
    }));
  let index = options.findIndex(opt => opt.value === processName || opt.value === progressStage);
  if (index < 0) index = 0;
  return { options, index };
}

function applySelectionState(processOptions, selectedProcessNames) {
  const selectedSet = new Set(
    Array.isArray(selectedProcessNames)
      ? selectedProcessNames.filter(Boolean)
      : []
  );

  return (processOptions || []).map((option) => ({
    ...option,
    checked: selectedSet.has(option.value),
  }));
}

function buildSelectionSummary(processOptions, selectedProcessNames) {
  const selected = (processOptions || []).filter((option) =>
    (selectedProcessNames || []).includes(option.value)
  );
  return {
    selectedProcessDetails: selected.map((option) => ({
      value: option.value,
      unitPrice: Number(option.unitPrice || 0),
    })),
    selectedProcessCount: selected.length,
    selectedProcessAmount: selected.reduce((sum, option) => sum + Number(option.unitPrice || 0), 0),
  };
}

/**
 * 显示扫码结果确认页
 * @param {Object} ctx - Page 上下文
 * @param {Object} data - 确认页数据
 * @returns {void}
 */
function showScanResultConfirm(ctx, data) {
  const {
    processName, progressStage, scanType, quantity,
    orderNo, bundleNo, scanData, orderDetail, stageResult, parsedData,
  } = data;

  const { options: processOptions, index: processIndex } =
    buildProcessOptions(processName, progressStage, stageResult);

  if (processOptions.length === 0) {
    console.error('[ScanResultHandler] 所有工序已扫完，不应弹出确认页');
    toast.error('该菲号所有工序已完成');
    return;
  }

  const selectedOption = processOptions[processIndex];
  const selectedProcessNames = selectedOption ? [selectedOption.value] : [];
  const processOptionsWithSelection = applySelectionState(processOptions, selectedProcessNames);
  const selectionSummary = buildSelectionSummary(processOptionsWithSelection, selectedProcessNames);
  const confirmedQty = normalizePositiveInt(quantity, 1);

  ctx.setData({
    'scanResultConfirm.visible': true,
    'scanResultConfirm.processName': processName,
    'scanResultConfirm.progressStage': progressStage,
    'scanResultConfirm.scanType': scanType,
    'scanResultConfirm.unitPrice': selectedOption?.unitPrice || 0,
    'scanResultConfirm.quantity': confirmedQty,
    'scanResultConfirm.orderNo': orderNo,
    'scanResultConfirm.bundleNo': bundleNo,
    'scanResultConfirm.styleNo': orderDetail?.styleNo || '',
    'scanResultConfirm.processOptions': processOptionsWithSelection,
    'scanResultConfirm.selectedProcessNames': selectedProcessNames,
    'scanResultConfirm.selectedProcessDetails': selectionSummary.selectedProcessDetails,
    'scanResultConfirm.selectedProcessCount': selectionSummary.selectedProcessCount,
    'scanResultConfirm.selectedProcessAmount': selectionSummary.selectedProcessAmount,
    'scanResultConfirm.processIndex': processIndex,
    'scanResultConfirm.scanData': scanData,
    'scanResultConfirm.orderDetail': orderDetail,
    'scanResultConfirm.stageResult': stageResult,
    'scanResultConfirm.parsedData': parsedData,
    'scanResultConfirm.isDefectiveReentry': !!(stageResult && stageResult.isDefectiveReentry),
    'scanResultConfirm.defectQty': (stageResult && stageResult.defectQty) || 0,
    // 入库模式：仓库选择（重置）
    'scanResultConfirm.warehouseCode': '',
    // 新增：领取/开始时间与录入结果/完成时间
    'scanResultConfirm.receiveTime': scanData && scanData.receiveTime ? scanData.receiveTime : '',
    'scanResultConfirm.confirmTime': scanData && scanData.confirmTime ? scanData.confirmTime : '',
    // 一行显示：开始时间 | 结束时间
    'scanResultConfirm.timeDisplay': `${scanData && scanData.receiveTime ? scanData.receiveTime : '—'} | ${scanData && scanData.confirmTime ? scanData.confirmTime : '—'}`,
    // 先清空，待异步拉取后补填
    'scanResultConfirm.imageInsight': '',
    'scanResultConfirm.hasWarehouseSelected': !!selectedOption && selectedOption.scanType === 'warehouse',
  });

  // 异步拉取款式难度提示（不阻塞确认弹窗显示）
  const styleNo = orderDetail && orderDetail.styleNo;
  if (styleNo && ctx.api && ctx.api.style) {
    ctx.api.style.listStyles({ styleNo, page: 1, pageSize: 1 })
      .then(res => {
        const record = (res && (res.records || res.list || []))[0] || (res && !res.records ? res : null);
        const hint = record && record.imageInsight;
        if (hint) {
          ctx.setData({ 'scanResultConfirm.imageInsight': hint });
        }
      })
      .catch(() => { /* 静默失败，不影响主流程 */ });
  }
}

/**
 * 数量输入框变更
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 输入事件
 * @returns {void}
 */
function onScanResultQuantityInput(ctx, e) {
  ctx.setData({
    'scanResultConfirm.quantity': e.detail.value,
  });
}

/**
 * 关闭扫码结果确认页
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function closeScanResultConfirm(ctx) {
  ctx.setData({
    'scanResultConfirm.visible': false,
    'scanResultConfirm.loading': false,
    'scanResultConfirm.imageInsight': '',
  });
}

/**
 * 构建提交扫码数据
 * @param {Object} confirm - 确认态数据
 * @param {number} confirmedQty - 确认数量
 * @returns {Object} 提交参数
 */
function buildScanData(confirm, option, confirmedQty) {
  const normalizedScanType = normalizeScanType(option.value, option.scanType || confirm.scanType);
  const existingScanData = confirm.scanData || {};
  const qualityStage = existingScanData.qualityStage
    ? existingScanData.qualityStage
    : (normalizedScanType === 'quality' ? 'receive' : '');
  const warehouseCode = (confirm.warehouseCode || existingScanData.warehouse || '').trim();

  return {
    ...existingScanData,
    processName: option.value,
    progressStage: option.value,
    scanType: normalizedScanType,
    unitPrice: option.unitPrice || 0,
    quantity: confirmedQty,
    qualityStage,
    // 入库模式：携带仓库编号
    warehouse: warehouseCode,
    ...(confirm.isDefectiveReentry ? { isDefectiveReentry: 'true' } : {}),
  };
}

/**
 * 构建友好的错误提示
 * @param {Error|Object} error - 错误对象
 * @returns {string} 提示文本
 */
function buildFriendlyErrorMessage(error) {
  const raw = error && (error.errMsg || error.message || '');
  if (raw.includes('ERR_CONNECTION_RESET') || raw.includes('errcode:-101')) {
    return '网络连接中断，请稍后重试（服务器可能正在更新）';
  }
  if (raw.includes('timeout')) {
    return '网络超时，请检查网络后重试';
  }
  if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('errcode:-102')) {
    return '无法连接服务器，请检查网络设置';
  }
  return raw || '提交失败，请重试';
}

/**
 * 处理提交成功后的UI更新
 * @param {Object} params - 参数
 * @param {Object} params.ctx - 页面上下文
 * @param {Object} params.confirm - 确认态数据
 * @param {Object} params.result - 接口返回数据
 * @param {number} params.confirmedQty - 确认数量
 * @param {Object} params.scanData - 提交数据
 * @param {boolean} [params.closeAfter=true] - 是否关闭确认弹窗
 * @param {boolean} [params.silent=false] - 是否静默提示
 * @returns {void}
 */
function handleSubmitSuccess({ ctx, confirm, result, confirmedQty, scanData, closeAfter = true, silent = false }) {
  const recordId = result && result.scanRecord && (result.scanRecord.id || result.scanRecord.recordId);
  if (!recordId) {
    const msg = (result && result.message) ? String(result.message) : '提交未落库，请重试';
    throw new Error(msg);
  }

  if (!silent) {
    toast.success(`✅ ${confirm.processName} ${result.message || '扫码成功'}`);
  }
  if (closeAfter) {
    closeScanResultConfirm(ctx);
  }

  ctx.handleScanSuccess({
    ...result,
    recordId,
    processName: confirm.processName,
    progressStage: confirm.progressStage || confirm.processName,
    bundleNo: confirm.bundleNo,
    orderNo: confirm.orderNo,
    quantity: confirmedQty,
    scanType: scanData.scanType,
    success: true,
    message: `${confirm.processName} ${confirmedQty}件`,
  });
}

function getSelectedOptions(confirm) {
  const selectedNames = Array.isArray(confirm.selectedProcessNames) ? confirm.selectedProcessNames : [];
  return (confirm.processOptions || []).filter(option => selectedNames.includes(option.value));
}

/**
 * 工序滚动选择器 - 点击选中
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onProcessScrollSelect(ctx, e) {
  const index = e.currentTarget.dataset.index;
  const option = ctx.data.scanResultConfirm.processOptions[index];
  if (!option) return;
  const selectedNames = new Set(ctx.data.scanResultConfirm.selectedProcessNames || []);
  if (selectedNames.has(option.value)) {
    selectedNames.delete(option.value);
  } else {
    selectedNames.add(option.value);
  }
  const nextSelected = Array.from(selectedNames);
  const selectedOptions = (ctx.data.scanResultConfirm.processOptions || []).filter(item => nextSelected.includes(item.value));
  const primaryOption = selectedOptions[0] || option;
  const nextOptions = applySelectionState(ctx.data.scanResultConfirm.processOptions || [], nextSelected);
  const selectionSummary = buildSelectionSummary(nextOptions, nextSelected);

  ctx.setData({
    'scanResultConfirm.processIndex': nextSelected.length ? index : -1,
    'scanResultConfirm.selectedProcessNames': nextSelected,
    'scanResultConfirm.processOptions': nextOptions,
    'scanResultConfirm.selectedProcessDetails': selectionSummary.selectedProcessDetails,
    'scanResultConfirm.selectedProcessCount': selectionSummary.selectedProcessCount,
    'scanResultConfirm.selectedProcessAmount': selectionSummary.selectedProcessAmount,
    'scanResultConfirm.processName': primaryOption.value,
    'scanResultConfirm.progressStage': primaryOption.value,
    'scanResultConfirm.scanType': primaryOption.scanType,
    'scanResultConfirm.unitPrice': primaryOption.unitPrice || 0,
    'scanResultConfirm.hasWarehouseSelected': selectedOptions.some(item => item.scanType === 'warehouse'),
  });
  if (selectedOptions.some(item => item.scanType === 'quality')) {
    const existingScanData = ctx.data.scanResultConfirm.scanData || {};
    existingScanData.qualityStage = existingScanData.qualityStage || 'receive';
    ctx.setData({ 'scanResultConfirm.scanData': existingScanData });
  }
  if (!selectedOptions.some(item => item.scanType === 'warehouse')) {
    ctx.setData({ 'scanResultConfirm.warehouseCode': '' });
  }
}

/**
 * 入库仓库快捷选择（chip 点击）
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 */
function onResultWarehouseChipTap(ctx, e) {
  const value = e.currentTarget.dataset.value;
  const current = ctx.data.scanResultConfirm.warehouseCode;
  ctx.setData({
    'scanResultConfirm.warehouseCode': current === value ? '' : value,
  });
}

/**
 * 入库仓库手动输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 */
function onResultWarehouseInput(ctx, e) {
  ctx.setData({
    'scanResultConfirm.warehouseCode': e.detail.value,
  });
}

/**
 * 清除仓库选择
 * @param {Object} ctx - Page 上下文
 */
function onResultWarehouseClear(ctx) {
  ctx.setData({
    'scanResultConfirm.warehouseCode': '',
  });
}

/**
 * 领取记录（提交扫码）
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 提交完成后更新界面
 */
async function onConfirmScanResult(ctx) {
  const confirm = ctx.data.scanResultConfirm;

  if (confirm.loading) return;

  ctx.setData({ 'scanResultConfirm.loading': true });

  try {
    const confirmedQty = normalizePositiveInt(confirm.quantity, 0);
    if (confirmedQty <= 0) {
      toast.error('请输入正确数量');
      return;
    }

    const selectedOptions = getSelectedOptions(confirm);
    if (!selectedOptions.length) {
      toast.error('请至少选择一个工序');
      return;
    }

    for (const option of selectedOptions) {
      const scanData = buildScanData(confirm, option, confirmedQty);
      const result = await api.production.executeScan(scanData);
      handleSubmitSuccess({
        ctx,
        confirm: {
          ...confirm,
          processName: option.value,
          progressStage: option.value,
        },
        result,
        confirmedQty,
        scanData,
        closeAfter: false,
        silent: true,
      });
    }

    closeScanResultConfirm(ctx);
    toast.success(`✅ 已完成 ${selectedOptions.length} 个工序扫码`);
  } catch (e) {
    toast.error(buildFriendlyErrorMessage(e));
  } finally {
    ctx.setData({ 'scanResultConfirm.loading': false });
  }
}

module.exports = {
  showScanResultConfirm,
  closeScanResultConfirm,
  onScanResultQuantityInput,
  onProcessScrollSelect,
  onConfirmScanResult,
  onResultWarehouseChipTap,
  onResultWarehouseInput,
  onResultWarehouseClear,
};
