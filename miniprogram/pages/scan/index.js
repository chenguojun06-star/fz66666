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
import { getToken, getStorageValue, setStorageValue, getUserInfo } from '../../utils/storage';
import { errorHandler } from '../../utils/errorHandler';
import { toast, toastAndRedirect } from '../../utils/uiHelper';

// 抽取的业务 Handler（从 index.js 拆分）
const QualityHandler = require('./handlers/QualityHandler');
const PatternHandler = require('./handlers/PatternHandler');
const UndoHandler = require('./handlers/UndoHandler');
const StockHandler = require('./handlers/StockHandler');
const HistoryHandler = require('./handlers/HistoryHandler');

// 修复: 正确导入 EventBus 实例
const { eventBus } = require('../../utils/eventBus');

const ScanHandler = require('./handlers/ScanHandler');
const SKUProcessor = require('./processors/SKUProcessor');

// ==================== 全局变量 ====================

// 重复扫码防护（客户端侧）
const recentScanExpires = new Map();

// ==================== 常量定义 ====================

// 扫码记录管理常量
const MAX_RECENT_SCANS = 80;      // 最大保留扫码记录数
const CLEANUP_BATCH_SIZE = 20;    // 每次清理数量
const CLEANUP_INTERVAL_MS = 1000; // 清理间隔（毫秒）

// ==================== 辅助函数 ====================

