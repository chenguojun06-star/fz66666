/**
 * 扫码页面 - 重构版本 (v2.2)
 *
 * 架构：Page → Handler → Service → Utils
 *
 * 核心改进：
 * 1. 使用 ScanHandler 编排扫码业务流程
 * 2. 集成 StageDetector 智能工序识别
 * 3. 集成 QRCodeParser 多格式解析
 * 4. 兼容现有 WXML UI 结构
 * 5. 修复 eventBus 和 API 调用问题
 *
 * @version 2.2
 * @date 2026-01-23
 */

import api from '../../utils/api';
import { DEBUG_MODE } from '../../config';
import { getToken, getStorageValue, getUserInfo } from '../../utils/storage';
import { errorHandler } from '../../utils/errorHandler';
import { toast, toastAndRedirect } from '../../utils/uiHelper';

// 语音管理器
const { voiceManager } = require('../../utils/voiceManager');

// 抽取的业务 Handler（从 index.js 拆分）
const QualityHandler = require('./handlers/QualityHandler');
const PatternHandler = require('./handlers/PatternHandler');
const UndoHandler = require('./handlers/UndoHandler');
const StockHandler = require('./handlers/StockHandler');
const HistoryHandler = require('./handlers/HistoryHandler');
const ProcurementHandler = require('./handlers/ProcurementHandler');
const CuttingHandler = require('./handlers/CuttingHandler');
const ConfirmModalHandler = require('./handlers/ConfirmModalHandler');
const ScanResultHandler = require('./handlers/ScanResultHandler');
const RescanHandler = require('./handlers/RescanHandler');

// 修复: 正确导入 EventBus 实例
const { eventBus } = require('../../utils/eventBus');

const ScanHandler = require('./handlers/ScanHandler');

// ==================== 全局变量 ====================

// 重复扫码防护（客户端侧）
const recentScanExpires = new Map();

// ==================== 常量定义 ====================

// 扫码记录管理常量
const MAX_RECENT_SCANS = 80;      // 最大保留扫码记录数
const CLEANUP_BATCH_SIZE = 20;    // 每次清理数量

// ==================== 辅助函数 ====================

/**
 * 清理过期的扫码记录
 * @returns {void}
 */
function cleanupRecentScans() {
  if (recentScanExpires.size <= MAX_RECENT_SCANS) {
    return;
  }
  const now = Date.now();
  for (const [k, exp] of recentScanExpires.entries()) {
    if (!exp || exp <= now) {
      recentScanExpires.delete(k);
    }
  }
  if (recentScanExpires.size <= MAX_RECENT_SCANS) {
    return;
  }
  let removed = 0;
  for (const k of recentScanExpires.keys()) {
    recentScanExpires.delete(k);
    removed += 1;
    if (removed >= CLEANUP_BATCH_SIZE) {
      break;
    }
  }
}

/**
 * 检查是否为客户端重复扫码
 * @param {string} key - 扫码唯一键
 * @returns {boolean} 是否为重复扫码
 */
function isRecentDuplicate(key) {
  const now = Date.now();
  const exp = recentScanExpires.get(key);
  if (exp && exp > now) {
    return true;
  }
  if (exp && exp <= now) {
    recentScanExpires.delete(key);
  }
  return false;
}

/**
 * 标记扫码为最近扫过
 * @param {string} key - 扫码唯一键
 * @param {number} ttlMs - 过期时间（毫秒）
 * @returns {void}
 */
function markRecent(key, ttlMs) {
  const ttl = Number(ttlMs);
  const ms = Number.isFinite(ttl) && ttl > 0 ? ttl : 2000;
  recentScanExpires.set(key, Date.now() + ms);
  cleanupRecentScans();
}

// ==================== Page 定义 ====================

