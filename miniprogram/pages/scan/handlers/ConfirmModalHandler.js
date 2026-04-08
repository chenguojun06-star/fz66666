/**
 * 确认弹窗处理器 - 从 scan/index.js 拆分
 *
 * 职责：确认弹窗的显示/关闭、数据构建、SKU提交、通用输入处理
 *
 * @module ConfirmModalHandler
 * @version 1.0
 * @date 2026-02-09
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('./helpers/ScanModeResolver');

const SKUProcessor = require('../processors/SKUProcessor');

/**
 * 显示确认弹窗
 * @param {Object} ctx - Page 上下文
 * @param {Object} data - 弹窗数据
 * @returns {void}
 */
function showConfirmModal(ctx, data) {
  // 样板生产模式 - 委托 PatternHandler
  const isPatternMode = data.patternId || data.patternDetail;
  if (isPatternMode) {
    ctx.showPatternConfirmModal(data);
    return;
  }

  const { skuList, formItems, summary } = _buildConfirmModalData(data);

  const sizeDetails = _buildSizeDetails(skuList);
  const sizeSummaryGroups = _buildSizeSummaryGroups(skuList);
  const sizeSummaryMatrix = _buildSizeSummaryMatrix(skuList);

  ctx.setData({
    scanConfirm: {
      visible: true,
      loading: false,
      detail: { ...data, sizeDetails, sizeSummaryGroups, sizeSummaryMatrix },
      skuList: formItems,
      summary: summary,
      bomFallback: data.bomFallback || false,
      aiTipLoading: true,
      aiTipData: null
    },
  });

  // 异步获取 AI 扫码工艺提醒
  if (data.orderNo && data.processName) {
    api.intelligence.getScanTips({
      orderNo: data.orderNo,
      processName: data.processName
    }).then(res => {
      if (res && res.aiTip) {
        ctx.setData({
          'scanConfirm.aiTipLoading': false,
          'scanConfirm.aiTipData': res
        });
      } else {
        ctx.setData({ 'scanConfirm.aiTipLoading': false });
      }
    }).catch(err => {
      console.error('获取 AI 扫码工艺提醒失败', err);
      ctx.setData({ 'scanConfirm.aiTipLoading': false });
    });
  } else {
    ctx.setData({ 'scanConfirm.aiTipLoading': false });
  }
}

/**
 * 构建确认弹窗的数据
 * @param {Object} data - 原始数据
 * @returns {Object} 构建后的数据对象
 * @private
 */
/**
 * 构建确认弹窗的数据（SKU模式）
 * @param {Object} data - 原始数据
 * @returns {Object} 构建后的数据对象
 * @private
 */
function _buildConfirmModalData(data) {
  const skuList = data.skuItems
    ? SKUProcessor.normalizeOrderItems(data.skuItems, data.orderNo, data.styleNo)
    : [];

  return {
    skuList,
    formItems: SKUProcessor.buildSKUInputList(skuList),
    summary: SKUProcessor.getSummary(skuList),
  };
}

/**
 * 构建尺码明细字符串
 * @param {Array} skuList - SKU列表
 * @returns {string} 尺码明细
 * @private
 */
function _buildSizeDetails(skuList) {
  if (skuList.length === 0) return '';
  return skuList
    .map(
      item =>
        `${item.color || '-'}${item.size ? `/${item.size}` : ''}×${Number(item.totalQuantity || 0)}`,
    )
    .join('，');
}

function _buildSizeSummaryGroups(skuList) {
  if (!Array.isArray(skuList) || skuList.length === 0) return [];
  const groupMap = new Map();
  skuList.forEach((item) => {
    const color = String(item.color || '').trim() || '默认';
    const size = String(item.size || '').trim() || '均码';
    const quantity = Number(item.totalQuantity || item.quantity || 0);
    if (!groupMap.has(color)) {
      groupMap.set(color, []);
    }
    groupMap.get(color).push({ size, quantity });
  });
  return Array.from(groupMap.entries()).map(([color, entries]) => ({
    color,
    entries,
  }));
}

