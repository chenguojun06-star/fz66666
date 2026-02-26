/**
 * 扫码页面核心业务 Mixin
 * 从 scan/index.js 提取核心扫码逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module scanCoreMixin
 * @description 管理扫码流程、成功/失败处理、数据加载
 */

const { getToken, getUserInfo, getStorageValue, isTokenExpired, clearToken } = require('../../../utils/storage');
const { toastAndRedirect, toast } = require('../../../utils/uiHelper');
const { errorHandler } = require('../../../utils/errorHandler');
/* global Behavior */
const api = require('../../../utils/api');
const ScanHandler = require('../handlers/ScanHandler');
// 修复: 从 config.js 导入 DEBUG_MODE，避免模块级 getApp() 导致启动崩溃
const { DEBUG_MODE } = require('../../../config');

/**
 * 全局变量：防重复扫码
 * key: 扫码内容, value: 过期时间戳
 */
const recentScanExpires = new Map();
const MAX_RECENT_SCANS = 80;
const CLEANUP_BATCH_SIZE = 20;

/**
 * 清理过期的扫码记录
 * @returns {void} 无返回值
 */
function cleanupRecentScans() {
  const now = Date.now();
  const toDelete = [];

  for (const [key, expireTime] of recentScanExpires.entries()) {
    if (now > expireTime) {
      toDelete.push(key);
    }
    if (toDelete.length >= CLEANUP_BATCH_SIZE) {
      break;
    }
  }

  toDelete.forEach(key => recentScanExpires.delete(key));
}

/**
 * 检查是否为重复扫码
 * @param {string} key - 扫码内容
 * @returns {boolean} 是否重复
 */
function isRecentDuplicate(key) {
  const now = Date.now();
  const expireTime = recentScanExpires.get(key);

  if (expireTime && now < expireTime) {
    return true;
  }

  // 清理过期记录
  if (recentScanExpires.size > MAX_RECENT_SCANS) {
    cleanupRecentScans();
  }

  return false;
}

/**
 * 标记为最近扫码
 * @param {string} key - 扫码内容
 * @param {number} ttlMs - 有效期（毫秒）
 * @returns {void} 无返回值
 */
function markRecent(key, ttlMs) {
  const expireTime = Date.now() + ttlMs;
  recentScanExpires.set(key, expireTime);
}

/**
 * 核心业务 Mixin
 * 使用微信小程序的 Behavior 机制
 */
