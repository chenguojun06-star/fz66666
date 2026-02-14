/**
 * 扫码结果确认处理器 - 从 scan/index.js 拆分
 *
 * 职责：扫码结果确认页的显示/关闭、工序选择、领取记录提交
 *
 * @module ScanResultHandler
 * @version 1.0
 * @date 2026-02-09
 */

import api from '../../../utils/api';
import { toast } from '../../../utils/uiHelper';

const { eventBus } = require('../../../utils/eventBus');

function normalizePositiveInt(value, fallback = 1) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

/**
 * 显示扫码结果确认页
 * @param {Object} ctx - Page 上下文
 * @param {Object} data - 确认页数据
 * @returns {void}
 */
function showScanResultConfirm(ctx, data) {
  const {
    processName,
    progressStage,
    scanType,
    quantity,
    orderNo,
    bundleNo,
    scanData,
    orderDetail,
    stageResult,
    parsedData,
  } = data;

  // 🔧 动态构建工序选项：100%来自订单工序配置，过滤掉已扫过的子工序
  const scannedSet = new Set(stageResult?.scannedProcessNames || []);
  const allBundleProcesses = stageResult?.allBundleProcesses || [];

  // ✅ 严格从后端API动态配置构建，每个订单的子工序和单价都不同
  const processOptions = allBundleProcesses
    .filter(p => !scannedSet.has(p.processName))
    .map(p => ({
      label: `${p.processName}（¥${Number(p.price || p.unitPrice || 0).toFixed(1)}）`,
      value: p.processName,
      scanType: p.scanType || 'production',
      unitPrice: Number(p.price || p.unitPrice || 0),
    }));

  if (processOptions.length === 0) {
    // 所有工序已完成，不应该走到这里，报错提示
    console.error('[ScanResultHandler] 所有工序已扫完，不应弹出确认页');
    toast.error('该菲号所有工序已完成');
    return;
  }

  console.log(
    `[ScanResultHandler] 订单[${orderNo}] 已扫工序: [${[...scannedSet].join(',')}]，` +
      `可选工序: [${processOptions.map(o => `${o.value}(¥${o.unitPrice})`).join(',')}]`,
  );

  let processIndex = processOptions.findIndex(
    opt => opt.value === processName || opt.value === progressStage,
  );
  if (processIndex < 0) processIndex = 0;

  // 当前选中的工序单价
  const selectedOption = processOptions[processIndex];

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
    'scanResultConfirm.processOptions': processOptions,
    'scanResultConfirm.processIndex': processIndex,
    'scanResultConfirm.scanData': scanData,
    'scanResultConfirm.orderDetail': orderDetail,
    'scanResultConfirm.stageResult': stageResult,
    'scanResultConfirm.parsedData': parsedData,
  });
}

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
  });
}

/**
 * 工序选择器变化
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onProcessPickerChange(ctx, e) {
  const index = e.detail.value;
  const option = ctx.data.scanResultConfirm.processOptions[index];

  ctx.setData({
    'scanResultConfirm.processIndex': index,
    'scanResultConfirm.processName': option.value,
    'scanResultConfirm.progressStage': option.value,
    'scanResultConfirm.scanType': option.scanType,
    'scanResultConfirm.unitPrice': option.unitPrice || 0,
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

    const scanData = {
      ...confirm.scanData,
      processName: confirm.processName,
      progressStage: confirm.progressStage,
      scanType: confirm.scanType,
      unitPrice: confirm.unitPrice || 0,
      quantity: confirmedQty,
    };

    const result = await api.production.executeScan(scanData);

    if (result && result.success !== false) {
      toast.success(`✅ ${confirm.processName} 领取成功`);

      closeScanResultConfirm(ctx);

      ctx.setData({
        lastResult: {
          success: true,
          message: `${confirm.processName} ${confirmedQty}件`,
          orderNo: confirm.orderNo,
          bundleNo: confirm.bundleNo,
          processName: confirm.processName,
          quantity: confirmedQty,
          displayTime: new Date().toLocaleTimeString(),
        },
      });

      ctx.loadMyPanel(true);

      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('SCAN_SUCCESS', result);
      }
    } else {
      toast.error(result?.message || '提交失败');
    }
  } catch (e) {
    toast.error(e.message || '提交失败');
  } finally {
    ctx.setData({ 'scanResultConfirm.loading': false });
  }
}

module.exports = {
  showScanResultConfirm,
  closeScanResultConfirm,
  onScanResultQuantityInput,
  onProcessPickerChange,
  onConfirmScanResult,
};
