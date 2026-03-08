/**
 * 扫码页面 - 生产扫码主页
 * Version: 2.3 (重构版)
 * Date: 2026-02-15
 *
 * 🔧 重构说明 (v2.2 → v2.3):
 * 1. 提取 data 配置到 scanDataConfig.js (~150行)
 * 2. 提取生命周期到 scanLifecycleMixin.js (~200行)
 * 3. 提取核心扫码逻辑到 scanCoreMixin.js (~370行)
 * 4. 保留所有 Handler 委托方法（100% 业务逻辑兼容）
 * 5. 使用微信小程序 Behavior 机制实现 Mixin
 * 6. 主文件减少: 916行 → 427行 (-53%)
 *
 * 功能:
 * 1. 集成 ScanHandler 业务处理器 (面向对象架构)
 * 2. 支持多种扫码模式 (菲号/订单/SKU/样板)
 * 3. 支持手动输入 + 工序识别
 * 4. 模式切换: 单选(自动/订单/SKU) + 快捷模式(库存查询)
 * 5. 撤销功能 (UndoHandler)
 * 6. 采购任务支持 (ProcurementHandler + 列表触发)
 * 7. 质检入库弹窗 (QualityHandler)
 * 8. 退回重扫功能 (RescanHandler)
 * 9. 样板生产扫码确认 (PatternHandler)
 * 10. 🆕 扫码结果确认页 - 识别工序后不自动提交 (ScanResultHandler)
 * 11. 历史分组折叠展开 (HistoryHandler)
 * 12. 🆕 采购/裁剪任务列表 + 从铃铛跳转的统一处理入口
 * 13. 修复: 使用 eventBus.on 替代 subscribe (2026-02-01)
 * 14. 🆕 扫码结果确认页 - 2026-02-06 - 混合模式 (手动+自动)
 *
 * 业务处理器职责分配:
 * - ScanHandler: 扫码逻辑 + QRCodeParser
 * - UndoHandler: 撤销倒计时
 * - ProcurementHandler: 采购确认 + 提交
 * - QualityHandler: 质检入库弹窗
 * - RescanHandler: 退回重扫
 * - PatternHandler: 样板扫码
 * - ScanResultHandler: 混合模式扫码结果确认
 * - CuttingHandler: 裁剪确认 + 提交 + 任务列表
 * - HistoryHandler: 历史记录折叠/展开 + 分组
 * - ConfirmModalHandler: 通用确认弹窗 + SKU提交
 * - StockHandler: 库存查询
 *
 * @version 2.3
 * @date 2026-02-15
 */

// ==================== 导入模块 ====================
const { getUserInfo } = require('../../utils/storage');
const { safeNavigate, toast } = require('../../utils/uiHelper');

// 导入 Mixins (生命周期 + 核心业务 + 数据配置)
const scanLifecycleMixin = require('./mixins/scanLifecycleMixin');
const scanCoreMixin = require('./mixins/scanCoreMixin');
const { scanPageData } = require('./mixins/scanDataConfig');

// 导入 Handlers (所有委托调用)
const QualityHandler = require('./handlers/QualityHandler');
const PatternHandler = require('./handlers/PatternHandler');
const UndoHandler = require('./handlers/UndoHandler');
const StockHandler = require('./handlers/StockHandler');
const RescanHandler = require('./handlers/RescanHandler');
const ProcurementHandler = require('./handlers/ProcurementHandler');
const CuttingHandler = require('./handlers/CuttingHandler');
const ScanResultHandler = require('./handlers/ScanResultHandler');
const ConfirmModalHandler = require('./handlers/ConfirmModalHandler');
const HistoryHandler = require('./handlers/HistoryHandler');

// ==================== Page 定义 ====================

