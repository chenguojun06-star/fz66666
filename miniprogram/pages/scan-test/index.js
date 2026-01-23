/**
 * 扫码测试页面 - 使用重构后的新架构
 * 
 * 目的：并行测试新旧架构，确保功能一致性
 * 
 * 使用方式：
 * 1. 在 app.json 中添加此页面
 * 2. 从首页跳转到此页面测试
 * 3. 对比旧版扫码页面（pages/scan/index）
 * 
 * @version 2.0 (Refactored)
 * @date 2026-01-23
 */

// 直接复制 index-refactored.js 的内容
import api from '../../utils/api';
import { getBaseUrl, DEBUG_MODE } from '../../config';
import { getToken, getStorageValue, setStorageValue } from '../../utils/storage';
import { errorHandler } from '../../utils/errorHandler';
import * as reminderManager from '../../utils/reminderManager';

// 导入重构后的 ScanHandler（使用 CommonJS require）
const ScanHandler = require('../scan/handlers/ScanHandler');

// ==================== 全局变量 ====================

let undoTimer = null;
let confirmTimer = null;
let confirmTickTimer = null;

const recentScanExpires = new Map();

// ==================== 辅助函数 ====================

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

function isRecentDuplicate(key) {
    const now = Date.now();
    const exp = recentScanExpires.get(key);
    if (exp && exp > now) return true;
    if (exp && exp <= now) recentScanExpires.delete(key);
    return false;
}

function markRecent(key, ttlMs) {
    const ttl = Number(ttlMs);
    const ms = Number.isFinite(ttl) && ttl > 0 ? ttl : 2000;
    recentScanExpires.set(key, Date.now() + ms);
    cleanupRecentScans();
}

function unmarkRecent(key) {
    recentScanExpires.delete(key);
}

// ==================== Page 定义 ====================

