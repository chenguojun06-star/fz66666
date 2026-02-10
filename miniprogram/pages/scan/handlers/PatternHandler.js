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
};

/**
 * 显示样板确认弹窗
 * @param {Object} page - 页面实例
 * @param {Object} data - 样板扫码数据
 * @returns {void}
 */
function showPatternConfirmModal(page, data) {
  const patternDetail = data.patternDetail || {};
  page.setData({
    patternConfirm: {
      visible: true,
      loading: false,
      patternId: data.patternId,
      styleNo: data.styleNo,
      color: data.color,
      quantity: data.quantity,
      status: data.status,
      operationType: data.operationType,
      operationLabel: OPERATION_LABELS[data.operationType] || '操作',
      designer: data.designer || patternDetail.designer || '-',
      patternDeveloper: data.patternDeveloper || patternDetail.patternDeveloper || '-',
      deliveryTime: patternDetail.deliveryTime || '-',
      patternDetail: patternDetail,
      remark: '',
    },
  });
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
  page.setData({
    'patternConfirm.operationType': operationType,
    'patternConfirm.operationLabel': OPERATION_LABELS[operationType] || '操作',
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

  page.setData({ 'patternConfirm.loading': true });

  try {
    const result = await page.scanHandler.submitPatternScan({
      patternId: patternConfirm.patternId,
      operationType: patternConfirm.operationType,
      operatorRole: 'PLATE_WORKER',
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
    toast.error(e.message || '提交失败');
  } finally {
    page.setData({ 'patternConfirm.loading': false });
  }
}

module.exports = {
  showPatternConfirmModal,
  closePatternConfirm,
  onPatternOperationChange,
  onPatternRemarkInput,
  submitPatternScan,
};
