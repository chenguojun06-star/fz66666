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
import { getBaseUrl, DEBUG_MODE } from '../../config';
import { getToken, getStorageValue, setStorageValue, getUserInfo } from '../../utils/storage';
import { errorHandler } from '../../utils/errorHandler';
import * as reminderManager from '../../utils/reminderManager';

// 修复: 正确导入 EventBus 实例
const { eventBus } = require('../../utils/eventBus');

const ScanHandler = require('./handlers/ScanHandler');
const SKUProcessor = require('./processors/SKUProcessor');

// ==================== 全局变量 ====================

let undoTimer = null;          // 撤销倒计时定时器

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

        // 扫码类型选项 (兼容 WXML)
        scanTypeOptions: [
            { label: '自动识别', value: 'auto' },
            { label: '采购', value: 'procurement' },
            { label: '裁剪', value: 'cutting' },
            { label: '车缝', value: 'production' }, // 对应后端 production
            { label: '入库', value: 'warehouse' }   // 对应后端 warehouse
        ],
        scanTypeIndex: 0,

        // 扫码结果 (兼容 WXML)
        lastResult: null,
        scanHistory: [], // 本地历史记录

        // 撤销相关 (兼容 WXML)
        undo: {
            canUndo: false,
            loading: false
        },
        undoCountdown: 0,
        undoRecord: null,

        // 我的数据面板
        my: {
            loadingStats: false,
            stats: {
                scanCount: 0,
                orderCount: 0
            }
        },

        // 确认弹窗
        scanConfirm: {
            visible: false,
            loading: false,
            remain: 0,
            detail: null,
            skuList: []
        },

        // 调试模式
        debug: DEBUG_MODE
    },

    // 业务处理器实例
    scanHandler: null,
    // 事件订阅取消函数
    unsubscribeEvents: null,

    /**
     * 生命周期函数--监听页面加载
     */
    async onLoad(options) {
        // 初始化业务处理器
        this.scanHandler = new ScanHandler(api, {
            onSuccess: this.handleScanSuccess.bind(this),
            onError: this.handleScanError.bind(this),
            getCurrentFactory: () => this.data.currentFactory,
            getCurrentWorker: () => this.data.currentUser
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
        } else {
        }

        await this.checkLoginStatus();
        this.loadLocalHistory();
    },

    /**
     * 生命周期函数--监听页面显示
     */
    async onShow() {

        // 每次显示都检查登录状态和更新统计
        const isLogin = await this.checkLoginStatus();
        if (isLogin) {
            this.loadMyPanel(true);

            // 如果有参数传入 (如从其他页面带参数跳转)
            // 这里可以处理 options 中的扫码参数，但 onShow 没有 options 参数
            // 通常在 onLoad 处理，或者通过全局变量/Storage 传递
        }
    },

    /**
     * 生命周期函数--监听页面隐藏
     */
    onHide() {
        // 清理定时器
        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }
    },

    /**
     * 生命周期函数--监听页面卸载
     */
    onUnload() {
        // 取消订阅
        if (this.unsubscribeEvents) {
            this.unsubscribeEvents();
        }

        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }
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
            wx.showToast({
                title: '请先登录',
                icon: 'none'
            });
            setTimeout(() => {
                wx.redirectTo({ url: '/pages/login/index' });
            }, 1500);
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
     * 加载个人统计面板
     */
    async loadMyPanel(refresh = false) {
        if (this.data.my.loadingStats && !refresh) return;

        this.setData({ 'my.loadingStats': true });

        try {
            // 修复: 使用正确的 API 方法 personalScanStats
            const res = await api.production.personalScanStats();
            this.setData({
                'my.stats': {
                    scanCount: res.todayCount || 0,
                    orderCount: res.orderCount || 0
                }
            });
        } catch (e) {
            // 不弹窗报错，以免打扰用户，只记录日志
        } finally {
            this.setData({ 'my.loadingStats': false });
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
     */
    onQuantityInput(e) {
        this.setData({ quantity: e.detail.value });
    },

    /**
     * 触发扫码
     */
    async handleScan() {
        if (!this.data.scanEnabled || this.data.loading) return;

        // 获取当前选中的扫码类型
        const scanTypeOption = this.data.scanTypeOptions[this.data.scanTypeIndex];
        const currentScanType = scanTypeOption ? scanTypeOption.value : 'auto';

        // 这里的逻辑主要用于点击“扫码”按钮触发摄像头
        // 如果是 PDA 设备，可能有物理按键触发，会产生键盘事件或直接输入
        // 这里主要处理微信小程序的相机调用

        wx.scanCode({
            onlyFromCamera: true, // 只允许相机扫码
            scanType: ['qrCode', 'barCode'],
            success: (res) => {
                this.processScanCode(res.result, currentScanType);
            },
            fail: (err) => {
                if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
                    wx.showToast({
                        title: '扫码失败',
                        icon: 'none'
                    });
                }
            }
        });
    },

    /**
     * 处理扫码结果 (核心入口)
     */
    async processScanCode(codeStr, scanType) {
        if (!codeStr) return;

        // 1. 客户端去重检查
        if (isRecentDuplicate(codeStr)) {
            wx.showToast({ title: '扫码太快啦', icon: 'none' });
            return;
        }

        this.setData({ loading: true });

        // 2. 准备参数
        const options = {
            scanType: scanType,
            quantity: this.data.quantity, // 手动输入的数量
            warehouse: this.data.warehouse
        };

        try {
            // 3. 调用 Handler 处理
            const result = await this.scanHandler.handleScan(codeStr, options);

            // 2026-01-23: 处理需要确认明细的情况 (如订单扫码)
            if (result && result.needConfirm) {
                this.showConfirmModal(result.data);
                return;
            }

            // 处理需要输入数量的情况
            if (result && result.needInput) {
                wx.showModal({
                    title: '请输入数量',
                    content: '无法自动获取订单数量，请输入本次完成数量',
                    editable: true,
                    placeholderText: '例如: 100',
                    success: (res) => {
                        if (res.confirm && res.content) {
                            // 更新数量并重新提交
                            this.setData({ quantity: res.content });
                            this.processScanCode(codeStr, scanType);
                        }
                    }
                });
                return;
            }

            // 成功后标记去重 (2秒内不再处理相同码)
            // 只有成功才标记，避免失败重试也被拦截
            if (result && result.success) {
                markRecent(codeStr, 2000);
            }

        } catch (e) {
            wx.showToast({
                title: e.message || '系统异常',
                icon: 'none'
            });
            errorHandler.handle(e);
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 显示确认弹窗
     */
    showConfirmModal(data) {
        // ✅ 使用SKUProcessor统一标准化SKU列表
        const skuList = data.skuItems ? SKUProcessor.normalizeOrderItems(
            data.skuItems,
            data.orderNo,
            data.styleNo
        ) : [];

        // ✅ 构建表单项
        const formItems = SKUProcessor.buildSKUInputList(skuList);
        
        // ✅ 计算统计摘要
        const summary = SKUProcessor.getSummary(skuList);

        // 构造 Cutting 任务 (如果是裁剪工序)
        let cuttingTasks = [];
        if (data.progressStage === '裁剪' && data.skuItems) {
            cuttingTasks = data.skuItems.map(item => ({
                color: item.color,
                size: item.size,
                plannedQuantity: item.quantity || item.num || 0,
                cuttingInput: item.quantity || item.num || 0
            }));
        }

        this.setData({
            scanConfirm: {
                visible: true,
                loading: false,
                remain: 30, // 30秒后自动关闭? (目前暂未实现倒计时逻辑)
                detail: {
                    ...data,
                    isProcurement: this.data.scanTypeOptions[this.data.scanTypeIndex].value === 'procurement' || data.progressStage === '采购'
                },
                skuList: formItems,
                summary: summary, // ✅ 新增: 显示统计摘要
                cuttingTasks: cuttingTasks,
                materialPurchases: [] // 采购逻辑暂未集成到此处，通常由 Handler 返回
            }
        });
    },

    /**
     * 弹窗输入变更 (通用SKU)
     */
    onModalSkuInput(e) {
        const idx = e.currentTarget.dataset.idx;
        const val = e.detail.value;
        const key = `scanConfirm.skuList[${idx}].inputQuantity`;
        this.setData({ [key]: val });
    },

    /**
     * 弹窗输入变更 (裁剪)
     */
    onModalCuttingInput(e) {
        const idx = e.currentTarget.dataset.idx;
        const val = e.detail.value;
        const key = `scanConfirm.cuttingTasks[${idx}].cuttingInput`;
        this.setData({ [key]: val });
    },

    /**
     * 取消扫码
     */
    onCancelScan() {
        this.setData({ 'scanConfirm.visible': false });
    },

    /**
     * 确认提交
     */
    async onConfirmScan() {
        if (this.data.scanConfirm.loading) return;
        this.setData({ 'scanConfirm.loading': true });

        try {
            const detail = this.data.scanConfirm.detail;
            const skuList = this.data.scanConfirm.skuList;
            const cuttingTasks = this.data.scanConfirm.cuttingTasks;

            // 1. 裁剪特殊处理
            if (detail.progressStage === '裁剪' && cuttingTasks.length > 0) {
                // 调用裁剪相关接口 (这里简化为批量执行 executeScan，实际可能需要生成菲号)
                // 注意：裁剪通常需要生成菲号，这里如果是“确认提交”，假设是完成裁剪
                // 如果是“生成菲号”，有单独的按钮 onRegenerateCuttingBundles
                // 这里我们暂且按普通工序提交
            }

            // 2. ✅ 通用批量提交 (使用SKUProcessor验证)
            if (skuList && skuList.length > 0) {
                // ✅ 批量验证 (最重要的改动)
                const validation = SKUProcessor.validateSKUInputBatch(skuList);
                if (!validation.valid) {
                    wx.showToast({
                        title: validation.errors[0],
                        icon: 'none'
                    });
                    return;
                }

                // ✅ 生成扫码请求
                const requests = SKUProcessor.generateScanRequests(
                    validation.validList,
                    detail.orderNo,
                    detail.styleNo,
                    detail.progressStage
                );

                // ✅ 批量提交
                const tasks = requests.map(req =>
                    api.production.executeScan({
                        ...req,
                        scanType: this.mapScanType(detail.progressStage)
                    })
                );

                if (tasks.length === 0) {
                    throw new Error('请至少输入一个数量');
                }

                await Promise.all(tasks);

                wx.showToast({ title: '批量提交成功', icon: 'success' });
                this.handleScanSuccess({
                    success: true,
                    message: `成功提交 ${tasks.length} 条记录`,
                    orderNo: detail.orderNo,
                    processName: detail.progressStage
                });
            } else {
                // 兜底：如果没有 SKU List，可能是普通扫码
                // 重新调用 submitScan? 但我们没有 ScanHandler 实例的上下文
                // 这里应该不会走到，因为 showConfirmModal 只有在有 skuItems 时才调用
                throw new Error('无效的提交数据');
            }
        } catch (e) {
            wx.showToast({ title: e.message || '提交失败', icon: 'none' });
        } finally {
            this.setData({
                'scanConfirm.loading': false,
                'scanConfirm.visible': false
            });
        }
    },

    /**
     * 映射工序名称到 API scanType
     */
    mapScanType(stageName) {
        const map = {
            '采购': 'procurement',
            '裁剪': 'cutting',
            '车缝': 'production',
            '大烫': 'ironing', // 假设
            '质检': 'quality',
            '包装': 'packing', // 假设
            '入库': 'warehouse'
        };
        // 如果当前选择了特定类型，优先使用
        const currentType = this.data.scanTypeOptions[this.data.scanTypeIndex].value;
        if (currentType !== 'auto') return currentType;

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
            statusClass: 'success'
        };

        this.setData({
            lastResult: formattedResult,
            quantity: '' // 清空手动输入的数量
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
            statusClass: 'error'
        };

        this.setData({
            lastResult: errorResult
        });

        // 错误提示已在 Handler 或 processScanCode 中通过 Toast 显示，这里主要更新 UI 状态
    },

    // ==================== 撤销功能 ====================

    /**
     * 启动撤销倒计时
     */
    startUndoTimer(record) {
        // 清除旧定时器
        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }

        this.setData({
            undoVisible: true,
            undoCountdown: 10, // 10秒撤销时间
            undoRecord: record
        });

        undoTimer = setInterval(() => {
            const next = this.data.undoCountdown - 1;
            if (next <= 0) {
                this.stopUndoTimer();
            } else {
                this.setData({ undoCountdown: next });
            }
        }, 1000);
    },

    /**
     * 停止撤销倒计时
     */
    stopUndoTimer() {
        if (undoTimer) {
            clearInterval(undoTimer);
            undoTimer = null;
        }
        this.setData({
            undoVisible: false,
            undoCountdown: 0,
            undoRecord: null
        });
    },

    /**
     * 执行撤销
     */
    async handleUndo() {
        const record = this.data.undoRecord;
        // 兼容 recordId 在 data 对象中的情况
        const recordId = record?.recordId || record?.data?.recordId || record?.data?.id;

        if (!record || !recordId) return;

        this.stopUndoTimer(); // 立即停止计时

        wx.showLoading({ title: '正在撤销...' });

        try {
            // 调用删除接口
            await api.production.executeScan({
                action: 'delete',
                recordId: recordId
            });

            wx.showToast({ title: '已撤销', icon: 'success' });

            // 更新 UI
            this.setData({
                lastResult: {
                    ...this.data.lastResult,
                    statusText: '已撤销',
                    statusClass: 'warning'
                }
            });

            // 刷新统计
            this.loadMyPanel(true);

            // 触发全局事件
            if (eventBus && typeof eventBus.emit === 'function') {
                eventBus.emit('DATA_REFRESH');
            }

        } catch (e) {
            wx.showToast({ title: '撤销失败: ' + (e.message || '未知错误'), icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    // ==================== 历史记录 (本地) ====================

    loadLocalHistory() {
        const history = getStorageValue('scan_history_v2') || [];
        this.setData({ scanHistory: history });
    },

    addToLocalHistory(record) {
        const history = [record, ...this.data.scanHistory].slice(0, 20); // 保留最近20条
        this.setData({ scanHistory: history });
        setStorageValue('scan_history_v2', history);
    },

    // 兼容 WXML 点击事件
    onTapHistoryItem(e) {
        const index = e.currentTarget.dataset.index;
        const item = this.data.scanHistory[index];
        if (item) {
            // 可以显示详情
        }
    }
});