const scanCoreMixin = Behavior({
  methods: {
    // ==================== ScanHandler 惰性初始化 ====================

    /**
     * 确保 scanHandler 已初始化
     * 兜底逻辑：如果 Behavior 的 onLoad 未运行（微信版本兼容性问题），
     * 在首次扫码时就地初始化 ScanHandler
     * @returns {void}
     * @private
     */
    _ensureScanHandler() {
      if (this.scanHandler) {
        return; // 已初始化，跳过
      }
      try {
        this.scanHandler = new ScanHandler(api, {
          onSuccess: this.handleScanSuccess.bind(this),
          onError: this.handleScanError.bind(this),
          getCurrentFactory: () => this.data.currentFactory,
          getCurrentWorker: () => this.data.currentUser,
        });
      } catch (e) {
        console.error('[scanCoreMixin] scanHandler 惰性初始化失败:', e);
      }
    },

    // ==================== 登录检查 ====================

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

      // 检查 JWT token 是否已过期（提前5分钟判定）
      if (isTokenExpired()) {
        console.warn('[checkLoginStatus] token已过期，清除并跳转登录');
        clearToken();
        toastAndRedirect('登录已过期，请重新登录', '/pages/login/index');
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

    // ==================== 数据加载 ====================

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
            scanCount: res.scanCount || 0,
            orderCount: res.orderCount || 0,
            totalQuantity: res.totalQuantity || 0,
            totalAmount: res.totalAmount || 0,
          },
        });
      } catch (e) {
        // 统计数据加载失败：记录错误并提示用户
        console.error('[loadMyPanel] 加载统计数据失败:', e.message || e);
        this.setData({
          'my.stats': {
            scanCount: 0,
            orderCount: 0,
            totalQuantity: 0,
            totalAmount: 0,
          },
        });
        if (DEBUG_MODE) {
          wx.showToast({ title: '统计加载失败', icon: 'none' });
        }
      } finally {
        this.setData({ 'my.loadingStats': false });
      }

      // 同时加载扫码历史
      await this.loadMyHistory(true);
    },

    // ==================== 核心扫码流程 ====================

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

      // 扫码类型: 优先使用页面选中状态，默认为自动识别
      const currentScanType = this.data.scanType || 'auto';

      // 🚨 入库模式下，必须选择仓库
      if (currentScanType === 'warehouse' && !this.data.warehouse) {
        toast.error('请先选择目标仓库');
        return;
      }

      // 这里的逻辑主要用于点击"扫码"按钮触发摄像头
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

      // 2. 特殊模式处理：面辅料料卷（MR开头）→ 跳转料卷扫码页
      if (/^MR\d{13}$/.test(codeStr)) {
        this.setData({ loading: false });
        wx.navigateTo({
          url: `/pages/warehouse/material/scan/index?rollCode=${encodeURIComponent(codeStr)}`,
        });
        return;
      }

      // 3. 特殊模式处理：库存查询
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

      // 惰性初始化：如果 Behavior 的 onLoad 未跑（微信版本兼容性问题），这里补初始化
      this._ensureScanHandler();

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
        // 确认弹窗期间锁住同一码 30s，防止用户重复扫同一 QR 开多个弹窗
        markRecent(codeStr, 30000);
        this.showScanResultConfirm(result.data);
        this.setData({ loading: false });
        return;
      }

      // 处理需要确认明细的情况 (如订单扫码)
      if (result && result.needConfirm) {
        // 同上，确认弹窗期间防重复
        markRecent(codeStr, 30000);
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
        // ✅ 触发成功回调（语音+振动+UI更新）
        this.handleScanSuccess(result);
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

      // 已完成：显示完成提示
      if (e.isCompleted) {
        toast.success(e.message || '进度节点已完成');
        this.setData({ loading: false });
        return;
      }

      toast.error(e.errMsg || e.message || '系统异常');
      errorHandler.logError(e, '_handleScanException');
    },

    // ==================== Handler 回调 ====================

    /**
     * Handler 回调: 扫码成功
     * @param {Object} result - 扫码结果对象
     * @returns {void} 无返回值
     */
    handleScanSuccess(result) {
      // ✅ 播放成功反馈 - 轻震动（15ms）
      wx.vibrateShort({ type: 'light' });

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

      // 延迟 800ms 再刷新面板：
      // 1. 给后端事务足够时间落库，确保历史 API 能返回刚提交的扫码记录
      // 2. 避免立即调用 + eventBus 二次触发并发竞争 my.loadingHistory 锁
      //    （两次并发时第二次会被 loadingHistory 守卫直接退出，导致列表不更新）
      setTimeout(() => {
        if (this && this.data) {
          this.loadMyPanel(true);
        }
      }, 800);
    },

    /**
     * Handler 回调: 扫码失败
     * @param {Error} error - 错误对象
     * @returns {void} 无返回值
     */
    handleScanError(error) {
      // 播放失败音效/震动
      wx.vibrateLong();

      const errorResult = {
        success: false,
        message: error.errMsg || error.message || '扫码失败',
        displayTime: new Date().toLocaleTimeString(),
        statusText: '失败',
        statusClass: 'error',
      };

      this.setData({
        lastResult: errorResult,
      });

      // 错误提示已在 Handler 或 processScanCode 中通过 Toast 显示，这里主要更新 UI 状态
    },

    // ==================== 工具方法 ====================

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
      return map[stageName] || 'production';
    },
  },
});

module.exports = scanCoreMixin;