Page({
  data: {
    // 扫码状态
    scanEnabled: true,
    loading: false, // 兼容 WXML 的 loading 状态

    // 工厂和用户信息
    currentFactory: null,
    currentUser: null,

    // 扫码输入 (兼容 WXML)
    quantity: '',
    warehouse: '',

    // 扫码类型选项 (与PC端保持一致)
    scanTypeOptions: [
      { label: '自动识别', value: 'auto' },
      { label: '采购', value: 'procurement' },
      { label: '裁剪', value: 'cutting' },
      { label: '车缝', value: 'production' },
      { label: '整烫', value: 'ironing' },
      { label: '包装', value: 'packaging' },
      { label: '质检', value: 'quality' },
      { label: '入库', value: 'warehouse' },
      { label: '查库存', value: 'stock' },
    ],
    scanTypeIndex: 0,

    // 扫码结果 (兼容 WXML)
    lastResult: null,
    scanHistory: [], // 本地历史记录

    // 🆕 扫码结果确认页（2026-02-06 混合模式）
    scanResultConfirm: {
      visible: false,
      loading: false,
      processName: '',
      progressStage: '',
      scanType: '',
      quantity: 0,
      orderNo: '',
      bundleNo: '',
      styleNo: '',
      // 工序选择
      processOptions: [
        { label: '裁剪', value: '裁剪', scanType: 'cutting' },
        { label: '车缝', value: '车缝', scanType: 'production' },
        { label: '大烫', value: '大烫', scanType: 'production' },
        { label: '质检', value: '质检', scanType: 'quality' },
        { label: '包装', value: '包装', scanType: 'production' },
        { label: '入库', value: '入库', scanType: 'warehouse' },
      ],
      processIndex: 0,
      // 原始数据（用于提交）
      scanData: null,
      orderDetail: null,
    },

    // 撤销相关 (兼容 WXML)
    undo: {
      canUndo: false,
      loading: false,
    },
    undoCountdown: 0,
    undoRecord: null,

    // 退回重扫确认弹窗
    rescanConfirm: {
      visible: false,
      loading: false,
      recordId: '',
      orderNo: '',
      bundleNo: '',
      quantity: 0,
      scanTime: '',
      groupId: '',
      recordIdx: 0,
    },

    // 我的数据面板
    my: {
      loadingStats: false,
      stats: {
        scanCount: 0,
        orderCount: 0,
      },
      // 扫码历史记录
      loadingHistory: false,
      groupedHistory: [],
      history: {
        hasMore: true,
        page: 1,
        pageSize: 20,
      },
      // 我的裁剪任务
      cuttingTasks: [],
    },

    // 确认弹窗
    scanConfirm: {
      visible: false,
      loading: false,
      remain: 0,
      detail: null,
      skuList: [],
      // 采购任务: 是否来自"我的任务"列表（已领取，只需提交）
      fromMyTasks: false,
    },

    // 🔧 质检结果弹窗数据（简化版）
    qualityModal: {
      show: false,
      detail: null,
      result: '', // qualified 或 unqualified，默认为空让用户选择
      unqualifiedQuantity: '', // 不合格数量
      defectCategory: 0, // 原因大类索引
      handleMethod: 0, // 处理方式索引（返修/报废）
      remark: '', // 备注
      images: [], // 照片（可选）
      warehouseIndex: 0, // 仓库选择索引
    },
    // 仓库选项（与PC端一致）
    warehouseOptions: ['A仓', 'B仓'],
    // 不合格原因大类（与PC端 DEFECT_CATEGORY_OPTIONS 完全一致）
    defectCategories: ['外观完整性问题', '尺寸精度问题', '工艺规范性问题', '功能有效性问题', '其他问题'],
    // 处理方式（与PC端 DEFECT_REMARK_OPTIONS 一致）
    handleMethods: ['返修', '报废'],

    // 🆕 样板生产确认弹窗数据
    patternConfirm: {
      visible: false,
      loading: false,
      patternId: '',
      styleNo: '',
      color: '',
      quantity: 0,
      status: '',
      operationType: '',
      operationLabel: '',
      designer: '',
      patternDeveloper: '',
      deliveryTime: '',
      patternDetail: null,
      remark: '',
    },

    // 调试模式
    debug: DEBUG_MODE,
  },

  // 业务处理器实例
  scanHandler: null,
  // 事件订阅取消函数
  unsubscribeEvents: null,

  /**
   * 生命周期函数--监听页面加载
   * @returns {Promise<void>} 无返回值
   */
  async onLoad() {
    // 初始化业务处理器
    this.scanHandler = new ScanHandler(api, {
      onSuccess: this.handleScanSuccess.bind(this),
      onError: this.handleScanError.bind(this),
      getCurrentFactory: () => this.data.currentFactory,
      getCurrentWorker: () => this.data.currentUser,
    });

    // 订阅全局事件
    // 修复: 使用 eventBus.on 且绑定 this
    if (eventBus && typeof eventBus.on === 'function') {
      const unsubData = eventBus.on('DATA_REFRESH', this.handleDataRefresh.bind(this));
      const unsubScan = eventBus.on('SCAN_SUCCESS', this.handleRemoteScanSuccess.bind(this));

      this.unsubscribeEvents = () => {
        if (unsubData) { unsubData(); }
        if (unsubScan) { unsubScan(); }
      };
    }

    await this.checkLoginStatus();
    this.loadLocalHistory();
  },

  /**
   * 生命周期函数--监听页面显示
   * @returns {Promise<void>} 无返回值
   */
  async onShow() {
    // 设置 tab-bar 选中状态（扫码页面是第3个tab，索引为2）
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, 2);
    }

    // 每次显示都检查登录状态和更新统计
    const isLogin = await this.checkLoginStatus();
    if (isLogin) {
      // ✅ 并行加载数据，等待全部完成后再检查待处理任务
      await Promise.all([
        this.loadMyPanel(true),
        this.loadMyProcurementTasks(), // 加载采购任务列表
        this.loadMyCuttingTasks(),     // 加载裁剪任务列表
      ]);

      // ✅ 数据加载完成后，检查是否有待处理任务（从铃铛点击过来）
      this.checkPendingTasks();
    }
  },

  /**
   * 检查是否有待处理的任务（从铃铛点击过来）
   * @returns {void} 无返回值
   */
  checkPendingTasks() {
    // 优先检查质检任务
    this.checkPendingQualityTask();
    // 检查裁剪任务
    this.checkPendingCuttingTask();
    // 检查采购任务
    this.checkPendingProcurementTask();
  },

  /**
   * 检查是否有待处理的质检任务
   * @returns {void} 无返回值
   */
  checkPendingQualityTask() {
    try {
      const taskStr = wx.getStorageSync('pending_quality_task');
      if (taskStr) {
        wx.removeStorageSync('pending_quality_task');
        const task = JSON.parse(taskStr);
        // ✅ 延迟弹出质检弹窗，确保页面数据已加载和渲染完成
        setTimeout(() => {
          this.showQualityModal({
            orderId: task.orderId || '', // 订单ID（warehousing需要）
            orderNo: task.orderNo || '',
            bundleId: task.bundleId || task.cuttingBundleId || '', // 菲号ID
            bundleNo: task.bundleNo || task.cuttingBundleNo || '',
            styleNo: task.styleNo || '',
            color: task.color || '',
            size: task.size || '',
            quantity: task.quantity || 1,
            scanCode: task.scanCode || '',
            recordId: task.id || task.scanId,
          });
        }, 800);
      }
    } catch (e) {
      console.error('检查质检任务失败:', e);
    }
  },

  /**
   * 检查是否有待处理的裁剪任务（从铃铛点击过来）
   * @returns {void} 无返回值
   */
  checkPendingCuttingTask() {
    CuttingHandler.checkPendingCuttingTask(this);
  },

  async handleCuttingTaskFromBell(task) {
    return CuttingHandler.handleCuttingTaskFromBell(this, task);
  },

  /**
   * 检查是否有待处理的采购任务（从铃铛点击过来）
   * @returns {void} 无返回值
   */
  checkPendingProcurementTask() {
    ProcurementHandler.checkPendingProcurementTask(this);
  },

  async handleProcurementTaskFromBell(task) {
    return ProcurementHandler.handleProcurementTaskFromBell(this, task);
  },

  /**
   * 生命周期函数--监听页面隐藏
   * @returns {void} 无返回值
   */
  onHide() {
    // 清理撤销定时器（委托给 UndoHandler）
    this.stopUndoTimer();
  },

  /**
   * 生命周期函数--监听页面卸载
   * @returns {void} 无返回值
   */
  onUnload() {
    // 取消订阅
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
    }

    // 清理撤销定时器（委托给 UndoHandler）
    this.stopUndoTimer();
  },

  /**
   * 下拉刷新
   * @returns {Promise<void>} 无返回值
   */
  async onPullDownRefresh() {
    await this.loadMyPanel(true);
    wx.stopPullDownRefresh();
  },

  // ==================== 业务逻辑 ====================

  /**
   * 检查登录状态
   * @returns {Promise<boolean>} 是否已登录
   */
  async checkLoginStatus() {
    const token = getToken();
    const user = getUserInfo();
    const factory = getStorageValue('currentFactory');

    if (!token || !user) {
      toastAndRedirect('请先登录', '/pages/login/index');
      return false;
    }

    // 更新数据
    const updates = {};
    if (JSON.stringify(user) !== JSON.stringify(this.data.currentUser)) {
      updates.currentUser = user;
    }
    if (JSON.stringify(factory) !== JSON.stringify(this.data.currentFactory)) {
      updates.currentFactory = factory;
    }

    if (Object.keys(updates).length > 0) {
      this.setData(updates);
    }

    return true;
  },

  /**
   * 刷新我的面板（别名方法，供 WXML 调用）
   * @returns {void} 无返回值
   */
  refreshMy() {
    this.loadMyPanel(true);
  },

  /**
   * 加载个人统计面板
   * @param {boolean} refresh - 是否强制刷新
   * @returns {Promise<void>} 无返回值
   */
  async loadMyPanel(refresh = false) {
    if (this.data.my.loadingStats && !refresh) {
      return;
    }

    this.setData({ 'my.loadingStats': true });

    try {
      // 修复: 使用正确的 API 方法 personalScanStats
      const res = await api.production.personalScanStats();
      this.setData({
        'my.stats': {
          scanCount: res.todayCount || 0,
          orderCount: res.orderCount || 0,
          totalQuantity: res.totalQuantity || 0,
          totalAmount: res.totalAmount || 0,
        },
      });
    } catch (e) {
      // 统计数据加载失败不影响主流程
      if (DEBUG_MODE) {
        console.warn('[加载统计数据] 失败:', e.message);
      }
    } finally {
      this.setData({ 'my.loadingStats': false });
    }

    // 同时加载扫码历史
    await this.loadMyHistory(true);
  },

  // ==================== 历史记录（委托 HistoryHandler）====================

  _createGroupKey(orderNo, progressStage) { return HistoryHandler.groupScanRecords ? `${orderNo}_${progressStage}` : ''; },
  _groupScanRecords(records) { return HistoryHandler.groupScanRecords(records); },
  _mergeGroupedHistory(existing, newGroups) { return HistoryHandler.mergeGroupedHistory(existing, newGroups); },
  async loadMyHistory(refresh) { return HistoryHandler.loadMyHistory(this, refresh); },
  loadMoreMyHistory() { HistoryHandler.loadMoreMyHistory(this); },
  toggleGroupExpand(e) { HistoryHandler.toggleGroupExpand(this, e); },
  toggleSizeExpand(e) { HistoryHandler.toggleSizeExpand(this, e); },
  onHandleQuality(e) { HistoryHandler.onHandleQuality(this, e); },

  // ==================== 退回重扫（委托 RescanHandler）====================
  onRescanRecord(e) { RescanHandler.onRescanRecord(this, e); },
  onCancelRescan() { RescanHandler.onCancelRescan(this); },
  async onConfirmRescan() { return RescanHandler.onConfirmRescan(this); },

  // ==================== 采购/裁剪任务列表（委托 Handler）====================
  async loadMyProcurementTasks() { return ProcurementHandler.loadMyProcurementTasks(this); },
  async loadMyCuttingTasks() { return CuttingHandler.loadMyCuttingTasks(this); },

  /**
   * 处理数据刷新事件
   * @returns {void} 无返回值
   */
  handleDataRefresh() {
    this.loadMyPanel(true);
  },

  /**
   * 处理远程扫码成功通知（如来自其他设备的同步）
   * @returns {void} 无返回值
   */
  handleRemoteScanSuccess() {
    this.loadMyPanel(true);
  },

  /**
   * 扫码类型变更
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onScanTypeChange(e) {
    const index = Number(e.detail.value);
    this.setData({ scanTypeIndex: index });

    // 如果选择了特定类型，可能需要更新 handler 的配置
    // 但目前 ScanHandler 主要通过参数传递 override type，
    // 或者在 handleScan 时动态获取当前 type
  },

  /**
   * 数量输入变更
   * @param {Object} e - 输入事件对象
   * @returns {void} 无返回值
   */
  onQuantityInput(e) {
    const value = e.detail.value;

    // 验证输入是否为空
    if (value === '' || value === null || value === undefined) {
      this.setData({ quantity: '' });
      return;
    }

    // 转换为数字并验证
    const num = parseInt(value, 10);

    // 验证是否为有效数字
    if (isNaN(num)) {
      wx.showToast({ title: '请输入有效数字', icon: 'none' });
      return;
    }

    // 验证是否为非负数
    if (num < 0) {
      wx.showToast({ title: '数量不能为负数', icon: 'none' });
      return;
    }

    // 验证最大值（防止异常大数）
    if (num > 999999) {
      wx.showToast({ title: '数量不能超过999999', icon: 'none' });
      return;
    }

    this.setData({ quantity: num });
  },

  /**
   * 触发扫码 (绑定到 WXML 的 onScan 事件)
   * @returns {Promise<void>} 无返回值
   */
  async onScan() {
    if (!this.data.scanEnabled || this.data.loading) {
      return;
    }

    // 获取当前选中的扫码类型
    const scanTypeOption = this.data.scanTypeOptions[this.data.scanTypeIndex];
    const currentScanType = scanTypeOption ? scanTypeOption.value : 'auto';

    // 这里的逻辑主要用于点击“扫码”按钮触发摄像头
    // 如果是 PDA 设备，可能有物理按键触发，会产生键盘事件或直接输入
    // 这里主要处理微信小程序的相机调用

    wx.scanCode({
      onlyFromCamera: true, // 只允许相机扫码
      scanType: ['qrCode', 'barCode'],
      success: res => {
        this.processScanCode(res.result, currentScanType);
      },
      fail: err => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          toast.error('扫码失败');
        }
      },
    });
  },

  /**
   * 处理扫码结果 (核心入口)
   * @param {string} codeStr - 扫码得到的字符串
   * @param {string} scanType - 扫码类型
   * @returns {Promise<void>} 无返回值
   */
  async processScanCode(codeStr, scanType) {
    if (!codeStr) {
      return;
    }

    // 1. 客户端去重检查
    if (isRecentDuplicate(codeStr)) {
      toast.info('扫码太快啦');
      return;
    }

    this.setData({ loading: true });

    // 2. 特殊模式处理：库存查询
    if (scanType === 'stock') {
      await this.handleStockQuery(codeStr);
      return;
    }

    // 3. 准备参数
    const options = {
      scanType: scanType,
      quantity: this.data.quantity,
      warehouse: this.data.warehouse,
    };

    try {
      const result = await this.scanHandler.handleScan(codeStr, options);
      this._handleScanResult(result, codeStr, scanType);
    } catch (e) {
      this._handleScanException(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 处理扫码成功结果的分支逻辑
   * @param {Object} result - 扫码返回结果
   * @param {string} codeStr - 扫码字符串
   * @param {string} scanType - 扫码类型
   * @returns {void} 无返回值
   * @private
   */
  _handleScanResult(result, codeStr, scanType) {
    // 混合模式：识别工序后不自动提交，等待用户确认
    if (result && result.needConfirmProcess) {
      this.showScanResultConfirm(result.data);
      this.setData({ loading: false });
      return;
    }

    // 处理需要确认明细的情况 (如订单扫码)
    if (result && result.needConfirm) {
      this.showConfirmModal(result.data);
      this.setData({ loading: false });
      return;
    }

    // 处理需要输入数量的情况
    if (result && result.needInput) {
      wx.showModal({
        title: '请输入数量',
        content: '无法自动获取订单数量，请输入本次完成数量',
        editable: true,
        placeholderText: '例如: 100',
        success: res => {
          if (res.confirm && res.content) {
            this.setData({ quantity: res.content });
            this.processScanCode(codeStr, scanType);
          }
        },
      });
      return;
    }

    // 成功后标记去重（2秒内不再处理相同码）
    if (result && result.success) {
      markRecent(codeStr, 2000);
    }
  },

  /**
   * 处理扫码异常的分支逻辑
   * @param {Error} e - 异常对象
   * @returns {void} 无返回值
   * @private
   */
  _handleScanException(e) {
    // 入库工序：需要打开质检入库弹窗
    if (e.needWarehousing && e.warehousingData) {
      this.showQualityModal(e.warehousingData);
      this.setData({ loading: false });
      return;
    }

    // 已入库完成：显示成功提示
    if (e.isCompleted) {
      toast.success(e.message || '该菲号已入库完成');
      this.setData({ loading: false });
      return;
    }

    toast.error(e.message || '系统异常');
    errorHandler.handle(e);
  },

  // ==================== 库存查询（委托 StockHandler）====================
  async handleStockQuery(codeStr) { return StockHandler.handleStockQuery(this, codeStr, this.scanHandler.qrParser); },
  showStockUpdateDialog(skuCode) { StockHandler.showStockUpdateDialog(skuCode); },

  /**
   * 🆕 显示扫码结果确认页（2026-02-06 混合模式）
   * @param {Object} data - 扫码结果数据
   * @returns {void} 无返回值
   */
  // ==================== 扫码结果确认页（委托 ScanResultHandler） ====================
  showScanResultConfirm(data) { ScanResultHandler.showScanResultConfirm(this, data); },
  closeScanResultConfirm() { ScanResultHandler.closeScanResultConfirm(this); },

  /**
   * 显示确认弹窗
   * @param {Object} data - 弹窗数据
   * @returns {void} 无返回值
   */
  // ==================== 确认弹窗（委托 ConfirmModalHandler） ====================
  showConfirmModal(data) { ConfirmModalHandler.showConfirmModal(this, data); },
  onCancelScan() { ConfirmModalHandler.onCancelScan(this); },
  onModalSkuInput(e) { ConfirmModalHandler.onModalSkuInput(this, e); },

  // ==================== 采购输入（委托 ProcurementHandler） ====================
  onMaterialInput(e) { ProcurementHandler.onMaterialInput(this, e); },
  onMaterialRemarkInput(e) { ProcurementHandler.onMaterialRemarkInput(this, e); },

  // ==================== 裁剪输入（委托 CuttingHandler） ====================
  onModalCuttingInput(e) { CuttingHandler.onModalCuttingInput(this, e); },
  onAutoImportCutting() { CuttingHandler.onAutoImportCutting(this); },
  onClearCuttingInput() { CuttingHandler.onClearCuttingInput(this); },

  /**
   * 处理采购任务点击 (来自"我的采购任务"或"扫码记录")
   * @param {Object} e - 事件对象
   * @returns {Promise<void>} 无返回值
   */
  // ==================== 采购任务操作（委托 ProcurementHandler） ====================
  async onHandleProcurement(e) { return ProcurementHandler.onHandleProcurement(this, e); },
  async onSubmitProcurement() { return ProcurementHandler.onSubmitProcurement(this); },
  async processProcurementSubmit(params) { return ProcurementHandler.processProcurementSubmit(this, params); },
  validateProcurementData() { return ProcurementHandler.validateProcurementData(); },

  // ==================== 裁剪任务操作（委托 CuttingHandler） ====================
  async onHandleCutting(e) { return CuttingHandler.onHandleCutting(this, e); },
  async onRegenerateCuttingBundles() { return CuttingHandler.onRegenerateCuttingBundles(this); },

  // ==================== 领取任务（委托 Handler） ====================
  async onReceiveOnly() {
    if (this.data.scanConfirm.loading) return;
    this.setData({ 'scanConfirm.loading': true });
    try {
      const detail = this.data.scanConfirm.detail;
      const userInfo = getUserInfo();
      if (!userInfo || !userInfo.id) throw new Error('请先登录');

      if (detail.progressStage === '裁剪') {
        await CuttingHandler.receiveCuttingTask(this, detail, userInfo);
      } else if (detail.isProcurement) {
        await ProcurementHandler.receiveProcurementTask(this, userInfo);
      }
    } catch (e) {
      toast.error(e.message || '领取失败');
    } finally {
      this.setData({ 'scanConfirm.loading': false });
    }
  },

  // ==================== 确认提交（委托 ConfirmModalHandler） ====================
  async onConfirmScan() { return ConfirmModalHandler.onConfirmScan(this); },
  async processSKUSubmit(params) { return ConfirmModalHandler.processSKUSubmit(this, params); },

  // ==================== 质检结果录入弹窗 ====================

  /**
   * 显示质检结果弹窗（入库确认弹窗）
   */
  // ==================== 质检/入库（委托 QualityHandler） ====================
  showQualityModal(detail) { QualityHandler.showQualityModal(this, detail); },
  closeQualityModal() { QualityHandler.closeQualityModal(this); },
  stopPropagation() { /* 阻止事件冒泡 */ },
  onWarehouseChange(e) { QualityHandler.onWarehouseChange(this, e); },
  onSelectQualityResult(e) { QualityHandler.onSelectQualityResult(this, e); },
  onDefectiveQuantityInput(e) { QualityHandler.onDefectiveQuantityInput(this, e); },
  onDefectTypesChange(e) { QualityHandler.onDefectTypesChange(this, e); },
  onHandleMethodChange(e) { QualityHandler.onHandleMethodChange(this, e); },
  onRemarkInput(e) { QualityHandler.onRemarkInput(this, e); },
  onUploadQualityImage() { QualityHandler.onUploadQualityImage(this); },
  onDeleteQualityImage(e) { QualityHandler.onDeleteQualityImage(this, e); },
  async submitQualityResult() { await QualityHandler.submitQualityResult(this); },

  /**
   * 映射工序名称到 API scanType
   * @param {string} stageName - 工序名称
   * @returns {string} API扫码类型
   */
  mapScanType(stageName) {
    const map = {
      采购: 'procurement',
      裁剪: 'cutting',
      车缝: 'production',
      大烫: 'production',
      整烫: 'production',
      质检: 'quality',
      包装: 'production',
      入库: 'warehouse',
    };
    // 如果当前选择了特定类型，优先使用
    const currentType = this.data.scanTypeOptions[this.data.scanTypeIndex].value;
    if (currentType !== 'auto') {
      if (currentType === 'ironing' || currentType === 'packaging') {
        return 'production';
      }
      if (currentType === 'sewing') {
        return 'production';
      }
      return currentType;
    }

    return map[stageName] || 'production';
  },

  /**
   * Handler 回调: 扫码成功
   * @param {Object} result - 扫码结果对象
   * @returns {void} 无返回值
   */
  handleScanSuccess(result) {
    // ✅ 播放成功反馈 - 轻震动（15ms）
    wx.vibrateShort({ type: 'light' });

    // ✅ 播放成功语音 - 小姐姐声音："扫码成功"
    voiceManager.play('success');

    // 格式化显示结果
    const formattedResult = {
      ...result,
      displayTime: new Date().toLocaleTimeString(),
      statusText: '扫码成功',
      statusClass: 'success',
    };

    this.setData({
      lastResult: formattedResult,
      quantity: '', // 清空手动输入的数量
    });

    // 添加到本地历史
    this.addToLocalHistory(formattedResult);

    // 启动撤销倒计时
    this.startUndoTimer(formattedResult);

    // 刷新统计
    this.loadMyPanel(true);

    // 触发全局事件
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('SCAN_SUCCESS', result);
    }
  },

  /**
   * Handler 回调: 扫码失败
   * @param {Error} error - 错误对象
   * @returns {void} 无返回值
   */
  handleScanError(error) {
    // 播放失败音效/震动
    wx.vibrateLong();

    // ✅ 播放失败语音 - 小姐姐声音："扫码失败，请重试"
    voiceManager.play('error');

    const errorResult = {
      success: false,
      message: error.message || '扫码失败',
      displayTime: new Date().toLocaleTimeString(),
      statusText: '失败',
      statusClass: 'error',
    };

    this.setData({
      lastResult: errorResult,
    });

    // 错误提示已在 Handler 或 processScanCode 中通过 Toast 显示，这里主要更新 UI 状态
  },

  // ==================== 撤销功能（委托 UndoHandler）====================
  startUndoTimer(record) { UndoHandler.startUndoTimer(this, record); },
  stopUndoTimer() { UndoHandler.stopUndoTimer(this); },
  async handleUndo() { return UndoHandler.handleUndo(this); },

  // ==================== 历史记录 - 本地（委托 HistoryHandler）====================
  loadLocalHistory() { HistoryHandler.loadLocalHistory(this); },
  addToLocalHistory(record) { HistoryHandler.addToLocalHistory(this, record); },
  onTapHistoryItem(e) { HistoryHandler.onTapHistoryItem(this, e); },

  // ==================== 扫码结果确认页（委托 ScanResultHandler）====================
  onProcessPickerChange(e) { ScanResultHandler.onProcessPickerChange(this, e); },
  async onConfirmScanResult() { return ScanResultHandler.onConfirmScanResult(this); },

  // ==================== 样板生产扫码 ====================

  /**
   * 显示样板生产确认弹窗
   */
  // ==================== 样板生产（委托 PatternHandler） ====================
  showPatternConfirmModal(data) { PatternHandler.showPatternConfirmModal(this, data); },
  closePatternConfirm() { PatternHandler.closePatternConfirm(this); },
  onPatternOperationChange(e) { PatternHandler.onPatternOperationChange(this, e); },
  onPatternRemarkInput(e) { PatternHandler.onPatternRemarkInput(this, e); },
  async submitPatternScan() { await PatternHandler.submitPatternScan(this); },
});