/**
 * 清理过期的扫码记录
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
    // 不合格原因大类
    defectCategories: ['线头问题', '脏污', '破损', '色差', '尺寸不符', '缝制问题', '其他'],
    // 处理方式
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
   */
  async onLoad(_options) {
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
        unsubData && unsubData();
        unsubScan && unsubScan();
      };
    }

    await this.checkLoginStatus();
    this.loadLocalHistory();
  },

  /**
   * 生命周期函数--监听页面显示
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
      this.loadMyPanel(true);
      this.loadMyProcurementTasks(); // ✅ 加载采购任务列表
      this.loadMyCuttingTasks(); // ✅ 加载裁剪任务列表

      // 检查是否有待处理任务（从铃铛点击过来）
      this.checkPendingTasks();
    }
  },

  /**
   * 检查是否有待处理的任务（从铃铛点击过来）
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
   */
  checkPendingQualityTask() {
    try {
      const taskStr = wx.getStorageSync('pending_quality_task');
      if (taskStr) {
        wx.removeStorageSync('pending_quality_task');
        const task = JSON.parse(taskStr);
        // 延迟弹出质检弹窗，确保页面已渲染
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
        }, 300);
      }
    } catch (e) {
      console.error('检查质检任务失败:', e);
    }
  },

  /**
   * 检查是否有待处理的裁剪任务（从铃铛点击过来）
   */
  checkPendingCuttingTask() {
    try {
      const taskStr = wx.getStorageSync('pending_cutting_task');
      if (taskStr) {
        wx.removeStorageSync('pending_cutting_task');
        const task = JSON.parse(taskStr);
        // 延迟触发，确保页面数据已加载
        setTimeout(() => {
          this.handleCuttingTaskFromBell(task);
        }, 500);
      }
    } catch (e) {
      console.error('检查裁剪任务失败:', e);
    }
  },

  /**
   * 处理从铃铛点击的裁剪任务
   */
  async handleCuttingTaskFromBell(task) {
    this.setData({ loading: true });

    try {
      const orderNo = task.productionOrderNo || task.orderNo;
      const orderId = task.productionOrderId || task.id;

      // 获取订单SKU列表
      let skuItems = [];
      try {
        const orderDetail = await api.production.orderDetailByOrderNo(orderNo);
        if (orderDetail && orderDetail.items) {
          skuItems = orderDetail.items;
        } else if (orderDetail && orderDetail.orderLines) {
          skuItems = orderDetail.orderLines;
        }
      } catch (err) {
        console.warn('[handleCuttingTaskFromBell] 获取订单详情失败:', err);
      }

      // 如果没有SKU明细，使用任务本身的颜色尺码
      if (!skuItems || skuItems.length === 0) {
        skuItems = [
          {
            color: task.color,
            size: task.size,
            quantity: task.orderQuantity || 0,
          },
        ];
      }

      // 构建裁剪任务列表
      const cuttingTasks = skuItems.map(item => ({
        color: item.color,
        size: item.size,
        plannedQuantity: item.quantity || item.num || 0,
        cuttingInput: item.quantity || item.num || 0,
      }));

      // 打开弹窗
      this.setData({
        scanConfirm: {
          visible: true,
          loading: false,
          remain: 30,
          detail: {
            orderId: orderId,
            orderNo: orderNo,
            styleNo: task.styleNo,
            progressStage: '裁剪',
            taskId: task.id,
          },
          cuttingTasks: cuttingTasks,
          cuttingTaskReceived: true,
          fromMyTasks: true,
          skuList: [],
          materialPurchases: [],
        },
      });

      toast.success('已打开裁剪任务');
    } catch (e) {
      console.error('[handleCuttingTaskFromBell] 失败:', e);
      toast.error('加载裁剪任务失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 检查是否有待处理的采购任务（从铃铛点击过来）
   */
  checkPendingProcurementTask() {
    try {
      const taskStr = wx.getStorageSync('pending_procurement_task');
      if (taskStr) {
        wx.removeStorageSync('pending_procurement_task');
        const task = JSON.parse(taskStr);
        // 延迟触发，确保页面数据已加载
        setTimeout(() => {
          this.handleProcurementTaskFromBell(task);
        }, 500);
      }
    } catch (e) {
      console.error('检查采购任务失败:', e);
    }
  },

  /**
   * 处理从铃铛点击的采购任务
   */
  async handleProcurementTaskFromBell(task) {
    this.setData({ loading: true });

    try {
      const orderNo = task.orderNo;
      const styleNo = task.styleNo || '';

      // 获取采购单列表
      const res = await api.production.getMaterialPurchases({ orderNo });
      const materialPurchases = res || [];

      if (!materialPurchases || materialPurchases.length === 0) {
        toast.error('未找到采购单');
        return;
      }

      // 打开确认弹窗
      this.showConfirmModal({
        isProcurement: true,
        materialPurchases: materialPurchases,
        orderNo: orderNo,
        styleNo: styleNo,
        progressStage: '采购',
        fromMyTasks: true,
      });

      toast.success('已打开采购任务');
    } catch (e) {
      console.error('[handleProcurementTaskFromBell] 失败:', e);
      toast.error('加载采购任务失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 清理撤销定时器（委托给 UndoHandler）
    this.stopUndoTimer();
  },

  /**
   * 生命周期函数--监听页面卸载
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
   */
  async onPullDownRefresh() {
    await this.loadMyPanel(true);
    wx.stopPullDownRefresh();
  },

  // ==================== 业务逻辑 ====================

  /**
   * 检查登录状态
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
   */
  refreshMy() {
    this.loadMyPanel(true);
  },

  /**
   * 加载个人统计面板
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
  onHandleQuality(e) { HistoryHandler.onHandleQuality(this, e); },

  /**
   * 加载我的采购任务列表
   */
  async loadMyProcurementTasks() {
    try {
      // api.js 已对 Result.success(data) 进行解包，此处直接获取 List<MaterialPurchase>
      const tasks = await api.production.myProcurementTasks();

      // 聚合逻辑: 按 orderNo 分组
      const grouped = {};
      // 确保 tasks 是数组（API层已保证是数据实体，无需再取 .data）
      if (Array.isArray(tasks) && tasks.length > 0) {
        tasks.forEach(task => {
          const orderNo = task.orderNo || '未知订单';
          if (!grouped[orderNo]) {
            grouped[orderNo] = {
              orderNo: orderNo,
              styleNo: task.styleNo,
              styleName: task.styleName,
              totalCount: 0,
              items: [],
            };
          }
          grouped[orderNo].totalCount++;
          grouped[orderNo].items.push(task);
        });
      }

      this.setData({
        'my.procurementTasks': Object.values(grouped),
      });
    } catch (e) {
      console.error('[loadMyProcurementTasks] 加载失败:', e);
    }
  },

  /**
   * 加载我的裁剪任务列表
   */
  async loadMyCuttingTasks() {
    try {
      const tasks = await api.production.myCuttingTasks();

      // 直接使用返回的数组
      const taskList = Array.isArray(tasks) ? tasks : [];

      this.setData({
        'my.cuttingTasks': taskList,
      });
    } catch (e) {
      console.error('[loadMyCuttingTasks] 加载失败:', e);
    }
  },

  /**
   * 处理数据刷新事件
   */
  handleDataRefresh() {
    this.loadMyPanel(true);
  },

  /**
   * 处理远程扫码成功通知（如来自其他设备的同步）
   */
  handleRemoteScanSuccess() {
    this.loadMyPanel(true);
  },

  /**
   * 扫码类型变更
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
      quantity: this.data.quantity, // 手动输入的数量
      warehouse: this.data.warehouse,
    };

    try {
      // 3. 调用 Handler 处理
      const result = await this.scanHandler.handleScan(codeStr, options);

      // 🆕 2026-02-06 混合模式：识别工序后不自动提交，等待用户确认
      if (result && result.needConfirmProcess) {
        this.showScanResultConfirm(result.data);
        this.setData({ loading: false });
        return;
      }

      // 2026-01-23: 处理需要确认明细的情况 (如订单扫码)
      if (result && result.needConfirm) {
        this.showConfirmModal(result.data);
        this.setData({ loading: false }); // 重置 loading 状态
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
              // 更新数量并重新提交
              this.setData({ quantity: res.content });
              this.processScanCode(codeStr, scanType);
            }
          },
        });
        return;
      }

      // 成功后标记去重 (2秒内不再处理相同码)
      // 只有成功才标记，避免失败重试也被拦截
      if (result && result.success) {
        markRecent(codeStr, 2000);
      }
    } catch (e) {
      // 处理入库工序：需要打开质检入库弹窗
      if (e.needWarehousing && e.warehousingData) {
        // console.log('[扫码页] 检测到入库工序，打开质检入库弹窗:', e.warehousingData);
        this.showQualityModal(e.warehousingData);
        this.setData({ loading: false });
        return;
      }

      // 已入库完成：显示成功提示而不是错误
      if (e.isCompleted) {
        toast.success(e.message || '该菲号已入库完成');
        this.setData({ loading: false });
        return;
      }

      toast.error(e.message || '系统异常');
      errorHandler.handle(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  // ==================== 库存查询（委托 StockHandler）====================
  async handleStockQuery(codeStr) { return StockHandler.handleStockQuery(this, codeStr, this.scanHandler.qrParser); },
  showStockUpdateDialog(skuCode) { StockHandler.showStockUpdateDialog(skuCode); },

  /**
   * 🆕 显示扫码结果确认页（2026-02-06 混合模式）
   */
  showScanResultConfirm(data) {
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

    // 查找工序在选项中的索引
    const processOptions = this.data.scanResultConfirm.processOptions;
    let processIndex = processOptions.findIndex(
      opt => opt.value === processName || opt.value === progressStage
    );
    if (processIndex < 0) processIndex = 0;

    this.setData({
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
  },

  /**
   * 🆕 关闭扫码结果确认页
   */
  closeScanResultConfirm() {
    this.setData({
      'scanResultConfirm.visible': false,
      'scanResultConfirm.loading': false,
    });
  },

  /**
   * 显示确认弹窗
   */
  showConfirmModal(data) {
    // ✅ 判断是否为样板生产模式
    const isPatternMode = data.patternId || data.patternDetail;
    if (isPatternMode) {
      this.showPatternConfirmModal(data);
      return;
    }

    // ✅ 判断是否为采购模式
    const isProcurement =
      this.data.scanTypeOptions[this.data.scanTypeIndex].value === 'procurement' ||
      data.progressStage === '采购';

    let skuList = [];
    let formItems = [];
    let summary = {};
    let materialPurchases = [];

    if (isProcurement && data.materialPurchases && data.materialPurchases.length > 0) {
      // 采购模式：使用面料采购单数据
      materialPurchases = data.materialPurchases.map((item, idx) => ({
        id: item.id || idx,
        materialName: item.materialName || '未知面料',
        materialCode: item.materialCode || '',
        specifications: item.specifications || '',
        unit: item.unit || '米',
        purchaseQuantity: item.purchaseQuantity || 0, // 需采购数量
        arrivedQuantity: item.arrivedQuantity || 0, // 已到货数量
        pendingQuantity: (item.purchaseQuantity || 0) - (item.arrivedQuantity || 0), // 待采购
        inputQuantity: (item.purchaseQuantity || 0) - (item.arrivedQuantity || 0), // 默认填充待采购数量
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        unitPrice: item.unitPrice,
      }));

      // console.log('[showConfirmModal] 面料采购单:', materialPurchases.length);
    } else {
      // 非采购模式：使用SKU列表
      skuList = data.skuItems
        ? SKUProcessor.normalizeOrderItems(data.skuItems, data.orderNo, data.styleNo)
        : [];

      formItems = SKUProcessor.buildSKUInputList(skuList);
      summary = SKUProcessor.getSummary(skuList);
    }

    const sizeDetails =
      skuList.length > 0
        ? skuList
          .map(
            item =>
              `${item.color || '-'}${item.size ? `/${item.size}` : ''}×${Number(item.totalQuantity || 0)}`
          )
          .join('，')
        : '';

    // 构造 Cutting 任务 (如果是裁剪工序)
    let cuttingTasks = [];
    if (data.progressStage === '裁剪' && data.skuItems) {
      cuttingTasks = data.skuItems.map(item => ({
        color: item.color,
        size: item.size,
        plannedQuantity: item.quantity || item.num || 0,
        cuttingInput: item.quantity || item.num || 0,
      }));
    }

    this.setData({
      scanConfirm: {
        visible: true,
        loading: false,
        remain: 30,
        detail: {
          ...data,
          isProcurement: isProcurement,
          sizeDetails,
        },
        skuList: formItems,
        summary: summary,
        cuttingTasks: cuttingTasks,
        materialPurchases: materialPurchases, // ✅ 面料采购单列表
        fromMyTasks: data.fromMyTasks || false, // ✅ 是否来自"我的任务"
      },
    });
  },

  /**
   * 面料采购数量输入
   */
  onMaterialInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;

    const materialPurchases = this.data.scanConfirm.materialPurchases.map(item => {
      if (item.id === id) {
        return { ...item, inputQuantity: value };
      }
      return item;
    });

    this.setData({ 'scanConfirm.materialPurchases': materialPurchases });
  },

  /**
   * 面料采购备注输入
   */
  onMaterialRemarkInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;

    const materialPurchases = this.data.scanConfirm.materialPurchases.map(item => {
      if (item.id === id) {
        return { ...item, remarkInput: value };
      }
      return item;
    });

    this.setData({ 'scanConfirm.materialPurchases': materialPurchases });
  },

  /**
   * 通用输入处理器 - 统一处理所有基于索引的输入
   * @param {string} dataPath - 数据路径 (如 'scanConfirm.skuList')
   * @param {string} field - 字段名 (如 'inputQuantity')
   */
  _handleIndexInput(e, dataPath, field) {
    const idx = e.currentTarget.dataset.idx;
    const val = e.detail.value;
    const key = `${dataPath}[${idx}].${field}`;
    this.setData({ [key]: val });
  },

  /**
   * 弹窗输入变更 (通用SKU)
   */
  onModalSkuInput(e) {
    this._handleIndexInput(e, 'scanConfirm.skuList', 'inputQuantity');
  },

  /**
   * 弹窗输入变更 (裁剪)
   */
  onModalCuttingInput(e) {
    this._handleIndexInput(e, 'scanConfirm.cuttingTasks', 'cuttingInput');
  },

  /**
   * 一键导入裁剪数量（按20件/扎分配）
   * 与PC端逻辑一致
   */
  onAutoImportCutting() {
    const cuttingTasks = this.data.scanConfirm.cuttingTasks || [];
    if (cuttingTasks.length === 0) {
      toast.error('无裁剪任务数据');
      return;
    }

    // 按20件/扎分配（直接填充计划数量）
    const updated = cuttingTasks.map(task => ({
      ...task,
      cuttingInput: task.plannedQuantity || 0,
    }));

    this.setData({
      'scanConfirm.cuttingTasks': updated,
    });

    toast.success('已按计划数量填充');
  },

  /**
   * 清空裁剪数量输入
   */
  onClearCuttingInput() {
    const cuttingTasks = this.data.scanConfirm.cuttingTasks || [];

    const cleared = cuttingTasks.map(task => ({
      ...task,
      cuttingInput: 0,
    }));

    this.setData({
      'scanConfirm.cuttingTasks': cleared,
    });
  },

  /**
   * 取消扫码
   */
  onCancelScan() {
    this.setData({ 'scanConfirm.visible': false });
  },

  /**
   * 处理采购任务点击 (来自"我的采购任务"或"扫码记录")
   */
  async onHandleProcurement(e) {
    const { orderNo, groupId, recordIdx } = e.currentTarget.dataset;

    let materialPurchases = [];
    let targetOrderNo = orderNo;
    let styleNo = '';

    this.setData({ loading: true });

    try {
      if (orderNo) {
        // 来自"我的采购任务"
        // 先在本地列表中查找以获取款号等信息
        const task = this.data.my.procurementTasks.find(t => t.orderNo === orderNo);
        if (task) {
          styleNo = task.styleNo;
        }

        const res = await api.production.getMaterialPurchases({ orderNo });
        materialPurchases = res || [];
      } else if (groupId && recordIdx !== undefined) {
        // 来自"扫码记录"
        const group = this.data.my.groupedHistory.find(g => g.id === groupId);
        if (group && group.items[recordIdx]) {
          const record = group.items[recordIdx];
          targetOrderNo = record.orderNo;
          styleNo = record.styleNo; // 记录中通常有 styleNo

          // 重新查询以获取最新状态
          const res = await api.production.getMaterialPurchases({ orderNo: targetOrderNo });
          materialPurchases = res || [];
        }
      }

      if (!materialPurchases || materialPurchases.length === 0) {
        toast.error('未找到采购单');
        return;
      }

      // 打开确认弹窗（来自"我的任务"列表，已领取）
      this.showConfirmModal({
        isProcurement: true,
        materialPurchases: materialPurchases,
        orderNo: targetOrderNo,
        styleNo: styleNo,
        progressStage: '采购',
        fromMyTasks: true, // ✅ 标记来自"我的任务"，只需提交
      });
    } catch (e) {
      console.error('[onHandleProcurement] 失败:', e);
      toast.error('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 处理裁剪任务点击（来自"我的裁剪任务"）
   * 已领取的任务，进入后可以填写数量并生成菲号
   */
  async onHandleCutting(e) {
    const { taskId } = e.currentTarget.dataset;

    // 找到任务
    const task = this.data.my.cuttingTasks.find(t => t.id === taskId);
    if (!task) {
      toast.error('未找到裁剪任务');
      return;
    }

    this.setData({ loading: true });

    try {
      // 获取订单详情以获取SKU信息
      const orderNo = task.productionOrderNo;
      const orderId = task.productionOrderId;

      // 获取订单SKU列表（使用订单号查询）
      let skuItems = [];
      try {
        const orderDetail = await api.production.orderDetailByOrderNo(orderNo);
        if (orderDetail && orderDetail.items) {
          skuItems = orderDetail.items;
        } else if (orderDetail && orderDetail.orderLines) {
          skuItems = orderDetail.orderLines;
        }
      } catch (err) {
        console.warn('[onHandleCutting] 获取订单详情失败:', err);
      }

      // 如果没有SKU明细，使用任务本身的颜色尺码
      if (!skuItems || skuItems.length === 0) {
        skuItems = [
          {
            color: task.color,
            size: task.size,
            quantity: task.orderQuantity || 0,
          },
        ];
      }

      // 构建裁剪任务列表（用于弹窗中显示和输入）
      const cuttingTasks = skuItems.map(item => ({
        color: item.color,
        size: item.size,
        plannedQuantity: item.quantity || item.num || 0,
        cuttingInput: item.quantity || item.num || 0, // 默认填充计划数量
      }));

      // 打开弹窗
      this.setData({
        scanConfirm: {
          visible: true,
          loading: false,
          remain: 30,
          detail: {
            orderId: orderId,
            orderNo: orderNo,
            styleNo: task.styleNo,
            progressStage: '裁剪',
            taskId: taskId,
          },
          cuttingTasks: cuttingTasks,
          cuttingTaskReceived: true, // 已领取
          fromMyTasks: true, // 来自我的任务
          skuList: [],
          materialPurchases: [],
        },
      });
    } catch (e) {
      console.error('[onHandleCutting] 失败:', e);
      toast.error('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 只领取任务（不提交数据）
   * 用于裁剪任务和采购任务的领取
   */
  async onReceiveOnly() {
    if (this.data.scanConfirm.loading) {
      return;
    }
    this.setData({ 'scanConfirm.loading': true });

    try {
      const detail = this.data.scanConfirm.detail;

      // ✅ 使用正确的 getUserInfo 工具函数获取用户信息
      const userInfo = getUserInfo();
      if (!userInfo || !userInfo.id) {
        throw new Error('请先登录');
      }

      // 调用领取任务接口
      if (detail.progressStage === '裁剪') {
        // 裁剪任务领取

        // 获取裁剪任务
        const taskData = await api.production.getCuttingTaskByOrderId(detail.orderId);
        if (!taskData || !taskData.records || taskData.records.length === 0) {
          throw new Error('未找到裁剪任务');
        }

        const task = taskData.records[0];

        // 调用领取接口
        await api.production.receiveCuttingTaskById(
          task.id,
          userInfo.id,
          userInfo.realName || userInfo.username
        );

        toast.success('裁剪任务领取成功，可在"我的裁剪任务"中生成菲号');

        // 关闭弹窗
        this.setData({
          'scanConfirm.visible': false,
          'scanConfirm.loading': false,
        });

        // 刷新数据
        this.loadMyPanel(true);
        this.loadMyCuttingTasks();
      } else if (detail.isProcurement) {
        // 采购任务领取 - 只标记领取，不需要输入数量
        const materialPurchases = this.data.scanConfirm.materialPurchases || [];

        if (materialPurchases.length === 0) {
          throw new Error('暂无面料采购单');
        }

        // ✅ 批量标记领取（更新 receiverId 和 receiverName）
        // 使用 receivePurchase 接口，避免触发 arrivedQuantity 校验
        const updates = materialPurchases.map(item => ({
          purchaseId: item.id,
          receiverId: userInfo.id,
          receiverName: userInfo.realName || userInfo.username,
        }));

        // 批量更新领取信息
        await Promise.all(updates.map(update => api.production.receivePurchase(update)));

        toast.success(`已领取 ${updates.length} 个面料采购任务`);
        // 关闭弹窗
        this.setData({
          'scanConfirm.visible': false,
          'scanConfirm.loading': false,
        });

        // 刷新我的面板和采购任务列表
        this.loadMyPanel(true);
        this.loadMyProcurementTasks(); // ✅ 刷新采购任务列表
      }
    } catch (e) {
      toast.error(e.message || '领取失败');
    } finally {
      this.setData({ 'scanConfirm.loading': false });
    }
  },

  /**
   * 构建采购更新列表（仅更新数量，不领取）
   * @private
   */
  _buildProcurementUpdatesOnly(materialPurchases) {
    const updates = [];

    for (const item of materialPurchases) {
      const inputQty = Number(item.inputQuantity);
      if (inputQty > 0) {
        const newArrived = (Number(item.arrivedQuantity) || 0) + inputQty;
        const remark = this._validateProcurementArrival(item, inputQty, newArrived);

        updates.push({
          id: item.id,
          arrivedQuantity: newArrived,
          remark: remark,
        });
      }
    }

    if (updates.length === 0) {
      throw new Error('请至少填写一项到货数量');
    }

    return updates;
  },

  /**
   * 提交采购任务（来自"我的任务"列表，只更新到货数量）
   */
  async onSubmitProcurement() {
    if (this.data.scanConfirm.loading) {
      return;
    }

    const materialPurchases = this.data.scanConfirm.materialPurchases || [];
    if (materialPurchases.length === 0) {
      toast.error('无采购数据');
      return;
    }

    this.setData({ 'scanConfirm.loading': true });

    try {
      // 构建更新列表（复用验证逻辑）
      const updates = this._buildProcurementUpdatesOnly(materialPurchases);

      // 只调用 updateArrivedQuantity（不再调用 receivePurchase，因为已经领取了）
      await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));

      toast.success('提交成功');

      // 关闭弹窗
      this.setData({
        'scanConfirm.visible': false,
        'scanConfirm.loading': false,
      });

      // 刷新数据
      this.loadMyPanel(true);
      this.loadMyProcurementTasks();
    } catch (e) {
      console.error('[onSubmitProcurement] 失败:', e);
      toast.error(e.message || '提交失败');
      this.setData({ 'scanConfirm.loading': false });
    }
  },

  /**
   * 验证裁剪任务数据
   * @private
   * @param {Array} cuttingTasks - 裁剪任务列表
   * @param {string} orderId - 订单ID
   * @throws {Error} 数据验证失败
   */
  _validateCuttingData(cuttingTasks, orderId) {
    if (!cuttingTasks || cuttingTasks.length === 0) {
      throw new Error('没有裁剪任务数据');
    }
    if (!orderId) {
      throw new Error('订单ID缺失');
    }
  },

  /**
   * 构建菲号生成参数
   * @private
   * @param {Array} cuttingTasks - 裁剪任务列表
   * @returns {Array} 菲号生成参数列表
   * @throws {Error} 没有有效的任务数据
   */
  _buildBundleParams(cuttingTasks) {
    const bundleParams = [];

    for (const task of cuttingTasks) {
      const inputQty = task.cuttingInput ? Number(task.cuttingInput) : 0;
      if (inputQty <= 0) {
        continue;
      }

      // 如果有尺码分布明细，按尺码分别生成
      if (task.sizeDetails && task.sizeDetails.length > 0) {
        for (const size of task.sizeDetails) {
          if (size.quantity > 0) {
            bundleParams.push({
              color: task.color,
              size: size.size,
              quantity: size.quantity,
            });
          }
        }
      } else {
        // 没有尺码分布，直接按颜色生成
        const sizeStr = String(task.size || '').trim();

        // ✅ 新增验证：禁止合并尺码（如 "S,M,L,XL,XXL"）
        if (sizeStr.includes(',')) {
          throw new Error(
            `颜色【${task.color}】的尺码包含逗号分隔符，请分别为每个尺码填写数量。\n` +
            `错误值：${sizeStr}\n` +
            `正确做法：在"尺码分布"中为每个尺码单独录入数量`
          );
        }
        if (!sizeStr) {
          throw new Error(
            `颜色【${task.color}】缺少尺码信息，请填写尺码或添加尺码分布明细`
          );
        }

        bundleParams.push({
          color: task.color,
          size: sizeStr,
          quantity: inputQty,
        });
      }
    }

    if (bundleParams.length === 0) {
      throw new Error('请至少输入一个颜色的数量');
    }

    return bundleParams;
  },

  /**
   * 重新生成裁剪菲号
   * 用于已领取的裁剪任务修改数量后重新生成
   */
  async onRegenerateCuttingBundles() {
    if (this.data.scanConfirm.loading) {
      return;
    }
    this.setData({ 'scanConfirm.loading': true });

    try {
      const detail = this.data.scanConfirm.detail;
      const cuttingTasks = this.data.scanConfirm.cuttingTasks;

      // console.log('[onRegenerateCuttingBundles] detail:', detail);
      // console.log('[onRegenerateCuttingBundles] cuttingTasks:', cuttingTasks);

      // 验证数据
      this._validateCuttingData(cuttingTasks, detail.orderId);

      // 构建菲号生成参数
      const bundleParams = this._buildBundleParams(cuttingTasks);
      // console.log('[onRegenerateCuttingBundles] bundleParams:', bundleParams);

      // 调用生成菲号接口
      const result = await api.production.generateCuttingBundles(detail.orderId, bundleParams);
      // console.log('[onRegenerateCuttingBundles] result:', result);

      toast.success('菲号生成成功');

      // 关闭弹窗
      this.setData({
        'scanConfirm.visible': false,
        'scanConfirm.loading': false,
      });

      // 刷新数据
      this.loadMyPanel(true);
      this.loadMyCuttingTasks(); // 刷新裁剪任务列表

      // 触发全局事件（刷新铃铛组件）
      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('DATA_REFRESH');
        eventBus.emit('taskStatusChanged'); // 刷新铃铛任务
      }

      // 通过 app 的 eventBus 也触发
      const appEventBus = getApp()?.globalData?.eventBus;
      if (appEventBus && typeof appEventBus.emit === 'function') {
        appEventBus.emit('taskStatusChanged');
        appEventBus.emit('refreshBellTasks');
      }
    } catch (e) {
      toast.error(e.message || '生成失败');
    } finally {
      this.setData({ 'scanConfirm.loading': false });
    }
  },

  /**
   * 验证采购到货数量（70%检查）- 优化用户提示
   * @private
   */
  _validateProcurementArrival(item, inputQty, newArrived) {
    const purchaseQty = Number(item.purchaseQuantity) || 0;
    const remark = (item.remarkInput || '').trim();

    // 检查：到货数量小于70%时必须填写备注
    if (purchaseQty > 0 && newArrived * 100 < purchaseQty * 70) {
      const arrivalRate = ((newArrived / purchaseQty) * 100).toFixed(1);
      const shortageQty = Math.ceil(purchaseQty * 0.7 - newArrived);

      if (!remark) {
        throw new Error(
          `到货不足提醒\n\n` +
          `物料名称：${item.materialName || '未知'}\n` +
          `采购数量：${purchaseQty}\n` +
          `实际到货：${newArrived}（${arrivalRate}%）\n` +
          `最低要求：${Math.ceil(purchaseQty * 0.7)}（70%）\n` +
          `还需到货：${shortageQty}\n\n` +
          `请在备注栏填写原因（如供应商延迟、分批到货等）`
        );
      }

      // 记录低到货率警告（用于后续分析）
      console.warn(`[Low Arrival Rate] ${item.materialName}: ${arrivalRate}%, Remark: ${remark}`);
    }

    return remark;
  },

  /**
   * 构建采购更新数据
   * @private
   */
  _buildProcurementUpdates(materialPurchases) {
    const receives = [];
    const updates = [];
    const userInfo = getUserInfo();
    const receiverName = userInfo.realName || userInfo.username;

    for (const item of materialPurchases) {
      // 领取任务
      receives.push({
        purchaseId: item.id,
        receiverId: userInfo.id,
        receiverName: receiverName,
      });

      // 处理到货数量
      const inputQty = Number(item.inputQuantity);
      if (inputQty > 0) {
        const newArrived = (Number(item.arrivedQuantity) || 0) + inputQty;
        const remark = this._validateProcurementArrival(item, inputQty, newArrived);

        updates.push({
          id: item.id,
          arrivedQuantity: newArrived,
          remark: remark,
        });
      }
    }

    return { receives, updates };
  },

  /**
   * 执行采购提交
   * @private
   */
  async _executeProcurementSubmit(receives, updates) {
    // 领取任务
    if (receives.length > 0) {
      try {
        await Promise.all(receives.map(r => api.production.receivePurchase(r)));
      } catch (err) {
        console.error('领取任务失败详情:', err);
        throw new Error('领取任务失败：' + (err.message || '网络或服务器错误'));
      }
    }

    // 更新到货数量
    if (updates.length > 0) {
      try {
        await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));
      } catch (err) {
        console.error('更新数量失败详情:', err);
        // 如果已经领取成功但更新失败，提示用户
        if (receives.length > 0) {
          throw new Error('任务已领取，但更新数量失败：' + (err.message || '请重试'));
        }
        throw new Error('提交数据失败：' + (err.message || '未知错误'));
      }
    }
  },

  /**
   * 处理采购任务提交
   */
  async processProcurementSubmit({ materialPurchases }) {
    try {
      // 构建更新数据
      const { receives, updates } = this._buildProcurementUpdates(materialPurchases);

      // 执行提交
      await this._executeProcurementSubmit(receives, updates);

      toast.success('提交成功');
      this.loadMyPanel(true);
      this.loadMyProcurementTasks();
    } catch (err) {
      // 错误已绋在私有方法中处理，直接抛出
      throw err;
    }
  },

  /**
   * 处理普通SKU批量提交
   */
  async processSKUSubmit({ detail, skuList }) {
    // 批量验证
    const validation = SKUProcessor.validateSKUInputBatch(skuList);
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return false;
    }

    // 生成扫码请求
    const requests = SKUProcessor.generateScanRequests(
      validation.validList,
      detail.orderNo,
      detail.styleNo,
      detail.progressStage
    );

    // 批量提交
    const tasks = requests.map(req =>
      api.production.executeScan({
        ...req,
        scanType: this.mapScanType(detail.progressStage),
      })
    );

    if (tasks.length === 0) {
      throw new Error('请至少输入一个数量');
    }

    await Promise.all(tasks);

    toast.success('批量提交成功');
    this.handleScanSuccess({
      success: true,
      message: `成功提交 ${tasks.length} 条记录`,
      orderNo: detail.orderNo,
      processName: detail.progressStage,
    });

    return true;
  },

  /**
   * 验证采购提交数据
   */
  validateProcurementData() {
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.id) {
      throw new Error('请先登录');
    }
    const receiverName = userInfo.realName || userInfo.username;
    if (!receiverName) {
      throw new Error('用户信息不完整(无姓名)');
    }
    return { userInfo, receiverName };
  },

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
   * 确认提交（重构版本 - 降低复杂度）
   */
  async onConfirmScan() {
    if (this.data.scanConfirm.loading) {
      return;
    }
    this.setData({ 'scanConfirm.loading': true });

    try {
      const { detail, skuList, cuttingTasks, materialPurchases } = this.data.scanConfirm;

      // 采购任务处理
      if (detail.isProcurement && materialPurchases?.length > 0) {
        // 验证用户数据
        this.validateProcurementData();
        await this.processProcurementSubmit({
          materialPurchases,
        });
        this.setData({
          'scanConfirm.loading': false,
          'scanConfirm.visible': false,
        });
        return;
      }

      // 1. 裁剪特殊处理
      if (detail.progressStage === '裁剪' && cuttingTasks.length > 0) {
        // 调用裁剪相关接口 (这里简化为批量执行 executeScan，实际可能需要生成菲号)
        // 注意：裁剪通常需要生成菲号，这里如果是“确认提交”，假设是完成裁剪
        // 如果是“生成菲号”，有单独的按钮 onRegenerateCuttingBundles
        // 这里我们暂且按普通工序提交
      }

      // 通用批量提交
      if (skuList?.length > 0) {
        await this.processSKUSubmit({ detail, skuList });
      } else {
        throw new Error('无效的提交数据');
      }
    } catch (e) {
      console.error('Submit failed:', e); // DEBUG: 打印详细错误
      toast.error(e.message || '提交失败');
    } finally {
      this.setData({
        'scanConfirm.loading': false,
        'scanConfirm.visible': false,
      });
    }
  },

  /**
   * 映射工序名称到 API scanType
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
   */
  handleScanSuccess(result) {
    // 播放成功音效 (可选)
    // wx.vibrateShort();

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
   */
  handleScanError(error) {
    // 播放失败音效/震动
    wx.vibrateLong();

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

  // ==================== 🆕 扫码结果确认页（2026-02-06 混合模式）====================

  /**
   * 🆕 工序选择器变化
   */
  onProcessPickerChange(e) {
    const index = e.detail.value;
    const option = this.data.scanResultConfirm.processOptions[index];

    this.setData({
      'scanResultConfirm.processIndex': index,
      'scanResultConfirm.processName': option.value,
      'scanResultConfirm.progressStage': option.value,
      'scanResultConfirm.scanType': option.scanType,
    });
  },

  /**
   * 🆕 领取记录（提交扫码）
   */
  async onConfirmScanResult() {
    const confirm = this.data.scanResultConfirm;

    if (confirm.loading) return;

    this.setData({ 'scanResultConfirm.loading': true });

    try {
      // 使用用户选择的工序更新 scanData
      const scanData = {
        ...confirm.scanData,
        processName: confirm.processName,
        progressStage: confirm.progressStage,
        scanType: confirm.scanType,
      };

      // 调用后端 API 提交
      const result = await api.production.executeScan(scanData);

      if (result && result.success !== false) {
        // 提交成功
        toast.success(`✅ ${confirm.processName} 领取成功`);

        // 关闭弹窗
        this.closeScanResultConfirm();

        // 更新 lastResult 显示
        this.setData({
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

        // 刷新统计
        this.loadMyPanel(true);

        // 触发全局事件
        if (eventBus && typeof eventBus.emit === 'function') {
          eventBus.emit('SCAN_SUCCESS', result);
        }
      } else {
        toast.error(result?.message || '提交失败');
      }
    } catch (e) {
      console.error('提交扫码失败:', e);
      toast.error(e.message || '提交失败');
    } finally {
      this.setData({ 'scanResultConfirm.loading': false });
    }
  },

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