Page({
  // 使用 Mixins (微信小程序 behaviors 机制)
  behaviors: [scanLifecycleMixin, scanCoreMixin],

  // 数据对象 (从 scanDataConfig 导入)
  data: scanPageData,

  // 业务处理器实例
  scanHandler: null,
  // 事件订阅取消函数
  unsubscribeEvents: null,

  // ==================== 历史记录（委托 HistoryHandler）====================

  /**
   * 创建分组键
   * @param {string} orderNo - 订单号
   * @param {string} progressStage - 工序名称
   * @returns {string} 分组键
   */
  _createGroupKey(orderNo, progressStage) {
    return HistoryHandler.groupScanRecords ? `${orderNo}_${progressStage}` : '';
  },

  /**
   * 分组扫码记录
   * @param {Array} records - 扫码记录数组
   * @returns {Array} 分组后的数组
   */
  _groupScanRecords(records) {
    return HistoryHandler.groupScanRecords(records);
  },

  /**
   * 合并分组历史
   * @param {Array} existing - 现有分组
   * @param {Array} newGroups - 新分组
   * @returns {Array} 合并后的分组
   */
  _mergeGroupedHistory(existing, newGroups) {
    return HistoryHandler.mergeGroupedHistory(existing, newGroups);
  },

  /**
   * 加载我的历史记录
   * @param {boolean} refresh - 是否刷新
   * @returns {Promise<void>} 无返回值
   */
  async loadMyHistory(refresh) {
    return HistoryHandler.loadMyHistory(this, refresh);
  },

  /**
   * 加载更多历史记录
   * @returns {void} 无返回值
   */
  loadMoreMyHistory() {
    HistoryHandler.loadMoreMyHistory(this);
  },

  /**
   * 切换分组展开/折叠
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  toggleGroupExpand(e) {
    HistoryHandler.toggleGroupExpand(this, e);
  },

  /**
   * 切换尺码明细展开/折叠
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  toggleSizeExpand(e) {
    HistoryHandler.toggleSizeExpand(this, e);
  },

  /**
   * 处理质检操作
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onHandleQuality(e) {
    HistoryHandler.onHandleQuality(this, e);
  },

  // ==================== 快捷导航（历史记录 / 当月记录） ====================

  /**
   * 跳转到历史记录页面
   * @returns {void} 无返回值
   */
  onGoToHistory() {
    safeNavigate({ url: '/pages/scan/history/index' }).catch(() => {
      // 导航失败忽略（通常是重复点击）
    });
  },

  /**
   * 跳转到当月记录页面
   * @returns {void} 无返回值
   */
  onGoToMonthly() {
    safeNavigate({ url: '/pages/scan/monthly/index' }).catch(() => {
      // 导航失败忽略（通常是重复点击）
    });
  },

  // ==================== 退回重扫（委托 RescanHandler）====================

  /**
   * 点击退回重扫
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onRescanRecord(e) {
    RescanHandler.onRescanRecord(this, e);
  },

  /**
   * 取消退回重扫
   * @returns {void} 无返回值
   */
  onCancelRescan() {
    RescanHandler.onCancelRescan(this);
  },

  /**
   * 确认退回重扫
   * @returns {Promise<void>} 无返回值
   */
  async onConfirmRescan() {
    return RescanHandler.onConfirmRescan(this);
  },

  // ==================== 采购/裁剪任务列表（委托 Handler）====================

  /**
   * 加载我的采购任务列表
   * @returns {Promise<void>} 无返回值
   */
  async loadMyProcurementTasks() {
    return ProcurementHandler.loadMyProcurementTasks(this);
  },

  /**
   * 加载我的裁剪任务列表
   * @returns {Promise<void>} 无返回值
   */
  async loadMyCuttingTasks() {
    return CuttingHandler.loadMyCuttingTasks(this);
  },

  // ==================== 库存查询（委托 StockHandler）====================

  /**
   * 处理库存查询
   * @param {string} codeStr - 扫码字符串
   * @returns {Promise<void>} 无返回值
   */
  async handleStockQuery(codeStr) {
    this._ensureScanHandler();
    const qrParser = this.scanHandler ? this.scanHandler.qrParser : null;
    return StockHandler.handleStockQuery(this, codeStr, qrParser);
  },

  /**
   * 显示库存更新对话框
   * @param {string} skuCode - SKU代码
   * @returns {void} 无返回值
   */
  showStockUpdateDialog(skuCode) {
    StockHandler.showStockUpdateDialog(skuCode);
  },

  // ==================== 扫码结果确认页（委托 ScanResultHandler） ====================

  /**
   * 显示扫码结果确认页（混合模式）
   * @param {Object} data - 扫码结果数据
   * @returns {void} 无返回值
   */
  showScanResultConfirm(data) {
    ScanResultHandler.showScanResultConfirm(this, data);
  },

  /**
   * 关闭扫码结果确认页
   * @returns {void} 无返回值
   */
  closeScanResultConfirm() {
    ScanResultHandler.closeScanResultConfirm(this);
  },

  /**
   * 扫码结果页 - 数量输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onScanResultQuantityInput(e) {
    ScanResultHandler.onScanResultQuantityInput(this, e);
  },

  /**
   * 扫码结果页 - 工序滚动选择
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onProcessScrollSelect(e) {
    ScanResultHandler.onProcessScrollSelect(this, e);
  },

  /**
   * 扫码结果页 - 入库仓库快捷选择
   * @param {Object} e - 事件对象
   */
  onResultWarehouseChipTap(e) {
    ScanResultHandler.onResultWarehouseChipTap(this, e);
  },

  /**
   * 扫码结果页 - 入库仓库手动输入
   * @param {Object} e - 事件对象
   */
  onResultWarehouseInput(e) {
    ScanResultHandler.onResultWarehouseInput(this, e);
  },

  /**
   * 扫码结果页 - 清除仓库选择
   */
  onResultWarehouseClear() {
    ScanResultHandler.onResultWarehouseClear(this);
  },

  /**
   * 扫码结果页 - 确认提交
   * @returns {Promise<void>} 无返回值
   */
  async onConfirmScanResult() {
    return ScanResultHandler.onConfirmScanResult(this);
  },

  // ==================== 确认弹窗（委托 ConfirmModalHandler） ====================

  /**
   * 显示确认弹窗
   * @param {Object} data - 弹窗数据
   * @returns {void} 无返回值
   */
  showConfirmModal(data) {
    ConfirmModalHandler.showConfirmModal(this, data);
  },

  /**
   * 取消扫码
   * @returns {void} 无返回值
   */
  onCancelScan() {
    ConfirmModalHandler.onCancelScan(this);
  },

  onOpenSosModal() {
    ConfirmModalHandler.onOpenSosModal(this);
  },

  /**
   * 确认弹窗 - SKU输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onModalSkuInput(e) {
    ConfirmModalHandler.onModalSkuInput(this, e);
  },

  /**
   * 确认提交扫码
   * @returns {Promise<void>} 无返回值
   */
  async onConfirmScan() {
    return ConfirmModalHandler.onConfirmScan(this);
  },

  /**
   * 处理SKU提交
   * @param {Object} params - 提交参数
   * @returns {Promise<void>} 无返回值
   */
  async processSKUSubmit(params) {
    return ConfirmModalHandler.processSKUSubmit(this, params);
  },

  // ==================== 采购输入（委托 ProcurementHandler） ====================

  /**
   * 采购面料输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onMaterialInput(e) {
    ProcurementHandler.onMaterialInput(this, e);
  },

  /**
   * 采购备注输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onMaterialRemarkInput(e) {
    ProcurementHandler.onMaterialRemarkInput(this, e);
  },

  // ==================== 裁剪输入（委托 CuttingHandler） ====================

  /**
   * 裁剪弹窗输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onModalCuttingInput(e) {
    CuttingHandler.onModalCuttingInput(this, e);
  },

  /**
   * 自动导入裁剪数据
   * @returns {void} 无返回值
   */
  onAutoImportCutting() {
    CuttingHandler.onAutoImportCutting(this);
  },

  /**
   * 清空裁剪输入
   * @returns {void} 无返回值
   */
  onClearCuttingInput() {
    CuttingHandler.onClearCuttingInput(this);
  },

  // ==================== 采购任务操作（委托 ProcurementHandler） ====================

  /**
   * 处理采购任务点击
   * @param {Object} e - 事件对象
   * @returns {Promise<void>} 无返回值
   */
  async onHandleProcurement(e) {
    return ProcurementHandler.onHandleProcurement(this, e);
  },

  /**
   * 提交采购任务
   * @returns {Promise<void>} 无返回值
   */
  async onSubmitProcurement() {
    return ProcurementHandler.onSubmitProcurement(this);
  },

  /**
   * 处理采购提交逻辑
   * @param {Object} params - 提交参数
   * @returns {Promise<void>} 无返回值
   */
  async processProcurementSubmit(params) {
    return ProcurementHandler.processProcurementSubmit(this, params);
  },

  /**
   * 验证采购数据
   * @returns {boolean} 验证结果
   */
  validateProcurementData() {
    return ProcurementHandler.validateProcurementData();
  },

  // ==================== 裁剪任务操作（委托 CuttingHandler） ====================

  /**
   * 处理裁剪任务点击
   * @param {Object} e - 事件对象
   * @returns {Promise<void>} 无返回值
   */
  async onHandleCutting(e) {
    return CuttingHandler.onHandleCutting(this, e);
  },

  /**
   * 重新生成裁剪菲号
   * @returns {Promise<void>} 无返回值
   */
  async onRegenerateCuttingBundles() {
    return CuttingHandler.onRegenerateCuttingBundles(this);
  },

  // ==================== 领取任务 ====================

  /**
   * 仅领取任务（不提交）
   * @returns {Promise<void>} 无返回值
   */
  async onReceiveOnly() {
    if (this.data.scanConfirm.loading) return;
    this.setData({ 'scanConfirm.loading': true });
    try {
      const detail = this.data.scanConfirm.detail;
      const userInfo = getUserInfo();
      const uid = userInfo?.id || userInfo?.userId;
      if (!userInfo || !uid) throw new Error('请先登录');

      if (detail.progressStage === '裁剪') {
        await CuttingHandler.receiveCuttingTask(this, detail, userInfo);
      } else if (detail.isProcurement) {
        await ProcurementHandler.receiveProcurementTask(this, userInfo);
      }
    } catch (e) {
      toast.error(e.errMsg || e.message || '领取失败');
    } finally {
      this.setData({ 'scanConfirm.loading': false });
    }
  },

  // ==================== 质检/入库（委托 QualityHandler） ====================

  /**
   * 显示质检结果弹窗
   * @param {Object} detail - 质检数据
   * @returns {void} 无返回值
   */
  showQualityModal(detail) {
    QualityHandler.showQualityModal(this, detail);
  },

  /**
   * 关闭质检弹窗
   * @returns {void} 无返回值
   */
  closeQualityModal() {
    QualityHandler.closeQualityModal(this);
  },

  /**
   * 阻止事件冒泡
   * @returns {void} 无返回值
   */
  stopPropagation() {
    /* 阻止事件冒泡 */
  },

  /**
   * 选择质检结果
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onSelectQualityResult(e) {
    QualityHandler.onSelectQualityResult(this, e);
  },

  /**
   * 不合格数量输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onDefectiveQuantityInput(e) {
    QualityHandler.onDefectiveQuantityInput(this, e);
  },

  /**
   * 质检弹窗 - 内联选择器点击（缺陷分类/处理方式/仓库）
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onQmSelectorTap(e) {
    QualityHandler.onQmSelectorTap(this, e);
  },

  /**
   * 备注输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onRemarkInput(e) {
    QualityHandler.onRemarkInput(this, e);
  },

  /**
   * 上传质检照片
   * @returns {void} 无返回值
   */
  onUploadQualityImage() {
    QualityHandler.onUploadQualityImage(this);
  },

  /**
   * 删除质检照片
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onDeleteQualityImage(e) {
    QualityHandler.onDeleteQualityImage(this, e);
  },

  /**
   * 提交质检结果
   * @returns {Promise<void>} 无返回值
   */
  async submitQualityResult() {
    await QualityHandler.submitQualityResult(this);
  },

  /**
   * 采纳AI质检建议到备注
   */
  onAdoptAiSuggestion() {
    QualityHandler.onAdoptAiSuggestion(this);
  },

  // ==================== 撤销功能（委托 UndoHandler）====================

  /**
   * 启动撤销倒计时
   * @param {Object} record - 扫码记录
   * @returns {void} 无返回值
   */
  startUndoTimer(record) {
    UndoHandler.startUndoTimer(this, record);
  },

  /**
   * 停止撤销定时器
   * @returns {void} 无返回值
   */
  stopUndoTimer() {
    UndoHandler.stopUndoTimer(this);
  },

  /**
   * 执行撤销操作（WXML 绑定 bindtap="onUndoLast"）
   * @returns {Promise<void>} 无返回值
   */
  async handleUndo() {
    return UndoHandler.handleUndo(this);
  },

  /**
   * WXML bindtap="onUndoLast" 的别名（扫码结果卡片上的撤销按钮）
   * @returns {Promise<void>}
   */
  async onUndoLast() {
    return UndoHandler.handleUndo(this);
  },

  /**
   * 历史记录列表中的撤回按钮（catchtap="onUndoHistoryRecord"）
   * 适用于1小时内、未参与工资结算、下一工序未扫码的记录
   * @param {Object} e - 事件对象，e.currentTarget.dataset.recordId
   */
  async onUndoHistoryRecord(e) {
    const recordId = e.currentTarget.dataset.recordId;
    if (!recordId) {
      require('./../../utils/uiHelper').toast.error('缺少记录ID');
      return;
    }
    wx.showModal({
      title: '确认撤回',
      content: '确认撤回该扫码记录吗？撤回后无法恢复。',
      confirmText: '撤回',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '正在撤回...', mask: true });
        try {
          await require('./../../utils/api').production.undoScan({ recordId });
          require('./../../utils/uiHelper').toast.success('已撤回');
          // 刷新面板
          this.loadMyPanel(true);
          const { eventBus } = require('./../../utils/eventBus');
          if (eventBus && typeof eventBus.emit === 'function') {
            eventBus.emit('DATA_REFRESH');
          }
        } catch (err) {
          require('./../../utils/uiHelper').toast.error('撤回失败: ' + (err.errMsg || err.message || '未知错误'));
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  // ==================== 历史记录 - 本地（委托 HistoryHandler）====================

  /**
   * 加载本地历史记录
   * @returns {void} 无返回值
   */
  loadLocalHistory() {
    HistoryHandler.loadLocalHistory(this);
  },

  /**
   * 添加到本地历史
   * @param {Object} record - 扫码记录
   * @returns {void} 无返回值
   */
  addToLocalHistory(record) {
    HistoryHandler.addToLocalHistory(this, record);
  },

  /**
   * 点击历史记录项
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onTapHistoryItem(e) {
    HistoryHandler.onTapHistoryItem(this, e);
  },

  // ==================== 样板生产（委托 PatternHandler） ====================

  /**
   * 显示样板生产确认弹窗
   * @param {Object} data - 样板数据
   * @returns {void} 无返回值
   */
  showPatternConfirmModal(data) {
    PatternHandler.showPatternConfirmModal(this, data);
  },

  /**
   * 关闭样板生产弹窗
   * @returns {void} 无返回值
   */
  closePatternConfirm() {
    PatternHandler.closePatternConfirm(this);
  },

  /**
   * 样板操作类型变更
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onPatternOperationChange(e) {
    PatternHandler.onPatternOperationChange(this, e);
  },

  /**
   * 样板数量输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onPatternQuantityInput(e) {
    PatternHandler.onPatternQuantityInput(this, e);
  },

  /**
   * 样板仓库输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onPatternWarehouseInput(e) {
    PatternHandler.onPatternWarehouseInput(this, e);
  },

  /**
   * 样板备注输入
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onPatternRemarkInput(e) {
    PatternHandler.onPatternRemarkInput(this, e);
  },

  /**
   * 提交单个样板扫码
   * @returns {Promise<void>} 无返回值
   */
  async submitPatternScan() {
    await PatternHandler.submitPatternScan(this);
  },

  /**
   * 提交全部样板扫码
   * @returns {Promise<void>} 无返回值
   */
  async submitPatternScanAll() {
    await PatternHandler.submitPatternScanAll(this);
  },

  // ==================== 仓库选择（入库扫码时显示）====================

  /**
   * 点击仓库快捷选项 chip
   * @param {Object} e - 事件对象
   * @returns {void}
   */
  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    // 再次点击同一仓库则取消选择
    if (this.data.warehouse === value) {
      this.setData({ warehouse: '' });
      try { wx.setStorageSync('scan_pref_warehouse', ''); } catch (_) {}
    } else {
      this.setData({ warehouse: value });
      try { wx.setStorageSync('scan_pref_warehouse', value); } catch (_) {}
    }
  },

  /**
   * 检查当前网络状态并给出明确提示
   * @returns {void}
   */
  onCheckNetwork() {
    wx.getNetworkType({
      success(res) {
        if (res.networkType === 'none') {
          wx.showModal({
            title: '无网络连接',
            content: '当前设备没有网络连接，请开启 Wi-Fi 或移动数据后重试',
            showCancel: false,
            confirmText: '知道了',
          });
        } else {
          wx.showToast({ title: `网络正常(${res.networkType})，请重新扫码`, icon: 'none', duration: 2500 });
        }
      },
    });
  },

  /**
   * 手动触发离线队列同步（点击提示条时调用）
   * @returns {void}
   */
  onManualSync() {
    this._flushOfflineQueue();
  },

  /**
   * 手动输入仓库代码
   * @param {Object} e - 事件对象
   * @returns {void}
   */
  onWarehouseCodeInput(e) {
    this.setData({ warehouse: e.detail.value });
  },

  /**
   * 清除仓库选择
   * @returns {void}
   */
  onWarehouseClear() {
    this.setData({ warehouse: '' });
  },
});
