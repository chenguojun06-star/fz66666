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
      scanType: p.scanType || 'production',
      unitPrice: Number(p.price || p.unitPrice || 0),
    }));
  let index = options.findIndex(opt => opt.value === processName || opt.value === progressStage);
  if (index < 0) index = 0;
  return { options, index };
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
    'scanResultConfirm.isDefectiveReentry': !!(stageResult && stageResult.isDefectiveReentry),
    'scanResultConfirm.defectQty': (stageResult && stageResult.defectQty) || 0,
    // 新增：领取/开始时间与录入结果/完成时间
    'scanResultConfirm.receiveTime': scanData && scanData.receiveTime ? scanData.receiveTime : '',
    'scanResultConfirm.confirmTime': scanData && scanData.confirmTime ? scanData.confirmTime : '',
    // 一行显示：开始时间 | 结束时间
    'scanResultConfirm.timeDisplay': `${scanData && scanData.receiveTime ? scanData.receiveTime : '—'} | ${scanData && scanData.confirmTime ? scanData.confirmTime : '—'}`,
  });
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
  });
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

  ctx.setData({
    'scanResultConfirm.processIndex': index,
    'scanResultConfirm.processName': option.value,
    'scanResultConfirm.progressStage': option.value,
    'scanResultConfirm.scanType': option.scanType,
    'scanResultConfirm.unitPrice': option.unitPrice || 0,
  });
  // 🔧 修复：切换到 quality 工序时同步 qualityStage
  if (option.scanType === 'quality') {
    const existingScanData = ctx.data.scanResultConfirm.scanData || {};
    existingScanData.qualityStage = existingScanData.qualityStage || 'receive';
    ctx.setData({ 'scanResultConfirm.scanData': existingScanData });
  }
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
      // 🔧 修复：明确携带 qualityStage，防止被 spread 覆盖或遗漏
      // quality 类型工序必须传此字段，否则后端默认走 confirm 阶段 → "请先领取再确认" 400
      qualityStage: confirm.scanData && confirm.scanData.qualityStage
        ? confirm.scanData.qualityStage
        : '',
      // 次品返修入库：告知后端跳过包装检查，仅校验次品数量上限
      ...(confirm.isDefectiveReentry ? { isDefectiveReentry: 'true' } : {}),
    };

    // api.production.executeScan 使用 ok() 包装：
    //   成功 → 返回 resp.data = {success:true, message:"...", scanRecord:{id,...}}
    //   失败 → throw createBizError(resp)，被下方 catch 捕获
    const result = await api.production.executeScan(scanData);

    if (result) {
      // 使用后端返回的消息（领取成功/验收成功/确认成功/已领取等）
      toast.success(`✅ ${confirm.processName} ${result.message || '扫码成功'}`);

      closeScanResultConfirm(ctx);

      // 调用 handleScanSuccess：触发撤回倒计时、addToLocalHistory、loadMyPanel
      ctx.handleScanSuccess({
        ...result,
        // 供 UndoHandler.handleUndo 使用
        recordId: result.scanRecord && (result.scanRecord.id || result.scanRecord.recordId),
        processName: confirm.processName,
        progressStage: confirm.progressStage || confirm.processName,
        bundleNo: confirm.bundleNo,
        orderNo: confirm.orderNo,
        quantity: confirmedQty,
        scanType: confirm.scanType,
        success: true,
        message: `${confirm.processName} ${confirmedQty}件`,
      });
    } else {
      toast.error('提交失败');
    }
  } catch (e) {
    const raw = e && (e.errMsg || e.message || '');
    let msg = raw;
    if (raw.includes('ERR_CONNECTION_RESET') || raw.includes('errcode:-101')) {
      msg = '网络连接中断，请稍后重试（服务器可能正在更新）';
    } else if (raw.includes('timeout')) {
      msg = '网络超时，请检查网络后重试';
    } else if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('errcode:-102')) {
      msg = '无法连接服务器，请检查网络设置';
    }
    toast.error(msg || '提交失败，请重试');
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
};
