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

  // 安全读取扫码类型（scanTypeOptions 可能未定义）
  const scanTypeOptions = ctx.data.scanTypeOptions || [];
  const scanTypeIndex = ctx.data.scanTypeIndex || 0;
  const currentScanTypeValue = scanTypeOptions[scanTypeIndex]?.value || '';

  const isProcurement =
    currentScanTypeValue === 'procurement' ||
    data.progressStage === '采购';

  const { skuList, formItems, summary, materialPurchases } =
    _buildConfirmModalData(data, isProcurement);

  const sizeDetails = _buildSizeDetails(skuList);
  const cuttingTasks = _buildCuttingTasks(data);

  ctx.setData({
    scanConfirm: {
      visible: true,
      loading: false,
      detail: { ...data, isProcurement, sizeDetails },
      skuList: formItems,
      summary: summary,
      cuttingTasks: cuttingTasks,
      materialPurchases: materialPurchases,
      bomFallback: data.bomFallback || false,
      fromMyTasks: data.fromMyTasks || false,
    },
  });
}

/**
 * 构建确认弹窗的数据（采购/SKU模式分支）
 * @param {Object} data - 原始数据
 * @param {boolean} isProcurement - 是否采购模式
 * @returns {Object} 构建后的数据对象
 * @private
 */
function _buildConfirmModalData(data, isProcurement) {
  if (isProcurement && data.materialPurchases && data.materialPurchases.length > 0) {
    return {
      skuList: [],
      formItems: [],
      summary: {},
      materialPurchases: data.materialPurchases.map((item, idx) => ({
        id: item.id || idx,
        materialName: item.materialName || '未知面料',
        materialCode: item.materialCode || '',
        specifications: item.specifications || '',
        unit: item.unit || '米',
        purchaseQuantity: item.purchaseQuantity || 0,
        arrivedQuantity: item.arrivedQuantity || 0,
        pendingQuantity: (item.purchaseQuantity || 0) - (item.arrivedQuantity || 0),
        inputQuantity: (item.purchaseQuantity || 0) - (item.arrivedQuantity || 0),
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        unitPrice: item.unitPrice,
        purchaseNo: item.purchaseNo || '',
      })),
    };
  }

  const skuList = data.skuItems
    ? SKUProcessor.normalizeOrderItems(data.skuItems, data.orderNo, data.styleNo)
    : [];

  return {
    skuList,
    formItems: SKUProcessor.buildSKUInputList(skuList),
    summary: SKUProcessor.getSummary(skuList),
    materialPurchases: [],
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

/**
 * 构建裁剪任务列表
 * @param {Object} data - 弹窗原始数据
 * @returns {Array} 裁剪任务列表
 * @private
 */
function _buildCuttingTasks(data) {
  if (data.progressStage !== '裁剪' || !data.skuItems) return [];
  const result = [];
  for (const item of data.skuItems) {
    const totalQty = item.quantity || item.num || 0;
    const sizeStr = String(item.size || '').trim();
    const sizes = sizeStr.includes(',')
      ? sizeStr.split(',').map(s => s.trim()).filter(Boolean)
      : [sizeStr || '均码'];

    if (sizes.length <= 1) {
      result.push({
        color: item.color,
        size: sizes[0],
        plannedQuantity: totalQty,
        cuttingInput: totalQty || '',
      });
    } else {
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
  const idx = e.currentTarget.dataset.idx;
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
 * 确认提交 - 路由到采购/裁剪/SKU提交
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 提交完成后关闭弹窗
 */
async function onConfirmScan(ctx) {
  if (ctx.data.scanConfirm.loading) {
    return;
  }
  ctx.setData({ 'scanConfirm.loading': true });

  try {
    const { detail, skuList, cuttingTasks, materialPurchases } = ctx.data.scanConfirm;

    // 采购任务处理
    if (detail.isProcurement && materialPurchases?.length > 0) {
      ctx.validateProcurementData();
      await ctx.processProcurementSubmit({ materialPurchases });
      ctx.setData({
        'scanConfirm.loading': false,
        'scanConfirm.visible': false,
      });
      return;
    }

    // 裁剪特殊处理（菲号生成有单独按钮 onRegenerateCuttingBundles）
    if (detail.progressStage === '裁剪' && cuttingTasks.length > 0) {
      // 裁剪通常通过"生成菲号"按钮提交，这里按普通工序处理
    }

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
