/**
 * 质检/入库 Handler
 * 从 scan/index.js 抽取，处理质检弹窗及入库提交逻辑
 */
const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const toast = require('../../../utils/uiHelper').toast;

/**
 * 显示质检弹窗
 */
function showQualityModal(page, detail) {
  page.setData({
    'qualityModal.show': true,
    'qualityModal.detail': detail,
    'qualityModal.result': '', // 默认为空，强制用户选择
    'qualityModal.unqualifiedQuantity': '',
    'qualityModal.defectCategory': 0,
    'qualityModal.handleMethod': 0,
    'qualityModal.remark': '',
    'qualityModal.images': [],
  });
}

function closeQualityModal(page) {
  page.setData({ 'qualityModal.show': false });
}

/**
 * 通用内联选择器点击处理（替代原生 picker）
 * @param {Object} page - Page 上下文
 * @param {Object} e - 事件对象，包含 data-index 和 data-field
 */
function onQmSelectorTap(page, e) {
  const { index, field } = e.currentTarget.dataset;
  if (field && index !== undefined) {
    page.setData({ [`qualityModal.${field}`]: Number(index) });
  }
}

function onSelectQualityResult(page, e) {
  page.setData({ 'qualityModal.result': e.currentTarget.dataset.value });
}

function onDefectiveQuantityInput(page, e) {
  page.setData({ 'qualityModal.unqualifiedQuantity': e.detail.value });
}

function onRemarkInput(page, e) {
  page.setData({ 'qualityModal.remark': e.detail.value });
}

/**
 * 上传质检照片
 */
function onUploadQualityImage(page) {
  const currentCount = page.data.qualityModal.images.length;
  if (currentCount >= 5) {
    toast.info('最多上传5张照片');
    return;
  }
  wx.chooseMedia({
    count: 5 - currentCount,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    success: async res => {
      const tempFiles = res.tempFiles || [];
      wx.showLoading({ title: '正在上传...', mask: true });
      try {
        const uploadPromises = tempFiles.map(file =>
          api.common.uploadImage(file.tempFilePath)
        );
        const uploadedUrls = await Promise.all(uploadPromises);
        wx.hideLoading();
        page.setData({
          'qualityModal.images': [...page.data.qualityModal.images, ...uploadedUrls],
        });
        toast.success(`成功上传${uploadedUrls.length}张图片`);
      } catch (error) {
        wx.hideLoading();
        toast.error(error?.errMsg || error?.message || '图片上传失败');
        console.error('[Upload Image Error]', error);
      }
    },
  });
}

function onDeleteQualityImage(page, e) {
  const index = e.currentTarget.dataset.index;
  const images = [...page.data.qualityModal.images];
  images.splice(index, 1);
  page.setData({ 'qualityModal.images': images });
}

/**
 * 构建质检验收 (quality_confirm) payload
 * 调用 executeScan，只记录质检结果，不入库
 * @private
 */
function _buildQualityBasePayload(detail, qualityModal, userInfo) {
  const totalQty = detail.quantity || 1;
  const bundleNoNum = detail.bundleNo ? parseInt(detail.bundleNo, 10) : null;

  return {
    scanCode: detail.scanCode || '',
    scanType: 'quality',
    qualityStage: 'confirm',
    qualityResult: qualityModal.result, // 'qualified' | 'unqualified'
    orderNo: detail.orderNo || '',
    orderId: detail.orderId || '',
    styleNo: detail.styleNo || '',
    cuttingBundleId: detail.bundleId || '',
    cuttingBundleNo: bundleNoNum && !isNaN(bundleNoNum) ? bundleNoNum : null,
    quantity: totalQty,
    operatorId: userInfo.id || '',
    operatorName: userInfo.realName || userInfo.username || '',
  };
}

/**
 * 处理不合格质检信息
 * @private
 */
function _handleUnqualifiedInfo(page, qualityModal, payload) {
  const { handleMethods } = page.data;
  // 缺陷分类映射（与PC端 DEFECT_CATEGORY_OPTIONS 完全一致）
  const categoryValueMap = [
    'appearance_integrity', // 外观完整性问题
    'size_accuracy',       // 尺寸精度问题
    'process_compliance',  // 工艺规范性问题
    'functional_effectiveness', // 功能有效性问题
    'other',               // 其他问题
  ];
  const categoryIndex = parseInt(qualityModal.defectCategory, 10) || 0;
  payload.defectCategory = categoryValueMap[categoryIndex] || 'other';
  const selectedMethod = handleMethods[qualityModal.handleMethod] || '返修';
  payload.defectRemark = selectedMethod;
  // 次品件数：填写了就传，否则默认等于总件数（整菲号全是次品）
  const defectQty = parseInt(qualityModal.unqualifiedQuantity, 10);
  payload.defectQuantity = defectQty > 0 ? defectQty : (payload.quantity || 0);
  if (qualityModal.images && qualityModal.images.length > 0) {
    payload.unqualifiedImageUrls = JSON.stringify(qualityModal.images);
  }
}

/**
 * 提交质检结果（只记录结果，不入库）
 */
async function submitQualityResult(page) {
  const { qualityModal } = page.data;
  const detail = qualityModal.detail;
  const userInfo = getUserInfo();

  if (!detail) {
    toast.error('质检数据异常');
    return;
  }
  if (!userInfo || !userInfo.id) {
    toast.error('请先登录');
    return;
  }
  if (!qualityModal.result) {
    toast.error('请先选择质检结果（合格/不合格）');
    return;
  }

  wx.showLoading({ title: '提交中...', mask: true });

  try {
    const payload = _buildQualityBasePayload(detail, qualityModal, userInfo);
    if (qualityModal.result === 'unqualified') {
      _handleUnqualifiedInfo(page, qualityModal, payload);
    }
    await api.production.executeScan(payload);
    const successMsg = qualityModal.result === 'qualified'
      ? '质检合格已记录，请进行包装工序'
      : '不合格已记录✅';
    toast.success(successMsg);
    closeQualityModal(page);
    page.loadMyPanel(true);
  } catch (e) {
    console.error('[submitQualityResult] 提交失败:', e);
    const errMsg = e?.errMsg || e?.message || '提交失败';
    wx.showModal({
      title: '提交失败',
      content: errMsg,
      showCancel: false,
      confirmText: '知道了',
    });
  } finally {
    wx.hideLoading();
  }
}

module.exports = {
  showQualityModal,
  closeQualityModal,
  onQmSelectorTap,
  onSelectQualityResult,
  onDefectiveQuantityInput,
  onRemarkInput,
  onUploadQualityImage,
  onDeleteQualityImage,
  submitQualityResult,
};
