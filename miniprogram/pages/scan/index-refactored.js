/**
 * 扫码页面 - 重构版本
 * 
 * 架构：Page → Handler → Service → Utils
 * 
 * 核心改进：
 * 1. 使用 ScanHandler 编排扫码业务流程（替代原有 2000+ 行逻辑）
 * 2. QRCodeParser 处理所有二维码解析（支持 4 种格式）
 * 3. StageDetector 智能识别工序（订单级 + 菲号级）
 * 4. 保留原有 UI 交互和用户体验
 * 
 * 文件大小：从 2927 行优化到 ~400 行（减少 85%）
 * 
 * @version 2.0
 * @date 2026-01-23
 */

import api from '../../utils/api';
import { getBaseUrl, DEBUG_MODE } from '../../config';
import { getToken, getStorageValue, setStorageValue } from '../../utils/storage';
import { errorHandler } from '../../utils/errorHandler';
import * as reminderManager from '../../utils/reminderManager';

const ScanHandler = require('./handlers/ScanHandler');

// ==================== 全局变量 ====================

let undoTimer = null;          // 撤销倒计时定时器
let confirmTimer = null;       // 确认倒计时定时器
let confirmTickTimer = null;   // 确认秒数更新定时器

// 重复扫码防护（客户端侧）
const recentScanExpires = new Map();

// ==================== 辅助函数 ====================

/**
 * 清理过期的扫码记录
 */
function cleanupRecentScans() {
    if (recentScanExpires.size <= 80) return;
    const now = Date.now();
    for (const [k, exp] of recentScanExpires.entries()) {
        if (!exp || exp <= now) recentScanExpires.delete(k);
    }
    if (recentScanExpires.size <= 80) return;
    let removed = 0;
    for (const k of recentScanExpires.keys()) {
        recentScanExpires.delete(k);
        removed += 1;
        if (removed >= 20) break;
    }
}

/**
 * 检查是否为客户端重复扫码
 */
