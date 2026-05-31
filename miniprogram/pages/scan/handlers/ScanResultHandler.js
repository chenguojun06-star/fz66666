/**
 * 扫码结果确认处理器
 * 扫码结果确认已迁移为独立页面 /pages/scan/scan-result/index，此处仅保留页面导航
 *
 * @module ScanResultHandler
 */

const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('./helpers/ScanModeResolver');

function buildProcessOptions(processName, progressStage, stageResult) {
  const scannedSet = new Set(stageResult?.scannedProcessNames || []);
  const allBundleProcesses = stageResult?.allBundleProcesses || [];
  const hidePrice = stageResult?.hidePrice || false;
  let options = allBundleProcesses
    .filter(p => !scannedSet.has(p.processName))
    .map(p => ({
      label: hidePrice ? p.processName : `${p.processName}（¥${Number(p.unitPrice || p.price || 0).toFixed(2)}）`,
      value: p.processName,
      progressStage: p.progressStage || '',
      scanType: normalizeScanType(p.processName, p.scanType),
      unitPrice: Number(p.unitPrice || p.price || 0),
      hidePrice: hidePrice,
    }));

  if (options.length === 0 && (processName || progressStage)) {
    const fallbackName = processName || progressStage;
    options = [{
      label: fallbackName,
      value: fallbackName,
      scanType: normalizeScanType(fallbackName, stageResult?.scanType),
      unitPrice: Number(stageResult?.unitPrice || 0),
      hidePrice: true,
    }];
  }

  let index = options.findIndex(opt => opt.value === processName || opt.value === progressStage);
  if (index < 0) index = 0;
  return { options, index };
}

/**
 * 显示扫码结果确认页 — 跳转独立页面 /pages/scan/scan-result/index
 */
function showScanResultConfirm(ctx, data) {
  const {
    processName, progressStage, stageResult,
  } = data;

  const { options: processOptions } =
    buildProcessOptions(processName, progressStage, stageResult);

  const isWarehouseStage = progressStage === 'warehouse' || progressStage === '入库'
    || data.scanType === 'warehouse'
    || (stageResult && stageResult.scanType === 'warehouse');

  if (processOptions.length === 0 && !isWarehouseStage) {
    console.warn('[ScanResultHandler] 非入库阶段且无可用工序，跳过确认页');
    toast.error('该菲号所有工序已完成');
    return;
  }

  if (isWarehouseStage) {
    data.showWarehouse = true;
    data.hasWarehouseSelected = true;
  }

  getApp().globalData.scanResultData = data;
  wx.navigateTo({ url: '/pages/scan/scan-result/index' });
}

module.exports = {
  showScanResultConfirm,
};