function _buildSizeSummaryMatrix(skuList) {
  if (!Array.isArray(skuList) || skuList.length === 0) {
    return { sizes: [], rows: [] };
  }
  const sizeSet = new Set();
  const colorMap = new Map();
  skuList.forEach((item) => {
    const color = String(item.color || '').trim() || '默认';
    const size = String(item.size || '').trim() || '均码';
    const quantity = Number(item.totalQuantity || item.quantity || 0);
    sizeSet.add(size);
    if (!colorMap.has(color)) {
      colorMap.set(color, new Map());
    }
    colorMap.get(color).set(size, quantity);
  });
  const sizes = Array.from(sizeSet);
  const rows = Array.from(colorMap.entries()).map(([color, qtyMap]) => ({
    color,
    cells: sizes.map((size) => ({
      size,
      quantity: Number(qtyMap.get(size) || 0),
    })),
  }));
  return { sizes, rows };
}

/**
 * 取消扫码（关闭弹窗）
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onCancelScan(ctx) {
  ctx.setData({ 'scanConfirm.visible': false });
}

/**
 * 通用输入处理器 - 统一处理所有基于索引的输入
 * @param {Object} e - 事件对象
 * @param {Object} ctx - Page 上下文
 * @param {string} dataPath - 数据路径
 * @param {string} field - 字段名
 * @returns {void}
 */
function handleIndexInput(e, ctx, dataPath, field) {
  const idx = Number(e.currentTarget.dataset.idx);
  const val = e.detail.value;
  const key = `${dataPath}[${idx}].${field}`;
  ctx.setData({ [key]: val });
}

/**
 * 弹窗输入变更 (通用SKU)
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onModalSkuInput(ctx, e) {
  handleIndexInput(e, ctx, 'scanConfirm.skuList', 'inputQuantity');
}

/**
 * 确认提交 - SKU批量提交
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 提交完成后关闭弹窗
 */
async function onConfirmScan(ctx) {
  if (ctx.data.scanConfirm.loading) {
    return;
  }
  ctx.setData({ 'scanConfirm.loading': true });

  try {
    const { detail, skuList } = ctx.data.scanConfirm;

    // 通用批量提交
    if (skuList?.length > 0) {
      await processSKUSubmit(ctx, { detail, skuList });
    } else {
      throw new Error('无效的提交数据');
    }
  } catch (e) {
    console.error('Submit failed:', e);
    toast.error(e.errMsg || e.message || '提交失败');
  } finally {
    ctx.setData({
      'scanConfirm.loading': false,
      'scanConfirm.visible': false,
    });
  }
}

/**
 * 处理普通SKU批量提交
 * @param {Object} ctx - Page 上下文
 * @param {Object} params - 提交参数
 * @param {Object} params.detail - 订单详情
 * @param {Array} params.skuList - SKU列表
 * @returns {Promise<boolean>} 提交是否成功
 */
async function processSKUSubmit(ctx, { detail, skuList }) {
  const validation = SKUProcessor.validateSKUInputBatch(skuList);
  if (!validation.valid) {
    toast.error(validation.errors[0]);
    return false;
  }

  const requests = SKUProcessor.generateScanRequests(
    validation.validList,
    detail.orderNo,
    detail.styleNo,
    detail.progressStage,
    { scanCode: detail.scanCode || detail.orderNo || '' },
  );

  const tasks = requests.map(req =>
    api.production.executeScan({
      ...req,
      scanType: normalizeScanType(detail.progressStage, ctx.mapScanType(detail.progressStage)),
    }),
  );

  if (tasks.length === 0) {
    throw new Error('请至少输入一个数量');
  }

  const results = await Promise.all(tasks);
  const invalid = (results || []).find(r => !(r && r.scanRecord && (r.scanRecord.id || r.scanRecord.recordId)));
  if (invalid) {
    const msg = invalid && invalid.message ? String(invalid.message) : '部分扫码未落库，请重试';
    throw new Error(msg);
  }

  toast.success('批量提交成功');
  ctx.handleScanSuccess({
    success: true,
    message: `成功提交 ${tasks.length} 条记录`,
    orderNo: detail.orderNo,
    processName: detail.progressStage,
  });

  return true;
}

module.exports = {
  showConfirmModal,
  onCancelScan,
  onModalSkuInput,
  onConfirmScan,
  processSKUSubmit,
  handleIndexInput,
};