Page({
    data: {
        // 标识这是测试页面
        isTestPage: true,
        testVersion: '2.0 (Refactored)',
        
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
        debugMode: true, // 测试页面默认开启调试
    },

    async onLoad(options) {
        console.log('[ScanTest] 页面加载');
        
        wx.showToast({
            title: '🧪 测试版本 2.0',
            icon: 'none',
            duration: 2000,
        });
        
        // 初始化 ScanHandler
        try {
            this.scanHandler = new ScanHandler(api, {
                getCurrentFactory: () => this.data.currentFactory,
                getCurrentWorker: () => this.data.currentUser,
                onSuccess: (result) => this.handleScanSuccess(result),
                onError: (message) => this.handleScanError(message),
            });
        } catch (error) {
            console.error('[ScanTest] 初始化失败:', error);
            wx.showModal({
                title: '初始化失败',
                content: error.message,
                showCancel: false
            });
            return;
        }
        
        // 加载数据
        await this.loadFactoryInfo();
        await this.loadUserInfo();
        await this.loadMyPanel();
        await this.loadReminders();
        
        if (options.qualityMode === 'true') {
            this.setData({ qualityMode: true });
        }
    },

    onShow() {
        console.log('[ScanTest] 页面显示');
        this.loadMyPanel();
        this.loadReminders();
    },

    onHide() {
        console.log('[ScanTest] 页面隐藏');
        this.clearTimers();
    },

    onUnload() {
        console.log('[ScanTest] 页面卸载');
        this.clearTimers();
    },

    // ==================== 核心功能：扫码 ====================

    async onScanTap() {
        const permission = this.scanHandler.validateScanPermission();
        if (!permission.valid) {
            wx.showToast({ 
                title: permission.message, 
                icon: 'none',
                duration: 2000 
            });
            return;
        }

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
                console.log('[ScanTest] 用户取消扫码');
                return;
            }
            console.error('[ScanTest] 扫码失败:', e);
            wx.showToast({ 
                title: '扫码失败', 
                icon: 'none' 
            });
        }
    },

    async processScan(rawScanCode) {
        console.log('[ScanTest] 处理扫码:', rawScanCode);

        // 检查 ScanHandler 是否已初始化
        if (!this.scanHandler) {
            console.error('[ScanTest] ScanHandler 未初始化');
            wx.showToast({ 
                title: '系统初始化中，请稍后', 
                icon: 'none',
                duration: 2000
            });
            return;
        }

        const dedupKey = `scan:${rawScanCode}`;
        if (isRecentDuplicate(dedupKey)) {
            wx.showToast({ 
                title: '请勿重复扫码', 
                icon: 'none',
                duration: 1500
            });
            return;
        }

        wx.showLoading({ title: '处理中...', mask: true });

        try {
            const result = await this.scanHandler.handleScan(rawScanCode);
            console.log('[ScanTest] 扫码结果:', result.success ? '成功' : '失败', result.message);

            // 检查是否需要输入数量（在hideLoading之前检查）
            if (!result.success && result.needInput) {
                wx.hideLoading();
                this.showQuantityInput(rawScanCode, result.data);
                return;
            }

            wx.hideLoading();

            if (result.success) {
                markRecent(dedupKey, 2000);
                wx.vibrateShort({ type: 'light' });
                wx.showToast({
                    title: result.message,
                    icon: 'success',
                    duration: 1500,
                });
            } else {
                wx.showToast({
                    title: result.message,
                    icon: 'none',
                    duration: 2000,
                });
            }

        } catch (e) {
            wx.hideLoading();
            console.error('[ScanTest] 扫码处理异常:', e);
            
            const msg = errorHandler.formatError(e, '扫码失败');
            wx.showToast({ 
                title: msg, 
                icon: 'none',
                duration: 2000 
            });
        }
    },

    // 显示数量输入弹窗
    showQuantityInput(rawScanCode, parsedData) {
        wx.showModal({
            title: '请输入数量',
            content: `订单号: ${parsedData.orderNo}`,
            editable: true,
            placeholderText: '请输入数量',
            success: async (res) => {
                if (res.confirm && res.content) {
                    const quantity = parseInt(res.content, 10);
                    if (isNaN(quantity) || quantity <= 0) {
                        wx.showToast({
                            title: '请输入有效数量',
                            icon: 'none'
                        });
                        return;
                    }
                    // 重新扫码,传入手动输入的数量
                    await this.processScanWithQuantity(rawScanCode, quantity);
                }
            }
        });
    },

    // 带数量的扫码处理
    async processScanWithQuantity(rawScanCode, quantity) {
        const dedupKey = `scan:${rawScanCode}`;
        wx.showLoading({ title: '提交中...', mask: true });

        try {
            // 调用 handleScan 并传入手动输入的数量
            const result = await this.scanHandler.handleScan(rawScanCode, quantity);
            
            wx.hideLoading();

            if (result.success) {
                markRecent(dedupKey, 2000);
                wx.vibrateShort({ type: 'light' });
                wx.showToast({
                    title: result.message,
                    icon: 'success',
                    duration: 1500,
                });
            } else {
                wx.showToast({
                    title: result.message,
                    icon: 'none',
                    duration: 2000,
                });
            }
        } catch (e) {
            wx.hideLoading();
            console.error('[ScanTest] 提交失败:', e);
            wx.showToast({
                title: errorHandler.formatError(e, '提交失败'),
                icon: 'none',
                duration: 2000
            });
        }
    },

    handleScanSuccess(result) {
        console.log('[ScanTest] 扫码成功:', result);

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

        this.setupUndo(result.data);
        this.loadMyPanel(true);

        if (result.data.orderNo) {
            reminderManager.removeRemindersByOrder(
                result.data.orderNo,
                result.data.processName
            );
            this.loadReminders();
        }

        const { triggerDataRefresh, Events } = require('../../utils/eventBus');
        triggerDataRefresh('scans', {
            action: 'create',
            orderNo: result.data.orderNo,
            scanCode: result.data.orderNo,
            processName: result.data.processName,
        });
    },

    handleScanError(message) {
        console.log('[ScanTest] 扫码失败:', message);

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

    setupUndo(scanData) {
        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }

        const expireAt = Date.now() + 10000;

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

        undoTimer = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((this.data.undo.expireAt - now) / 1000));

            if (remaining <= 0) {
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
                this.setData({
                    'undo.countdown': remaining,
                });
            }
        }, 1000);
    },

    async performUndo() {
        const undo = this.data.undo;
        if (!undo || !undo.canUndo || undo.loading || !undo.payload) return;

        this.setData({ 'undo.loading': true });

        try {
            // 使用 executeScan 进行删除
            await api.production.executeScan({
                action: 'delete',
                recordId: undo.payload.recordId
            });
            
            unmarkRecent(undo.payload.dedupKey || '');

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
            this.loadMyPanel(true);

            triggerDataRefresh('scans', {
                action: 'undo',
                orderNo: undo.payload.orderNo,
                scanCode: undo.payload.scanCode,
            });

        } catch (e) {
            console.error('[ScanTest] 撤销失败:', e);
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
                    title: '撤销失败: ' + (e.message || '未知错误'), 
                    icon: 'none' 
                });
            }
        }
    },

    async onUndo() {
        await this.performUndo();
    },

    // ==================== 我的面板 ====================

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
            console.error('[ScanTest] 加载我的面板失败:', e);
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

    async onRefreshMyPanel() {
        await this.loadMyPanel();
        wx.showToast({
            title: '已刷新',
            icon: 'none',
            duration: 1000,
        });
    },

    // ==================== 提醒列表 ====================

    async loadReminders() {
        try {
            const reminders = await reminderManager.getReminders();
            this.setData({
                reminders: reminders || [],
                reminderCount: (reminders || []).length,
            });
        } catch (e) {
            console.error('[ScanTest] 加载提醒失败:', e);
        }
    },

    onReminderTap(e) {
        const { index } = e.currentTarget.dataset;
        const reminder = this.data.reminders[index];
        if (!reminder) return;

        wx.navigateTo({
            url: `/pages/order/detail?orderNo=${reminder.orderNo}`,
        });
    },

    // ==================== 工厂和用户信息 ====================

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
            console.error('[ScanTest] 加载工厂信息失败:', e);
            this.setData({ currentFactory: null });
        }
    },

    async loadUserInfo() {
        try {
            const user = await api.system.getMe();
            this.setData({ currentUser: user || null });

        } catch (e) {
            console.error('[ScanTest] 加载用户信息失败:', e);
            this.setData({ currentUser: null });
        }
    },

    async getCurrentUser() {
        if (this.data.currentUser) {
            return this.data.currentUser;
        }
        await this.loadUserInfo();
        return this.data.currentUser;
    },

    // ==================== 全局事件 ====================

    handleDataRefresh(event) {
        console.log('[ScanTest] 收到数据刷新事件:', event);

        if (event.type === 'scans' || event.type === 'orders') {
            this.loadMyPanel(true);
            this.loadReminders();
        }
    },

    // ==================== 工具方法 ====================

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

    // ==================== 测试专用方法 ====================

    /**
     * 快速测试：模拟扫码
     */
    async onDebugScan() {
        const testCodes = [
            'PO20260122001',
            'PO20260122001-ST001-黑色-L-50-01',
            '{"type":"order","orderNo":"PO20260122001"}',
            '?scanCode=PO20260122001&quantity=100',
        ];

        wx.showActionSheet({
            itemList: [
                '1. 订单扫码',
                '2. 菲号扫码',
                '3. JSON格式',
                '4. URL参数',
            ],
            success: async (res) => {
                const code = testCodes[res.tapIndex];
                console.log('[ScanTest] 模拟扫码:', code);
                await this.processScan(code);
            },
        });
    },

    /**
     * 对比测试：跳转到旧版页面
     */
    onGoToOldVersion() {
        wx.redirectTo({
            url: '/pages/scan/index',
            fail: () => {
                wx.showToast({
                    title: '无法跳转',
                    icon: 'none',
                });
            },
        });
    },
});
