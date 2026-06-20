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
 * 6. 质检入库页面 (QualityHandler → /pages/scan/quality/index)
 * 7. 退回重扫页面 (RescanHandler → /pages/scan/rescan/index)
 * 8. 样板生产扫码确认 (PatternScanProcessor → /pages/scan/pattern/index)
 * 9. 扫码结果确认页 (ScanResultHandler → /pages/scan/scan-result/index)
 * 10. 确认弹窗页 (ConfirmModalHandler → /pages/scan/confirm/index)
 * 11. 历史分组折叠展开 (HistoryHandler)
 * 12. 修复: 使用 eventBus.on 替代 subscribe (2026-02-01)
 * 13. 🆕 扫码结果确认页 - 2026-02-06 - 混合模式 (手动+自动)
 * 14. 🆕 采购/裁剪任务已迁移到独立页面 (pkg-cutting/ + pkg-procurement/)，扫码页不再包含相关弹窗与处理器
 *
 * 业务处理器职责分配:
 * - ScanHandler: 扫码逻辑 + QRCodeParser
 * - UndoHandler: 撤销倒计时
 * - QualityHandler: 质检页面导航
 * - RescanHandler: 退回重扫页面导航
 * - ScanResultHandler: 扫码结果确认页导航
 * - HistoryHandler: 历史记录折叠/展开 + 分组
 * - ConfirmModalHandler: 确认页导航 (样板/普通)
 * - StockHandler: 库存查询
 *
 * @version 2.3
 * @date 2026-02-15
 */

// ==================== 导入模块 ====================
const { safeNavigate, toast } = require('../../utils/uiHelper');

// 导入 Mixins (生命周期 + 核心业务 + 数据配置)
const scanLifecycleMixin = require('./mixins/scanLifecycleMixin');
const scanCoreMixin = require('./mixins/scanCoreMixin');
const { scanPageData } = require('./mixins/scanDataConfig');

// 导入 Handlers (所有委托调用)
const QualityHandler = require('./handlers/QualityHandler');
const UndoHandler = require('./handlers/UndoHandler');
const StockHandler = require('./handlers/StockHandler');
const RescanHandler = require('./handlers/RescanHandler');
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

  /**
   * 处理采购任务（跳转到采购任务列表页）
   * WXML: scan-history.wxml bindtap="onHandleProcurement"
   */
  onHandleProcurement(e) {
    const groupId = e.currentTarget.dataset.groupId;
    const recordIdx = e.currentTarget.dataset.recordIdx;
    const app = getApp();
    app.globalData.procurementScanData = { groupId, recordIdx };
    safeNavigate({ url: '/pages/procurement/task-list/index' }).catch(() => {});
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
    safeNavigate({ url: '/pages/payroll/payroll' }).catch(() => {
      // 导航失败忽略（通常是重复点击）
    });
  },

  // ==================== 退回重扫（委托 RescanHandler）====================

  /**
   * 点击退回重扫 — 跳转独立页面 /pages/scan/rescan/index
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onRescanRecord(e) {
    RescanHandler.onRescanRecord(this, e);
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
   * 显示扫码结果确认页 — 跳转独立页面 /pages/scan/scan-result/index
   * @param {Object} data - 扫码结果数据
   * @returns {void} 无返回值
   */
  showScanResultConfirm(data) {
    ScanResultHandler.showScanResultConfirm(this, data);
  },

  // ==================== 确认弹窗（委托 ConfirmModalHandler） ====================

  /**
   * 显示确认弹窗 — 样板模式跳转 /pages/scan/pattern/index，普通模式跳转 /pages/scan/confirm/index
   * @param {Object} data - 弹窗数据
   * @returns {void} 无返回值
   */
  showConfirmModal(data) {
    ConfirmModalHandler.showConfirmModal(this, data);
  },



  // ==================== 质检/入库（委托 QualityHandler） ====================

  /**
   * 显示质检页面 — 跳转独立页面 /pages/scan/quality/index
   * @param {Object} detail - 质检数据
   * @returns {void} 无返回值
   */
  showQualityModal(detail) {
    QualityHandler.showQualityModal(this, detail);
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
   * 网络错误时「检查网络」按钮 — 重新扫码
   * WXML: scan-result.wxml bindtap="onCheckNetwork"
   */
  onCheckNetwork() {
    wx.showLoading({ title: '检测中...', mask: true });
    wx.getNetworkType({
      success: (res) => {
        wx.hideLoading();
        if (res.networkType === 'none' || res.networkType === 'unknown') {
          toast.error('网络不可用，请检查网络设置');
        } else {
          toast.success('网络已恢复，重新扫码');
          this.onScan();
        }
      },
      fail: () => {
        wx.hideLoading();
        toast.error('检测失败，请重试');
      },
    });
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
          const { triggerDataRefresh } = require('./../../utils/eventBus');
          triggerDataRefresh('scan');
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


  // ==================== 仓库选择（入库扫码时显示）====================

  /**
   * 点击仓库快捷选项 chip
   * @param {Object} e - 事件对象
   * @returns {void}
   */
  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.warehouse === value) {
      this.setData({ warehouse: '', warehouseAreaId: '', warehouseLocationCode: '', locationOptions: [] });
      try { wx.setStorageSync('scan_pref_warehouse', ''); } catch (_) {}
    } else {
      const areaId = (this._warehouseAreaMap && this._warehouseAreaMap[value]) || '';
      this.setData({ warehouse: value, warehouseAreaId: areaId, warehouseLocationCode: '', locationOptions: [] });
      try { wx.setStorageSync('scan_pref_warehouse', value); } catch (_) {}
      if (areaId) { this._loadLocationOptions(areaId); }
    }
  },

  onWarehouseCodeInput(e) {
    const value = e.detail.value;
    const areaId = (this._warehouseAreaMap && this._warehouseAreaMap[value]) || '';
    this.setData({ warehouse: value, warehouseAreaId: areaId, warehouseLocationCode: '' });
    if (areaId) {
      this._loadLocationOptions(areaId);
    } else {
      this.setData({ locationOptions: [] });
    }
  },

  onWarehouseClear() {
    this.setData({ warehouse: '', warehouseAreaId: '', warehouseLocationCode: '', locationOptions: [] });
  },

  onLocationChipTap(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.warehouseLocationCode === value) {
      this.setData({ warehouseLocationCode: '' });
    } else {
      this.setData({ warehouseLocationCode: value });
    }
  },

  onLocationClear() {
    this.setData({ warehouseLocationCode: '' });
  },

  onLocationCodeInput(e) {
    this.setData({ warehouseLocationCode: e.detail.value });
  },

  onManualSync() {
    this._flushOfflineQueue();
  },

  onPreviewCover(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },
});