function isRecentDuplicate(key) {
    const now = Date.now();
    const exp = recentScanExpires.get(key);
    if (exp && exp > now) return true;
    if (exp && exp <= now) recentScanExpires.delete(key);
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

/**
 * 取消最近扫码标记
 */
function unmarkRecent(key) {
    recentScanExpires.delete(key);
}

// ==================== Page 定义 ====================

Page({
    data: {
        // 扫码状态
        scanEnabled: true,
        scanning: false,
        
        // 工厂和用户信息
        currentFactory: null,
        currentUser: null,
        
        // 扫码结果
        lastResult: {
            success: false,
            message: '',
            scanCode: '',
            orderNo: '',
            styleNo: '',
            processName: '',
            quantity: 0,
        },
        
        // 撤销功能
        undo: {
            canUndo: false,
            loading: false,
            expireAt: 0,
            countdown: 0,
            payload: null,
        },
        
        // 我的面板数据
        myPanel: {
            loading: false,
            todayScans: 0,
            todayQuantity: 0,
            recentRecords: [],
        },
        
        // 提醒列表
        reminders: [],
        reminderCount: 0,
        
        // 质检模式
        qualityMode: false,
        
        // 系统配置
        debugMode: DEBUG_MODE || false,
    },

    // ==================== 生命周期 ====================

    async onLoad(options) {
        console.log('[Scan] 页面加载', options);
        
        // 初始化 ScanHandler
        this.scanHandler = new ScanHandler(api, {
            getCurrentFactory: () => this.data.currentFactory,
            getCurrentWorker: () => this.data.currentUser,
            onSuccess: (result) => this.handleScanSuccess(result),
            onError: (message) => this.handleScanError(message),
        });
        
        // 加载工厂信息
        await this.loadFactoryInfo();
        
        // 加载用户信息
        await this.loadUserInfo();
        
        // 加载我的面板
        await this.loadMyPanel();
        
        // 加载提醒列表
        await this.loadReminders();
        
        // 检查质检模式
        if (options.qualityMode === 'true') {
            this.setData({ qualityMode: true });
        }
    },

    onShow() {
        console.log('[Scan] 页面显示');
        
        // 刷新数据
        this.loadMyPanel();
        this.loadReminders();
        
        // 注册全局刷新事件
        const { on, Events } = require('../../utils/eventBus');
        on(Events.DATA_REFRESH, this.handleDataRefresh, this);
    },

    onHide() {
        console.log('[Scan] 页面隐藏');
        
        // 清理定时器
        this.clearTimers();
        
        // 取消事件监听
        const { off, Events } = require('../../utils/eventBus');
        off(Events.DATA_REFRESH, this.handleDataRefresh, this);
    },

    onUnload() {
        console.log('[Scan] 页面卸载');
        this.clearTimers();
    },

    // ==================== 核心功能：扫码 ====================

    /**
     * 扫码按钮点击
     */
    async onScanTap() {
        // 验证权限
        const permission = this.scanHandler.validateScanPermission();
        if (!permission.valid) {
            wx.showToast({ 
                title: permission.message, 
                icon: 'none',
                duration: 2000 
            });
            return;
        }

        // 调起扫码
        try {
            const res = await wx.scanCode({
                onlyFromCamera: true,
                scanType: ['qrCode', 'barCode'],
            });

            if (res.result) {
                await this.processScan(res.result);
            }
        } catch (e) {
            if (e.errMsg && e.errMsg.includes('cancel')) {
                console.log('[Scan] 用户取消扫码');
                return;
            }
            console.error('[Scan] 扫码失败:', e);
            wx.showToast({ 
                title: '扫码失败', 
                icon: 'none' 
            });
        }
    },

    /**
     * 处理扫码结果（核心方法）
     * 使用 ScanHandler 编排整个业务流程
     */
    async processScan(rawScanCode) {
        console.log('[Scan] 开始处理扫码:', rawScanCode);

        // 客户端防重复检查
        const dedupKey = `scan:${rawScanCode}`;
        if (isRecentDuplicate(dedupKey)) {
            wx.showToast({ 
                title: '请勿重复扫码', 
                icon: 'none',
                duration: 1500
            });
            return;
        }

        // 显示加载
        wx.showLoading({ title: '处理中...', mask: true });

        try {
            // 调用 Handler 处理扫码
            const result = await this.scanHandler.handleScan(rawScanCode);

            wx.hideLoading();

            if (result.success) {
                // 成功：标记为最近扫过
                markRecent(dedupKey, 2000);
                
                // 震动反馈
                wx.vibrateShort({ type: 'light' });
                
                // 显示成功提示
                wx.showToast({
                    title: result.message,
                    icon: 'success',
                    duration: 1500,
                });

                // 更新 UI（已在 handleScanSuccess 中处理）
                
            } else {
                // 失败：显示错误
                wx.showToast({
                    title: result.message,
                    icon: 'none',
                    duration: 2000,
                });
            }

        } catch (e) {
            wx.hideLoading();
            console.error('[Scan] 扫码处理异常:', e);
            
            const msg = errorHandler.formatError(e, '扫码失败');
            wx.showToast({ 
                title: msg, 
                icon: 'none',
                duration: 2000 
            });
        }
    },

    /**
     * 扫码成功回调（由 ScanHandler 触发）
     */
    handleScanSuccess(result) {
        console.log('[Scan] 扫码成功:', result);

        // 更新最后结果
        this.setData({
            lastResult: {
                success: true,
                message: result.message,
                scanCode: result.data.orderNo + (result.data.bundleNo ? `-${result.data.bundleNo}` : ''),
                orderNo: result.data.orderNo,
                styleNo: result.data.styleNo || '',
                processName: result.data.processName,
                quantity: result.data.quantity,
            },
        });

        // 设置撤销功能
        this.setupUndo(result.data);

        // 刷新我的面板
        this.loadMyPanel(true);

        // 移除该订单的提醒
        if (result.data.orderNo) {
            reminderManager.removeRemindersByOrder(
                result.data.orderNo,
                result.data.processName
            );
            this.loadReminders();
        }

        // 触发全局数据刷新事件
        const { triggerDataRefresh, Events } = require('../../utils/eventBus');
        triggerDataRefresh('scans', {
            action: 'create',
            orderNo: result.data.orderNo,
            scanCode: result.data.orderNo,
            processName: result.data.processName,
        });
    },

    /**
     * 扫码失败回调（由 ScanHandler 触发）
     */
    handleScanError(message) {
        console.log('[Scan] 扫码失败:', message);

        // 更新最后结果
        this.setData({
            lastResult: {
                success: false,
                message: message,
                scanCode: '',
                orderNo: '',
                styleNo: '',
                processName: '',
                quantity: 0,
            },
        });
    },

    // ==================== 撤销功能 ====================

    /**
     * 设置撤销功能
     */
    setupUndo(scanData) {
        // 清除旧定时器
        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }

        // 计算过期时间（10秒）
        const expireAt = Date.now() + 10000;

        // 设置撤销数据
        this.setData({
            undo: {
                canUndo: true,
                loading: false,
                expireAt: expireAt,
                countdown: 10,
                payload: {
                    orderNo: scanData.orderNo,
                    bundleNo: scanData.bundleNo || '',
                    scanCode: scanData.orderNo,
                    processName: scanData.processName,
                    dedupKey: `scan:${scanData.orderNo}`,
                },
            },
        });

        // 开始倒计时
        undoTimer = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((this.data.undo.expireAt - now) / 1000));

            if (remaining <= 0) {
                // 倒计时结束
                clearInterval(undoTimer);
                undoTimer = null;
                this.setData({
                    undo: {
                        ...this.data.undo,
                        canUndo: false,
                        countdown: 0,
                    },
                });
            } else {
                // 更新倒计时
                this.setData({
                    'undo.countdown': remaining,
                });
            }
        }, 1000);
    },

    /**
     * 执行撤销
     */
    async performUndo() {
        const undo = this.data.undo;
        if (!undo || !undo.canUndo || undo.loading || !undo.payload) return;

        this.setData({ 'undo.loading': true });

        try {
            // 调用撤销 API
            await api.production.undoScan(undo.payload);

            // 清除重复标记
            unmarkRecent(undo.payload.dedupKey || '');

            // 更新状态
            this.setData({
                undo: {
                    canUndo: false,
                    loading: false,
                    expireAt: 0,
                    countdown: 0,
                    payload: null,
                },
                lastResult: {
                    success: true,
                    message: '已撤销本次扫码',
                    scanCode: undo.payload.scanCode || '',
                    orderNo: undo.payload.orderNo || '',
                    styleNo: this.data.lastResult.styleNo || '',
                    processName: undo.payload.processName || '',
                },
            });

            wx.showToast({ title: '已撤销', icon: 'none' });

            // 刷新数据
            this.loadMyPanel(true);

            // 触发全局数据刷新事件
            const { triggerDataRefresh, Events } = require('../../utils/eventBus');
            triggerDataRefresh('scans', {
                action: 'undo',
                orderNo: undo.payload.orderNo,
                scanCode: undo.payload.scanCode,
            });

        } catch (e) {
            console.error('[Scan] 撤销失败:', e);

            this.setData({ 'undo.loading': false });

            const statusCode = e && e.type === 'http' ? Number(e.statusCode) : NaN;
            const unsupported = statusCode === 404 || statusCode === 405;

            if (unsupported) {
                wx.showModal({
                    title: '无法撤销',
                    content: '服务器暂不支持撤销，请联系管理员在后台回退本次扫码记录。',
                    showCancel: false,
                });
            } else {
                wx.showToast({ 
                    title: '撤销失败', 
                    icon: 'none' 
                });
            }
        }
    },

    /**
     * 撤销按钮点击（别名方法）
     */
    async onUndo() {
        await this.performUndo();
    },

    // ==================== 我的面板 ====================

    /**
     * 加载我的面板数据
     */
    async loadMyPanel(silent = false) {
        if (!silent) {
            this.setData({ 'myPanel.loading': true });
        }

        try {
            const user = this.data.currentUser;
            if (!user || !user.name) {
                this.setData({
                    myPanel: {
                        loading: false,
                        todayScans: 0,
                        todayQuantity: 0,
                        recentRecords: [],
                    },
                });
                return;
            }

            // 使用 ScanHandler 获取统计信息
            const stats = await this.scanHandler.getScanStatistics(user.name);

            this.setData({
                myPanel: {
                    loading: false,
                    todayScans: stats.todayScans,
                    todayQuantity: stats.todayQuantity,
                    recentRecords: stats.recentRecords,
                },
            });

        } catch (e) {
            console.error('[Scan] 加载我的面板失败:', e);
            this.setData({
                myPanel: {
                    loading: false,
                    todayScans: 0,
                    todayQuantity: 0,
                    recentRecords: [],
                },
            });
        }
    },

    /**
     * 刷新我的面板
     */
    async onRefreshMyPanel() {
        await this.loadMyPanel();
        wx.showToast({
            title: '已刷新',
            icon: 'none',
            duration: 1000,
        });
    },

    // ==================== 提醒列表 ====================

    /**
     * 加载提醒列表
     */
    async loadReminders() {
        try {
            const reminders = await reminderManager.getReminders();
            this.setData({
                reminders: reminders || [],
                reminderCount: (reminders || []).length,
            });
        } catch (e) {
            console.error('[Scan] 加载提醒失败:', e);
        }
    },

    /**
     * 提醒项点击
     */
    onReminderTap(e) {
        const { index } = e.currentTarget.dataset;
        const reminder = this.data.reminders[index];
        if (!reminder) return;

        // 跳转到订单详情
        wx.navigateTo({
            url: `/pages/order/detail?orderNo=${reminder.orderNo}`,
        });
    },

    // ==================== 工厂和用户信息 ====================

    /**
     * 加载工厂信息
     */
    async loadFactoryInfo() {
        try {
            const factoryId = await getStorageValue('selectedFactoryId');
            if (!factoryId) {
                this.setData({ currentFactory: null });
                return;
            }

            const factory = await api.factory.getById(factoryId);
            this.setData({ currentFactory: factory });

        } catch (e) {
            console.error('[Scan] 加载工厂信息失败:', e);
            this.setData({ currentFactory: null });
        }
    },

    /**
     * 加载用户信息
     */
    async loadUserInfo() {
        try {
            const user = await api.auth.getCurrentUser();
            this.setData({ currentUser: user });

        } catch (e) {
            console.error('[Scan] 加载用户信息失败:', e);
            this.setData({ currentUser: null });
        }
    },

    /**
     * 获取当前用户（兼容方法）
     */
    async getCurrentUser() {
        if (this.data.currentUser) {
            return this.data.currentUser;
        }
        await this.loadUserInfo();
        return this.data.currentUser;
    },

    // ==================== 全局事件 ====================

    /**
     * 处理全局数据刷新事件
     */
    handleDataRefresh(event) {
        console.log('[Scan] 收到数据刷新事件:', event);

        if (event.type === 'scans' || event.type === 'orders') {
            this.loadMyPanel(true);
            this.loadReminders();
        }
    },

    // ==================== 工具方法 ====================

    /**
     * 清理所有定时器
     */
    clearTimers() {
        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }
        if (confirmTimer) {
            clearTimeout(confirmTimer);
            confirmTimer = null;
        }
        if (confirmTickTimer) {
            clearInterval(confirmTickTimer);
            confirmTickTimer = null;
        }
    },

    /**
     * 调试：模拟扫码（开发环境）
     */
    async onDebugScan() {
        if (!this.data.debugMode) return;

        const testCodes = [
            'PO20260122001',                                    // 订单扫码
            'PO20260122001-ST001-黑色-L-50-01',                // 菲号扫码
            '{"type":"order","orderNo":"PO20260122001"}',      // JSON 格式
            '?scanCode=PO20260122001&quantity=100',            // URL 参数
        ];

        wx.showActionSheet({
            itemList: testCodes,
            success: async (res) => {
                const code = testCodes[res.tapIndex];
                await this.processScan(code);
            },
        });
    },
});
