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

  const processOptions = ctx.data.scanResultConfirm.processOptions;
  let processIndex = processOptions.findIndex(
    opt => opt.value === processName || opt.value === progressStage,
  );
  if (processIndex < 0) processIndex = 0;

  ctx.setData({
    'scanResultConfirm.visible': true,
    'scanResultConfirm.processName': processName,
    'scanResultConfirm.progressStage': progressStage,
    'scanResultConfirm.scanType': scanType,
    'scanResultConfirm.quantity': quantity,
    'scanResultConfirm.orderNo': orderNo,
    'scanResultConfirm.bundleNo': bundleNo,
    'scanResultConfirm.styleNo': orderDetail?.styleNo || '',
    'scanResultConfirm.processIndex': processIndex,
    'scanResultConfirm.scanData': scanData,
    'scanResultConfirm.orderDetail': orderDetail,
    'scanResultConfirm.stageResult': stageResult,
    'scanResultConfirm.parsedData': parsedData,
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
    const scanData = {
      ...confirm.scanData,
      processName: confirm.processName,
      progressStage: confirm.progressStage,
      scanType: confirm.scanType,
    };

    const result = await api.production.executeScan(scanData);

    if (result && result.success !== false) {
      toast.success(`✅ ${confirm.processName} 领取成功`);

      closeScanResultConfirm(ctx);

      ctx.setData({
        lastResult: {
          success: true,
          message: `${confirm.processName} ${confirm.quantity}件`,
          orderNo: confirm.orderNo,
          bundleNo: confirm.bundleNo,
          processName: confirm.processName,
          quantity: confirm.quantity,
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
  onProcessPickerChange,
  onConfirmScanResult,
};
