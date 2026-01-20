const api = require('../../utils/api');
const { getBaseUrl } = require('../../config');
const { getToken } = require('../../utils/storage');
const { errorHandler } = require('../../utils/errorHandler');
const { validateScanRecord } = require('../../utils/dataValidator');

let undoTimer = null;
let confirmTimer = null;
let confirmTickTimer = null;

const recentScanExpires = new Map();

// ==================== 验证函数 ====================

/**
 * 验证二维码格式
 */
function validateQrCode(qrCode) {
    const v = String(qrCode || '').trim();
    if (!v) return '二维码不能为空';
    if (v.length < 5) return '二维码格式不正确（长度过短）';
    if (v.length > 500) return '二维码格式不正确（长度过长）';
    return '';
}

/**
 * 验证扫码数量
 */
function validateQuantity(qty) {
    if (qty === null || qty === undefined || qty === '') return '数量不能为空';
    const v = Number(qty);
    if (!Number.isInteger(v) || v <= 0) return '数量必须是正整数';
    if (v > 999999) return '数量不能超过 999999';
    return '';
}

/**
 * 验证订单号
 */
function validateOrderNo(orderNo) {
    const v = String(orderNo || '').trim();
    if (!v) return '订单号不能为空';
    if (v.length < 3) return '订单号长度过短';
    if (v.length > 50) return '订单号长度过长';
    return '';
}

/**
 * 验证款号
 */
function validateStyleNo(styleNo) {
    const v = String(styleNo || '').trim();
    if (!v) return '款号不能为空';
    if (v.length < 3) return '款号长度过短';
    if (v.length > 50) return '款号长度过长';
    return '';
}

/**
 * 防重复扫码检查
 */
function isDuplicateScan(qrCode, timeWindow = 2000) {
    return isRecentDuplicate(qrCode);
}

/**
 * 安全的数量转换
 */
function toQuantity(v) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? Math.floor(Math.min(n, 999999)) : null;
}

function readStorage(key, fallback) {
    try {
        const v = wx.getStorageSync(key);
        return v == null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        wx.setStorageSync(key, value);
    } catch (e) {
        null;
    }
}

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

function parseQuantityFromText(text) {
    const s = (text || '').toString().trim();
    if (!s) return null;

    const patterns = [
        /(?:qty|quantity|数量|件数|num|count)\s*[:=：]\s*(\d{1,6})/i,
        /[*xX×](\d{1,6})\s*$/,
        /(\d{1,6})\s*(?:pcs|件)\s*$/i,
    ];
    for (const p of patterns) {
        const m = s.match(p);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return null;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function tryParseQueryParams(text) {
    const raw = (text || '').toString();
    const qIndex = raw.indexOf('?');
    if (qIndex < 0) return null;
    const query = raw.slice(qIndex + 1);
    const out = {};
    for (const part of query.split('&')) {
        if (!part) continue;
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        const k = decodeURIComponent(part.slice(0, idx));
        const v = decodeURIComponent(part.slice(idx + 1));
        if (!k) continue;
        out[k] = v;
    }
    return out;
}

function parseFeiNo(text) {
    const raw = (text || '').toString().trim();
    if (!raw) return null;

    const normalized = raw.replace(/[\u2013\u2014]/g, '-');
    const parts = normalized
        .split('-')
        .map((p) => (p == null ? '' : String(p)).trim())
        .filter((p) => p);
    if (parts.length < 3) return null;

    const findIdx = (prefix) => {
        const p = String(prefix || '').toUpperCase();
        if (!p) return -1;
        for (let i = 0; i < parts.length; i += 1) {
            const v = parts[i];
            if (!v) continue;
            if (String(v).toUpperCase().startsWith(p)) return i;
        }
        return -1;
    };

    const stIdx = findIdx('ST');
    const poIdx = findIdx('PO');

    const parsePositiveInt = (v) => {
        const s = (v == null ? '' : String(v)).trim();
        if (!/^\d{1,9}$/.test(s)) return null;
        const n = Number(s);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.floor(n);
    };

    const fallBackByPosition = () => {
        if (parts.length < 6) return null;
        const orderNo = (parts[0] || '').trim();
        const styleNo = (parts[1] || '').trim();
        if (!orderNo || !styleNo) return null;
        const color = (parts[2] || '').trim();
        const size = (parts[3] || '').trim();
        const quantity = parsePositiveInt(parts[4]);
        const bundleNo = parsePositiveInt(parts[5]);
        return {
            orderNo,
            styleNo,
            color,
            size,
            quantity,
            bundleNo,
        };
    };

    if (stIdx < 0) {
        return fallBackByPosition();
    }

    const orderNo = (poIdx >= 0 ? parts[poIdx] : parts[stIdx - 1]) || '';
    const styleNo = parts[stIdx] || '';
    const tail = parts.slice(stIdx + 1);

    let color = '';
    let size = '';
    let quantity = null;
    let bundleNo = null;

    if (tail.length >= 3) {
        const last = parsePositiveInt(tail[tail.length - 1]);
        const secondLast = parsePositiveInt(tail[tail.length - 2]);
        if (last != null && secondLast != null) {
            bundleNo = last;
            quantity = secondLast;
            size = tail[tail.length - 3] || '';
            color = tail.slice(0, -3).join('-');
        } else if (last != null) {
            quantity = last;
            size = tail[tail.length - 2] || '';
            color = tail.slice(0, -2).join('-');
        }
    }

    if (!color && tail.length) {
        color = tail[0] || '';
    }

    const result = {
        orderNo: orderNo.trim(),
        styleNo: styleNo.trim(),
        color: color.trim(),
        size: (size || '').trim(),
        quantity,
        bundleNo,
    };
    if (!result.orderNo || !result.styleNo) return null;
    return result;
}

function parseScanContent(rawScanCode) {
    const raw = (rawScanCode || '').toString().trim();
    if (!raw) return { scanCode: '', quantity: null };

    const first = raw[0];
    if (first === '{' || first === '[') {
        const obj = safeJsonParse(raw);
        if (obj && typeof obj === 'object') {
            const code = obj.scanCode || obj.code || obj.qr || obj.value || obj.data;
            const qty = obj.quantity || obj.qty || obj.num || obj.count;
            const orderNo = obj.orderNo || obj.po || obj.order || obj.productionOrderNo;
            const styleNo = obj.styleNo || obj.st || obj.style || obj.styleNumber;
            const color = obj.color;
            const size = obj.size;
            const bundleNo = obj.bundleNo || obj.cuttingBundleNo || obj.bundle;
            const qn = Number(qty);
            const meta = parseFeiNo(code);
            return {
                scanCode: code != null && String(code).trim() ? String(code).trim() : raw,
                quantity: Number.isFinite(qn) && qn > 0 ? Math.floor(qn) : (meta && meta.quantity != null ? meta.quantity : parseQuantityFromText(raw)),
                orderNo: orderNo != null && String(orderNo).trim() ? String(orderNo).trim() : (meta ? meta.orderNo : ''),
                styleNo: styleNo != null && String(styleNo).trim() ? String(styleNo).trim() : (meta ? meta.styleNo : ''),
                color: color != null && String(color).trim() ? String(color).trim() : (meta ? meta.color : ''),
                size: size != null && String(size).trim() ? String(size).trim() : (meta ? meta.size : ''),
                bundleNo: bundleNo != null && String(bundleNo).trim() ? String(bundleNo).trim() : (meta && meta.bundleNo != null ? String(meta.bundleNo) : ''),
            };
        }
    }

    const params = tryParseQueryParams(raw);
    if (params) {
        const code = params.scanCode || params.code || params.qr || params.value;
        const qty = params.quantity || params.qty || params.num || params.count;
        const orderNo = params.orderNo || params.po || params.order;
        const styleNo = params.styleNo || params.st || params.style;
        const color = params.color;
        const size = params.size;
        const bundleNo = params.bundleNo || params.cuttingBundleNo || params.bundle;
        const qn = Number(qty);
        const meta = parseFeiNo(code);
        return {
            scanCode: code != null && String(code).trim() ? String(code).trim() : raw,
            quantity: Number.isFinite(qn) && qn > 0 ? Math.floor(qn) : (meta && meta.quantity != null ? meta.quantity : parseQuantityFromText(raw)),
            orderNo: orderNo != null && String(orderNo).trim() ? String(orderNo).trim() : (meta ? meta.orderNo : ''),
            styleNo: styleNo != null && String(styleNo).trim() ? String(styleNo).trim() : (meta ? meta.styleNo : ''),
            color: color != null && String(color).trim() ? String(color).trim() : (meta ? meta.color : ''),
            size: size != null && String(size).trim() ? String(size).trim() : (meta ? meta.size : ''),
            bundleNo: bundleNo != null && String(bundleNo).trim() ? String(bundleNo).trim() : (meta && meta.bundleNo != null ? String(meta.bundleNo) : ''),
        };
    }

    const meta = parseFeiNo(raw);
    return {
        scanCode: raw,
        quantity: meta && meta.quantity != null ? meta.quantity : parseQuantityFromText(raw),
        orderNo: meta ? meta.orderNo : '',
        styleNo: meta ? meta.styleNo : '',
        color: meta ? meta.color : '',
        size: meta ? meta.size : '',
        bundleNo: meta && meta.bundleNo != null ? String(meta.bundleNo) : '',
    };
}

function generateRequestId() {
    const t = Date.now();
    const r = Math.random().toString(16).slice(2, 10);
    return `MP${t}${r}`;
}

function scanCodeErrorText(err) {
    if (err && err.type === 'biz') {
        const m = err.errMsg ? String(err.errMsg).trim() : '';
        if (m) return m;
    }
    const raw = (err && err.errMsg) ? String(err.errMsg).trim() : '';
    const s = raw.toLowerCase();
    if (!s) return '扫码或网络异常';
    if (s.includes('cancel')) return '已取消扫码';
    if (s.includes('permission') || s.includes('authorize') || s.includes('auth') || s.includes('denied')) {
        return '相机权限未开启';
    }
    if (s.includes('fail')) return '扫码失败，请重试';
    return '扫码失败，请重试';
}

Page({
    data: {
        loading: false,
        scanTypeOptions: [
            { label: '裁剪', value: 'cutting', progressStage: '裁剪', processName: '裁剪', processCode: '' },
            { label: '缝制(计件)', value: 'sewing', progressStage: '缝制', processName: '缝制', processCode: '' },
            { label: '车缝', value: 'production', progressStage: '车缝', processName: '车缝', processCode: '' },
            { label: '大烫', value: 'production', progressStage: '大烫', processName: '大烫', processCode: '' },
            { label: '质检', value: 'quality', progressStage: '质检', processName: '质检', processCode: '' },
            { label: '包装', value: 'production', progressStage: '包装', processName: '包装', processCode: '' },
            { label: '入库', value: 'warehouse', processCode: '' },
        ],
        scanTypeIndex: 0,
        quantity: '',
        qtyHint: '数量需填写；二维码带数量会自动识别，可手动修改。',
        warehouse: '',
        qualityOptions: [
            { label: '合格', value: 'qualified' },
            { label: '次品待返修', value: 'unqualified' },
            { label: '返修完成', value: 'repaired' },
        ],
        qualityIndex: 0,
        defectCategoryOptions: [
            { label: '外观完整性问题', value: 'appearance_integrity' },
            { label: '尺寸精度问题', value: 'size_accuracy' },
            { label: '工艺规范性问题', value: 'process_compliance' },
            { label: '功能有效性问题', value: 'functional_effectiveness' },
            { label: '其他问题', value: 'other' },
        ],
        defectCategoryIndex: 0,
        defectRemarkOptions: [
            { label: '返修', value: '返修' },
            { label: '报废', value: '报废' },
        ],
        defectRemarkIndex: 0,
        defectImageUrls: [],
        defectImageFullUrls: [],
        defectUploading: false,
        lastResult: null,
        undo: {
            canUndo: false,
            loading: false,
            expireAt: 0,
            payload: null,
        },
        my: {
            loadingStats: false,
            loadingHistory: false,
            stats: null,
            history: { page: 1, pageSize: 10, hasMore: true, list: [] },
        },
        materialPurchases: [],
        currentUser: null,
        scanConfirm: {
            visible: false,
            expireAt: 0,
            remain: 0,
            payload: null,
            detail: null,
            loading: false,
        },
    },

    onShow() {
        const app = getApp();
        if (app && typeof app.setTabSelected === 'function') app.setTabSelected(this, 2);
        if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
        const savedTypeIndex = Number(readStorage('mp_scan_type_index', 0));
        const len = Array.isArray(this.data.scanTypeOptions) ? this.data.scanTypeOptions.length : 0;
        const rawIdx = Number.isFinite(savedTypeIndex) && savedTypeIndex >= 0 ? savedTypeIndex : 0;
        const idx = len > 0 ? Math.min(Math.max(0, rawIdx), len - 1) : 0;
        const scanType = (this.data.scanTypeOptions[idx] && this.data.scanTypeOptions[idx].value) ? this.data.scanTypeOptions[idx].value : '';
        const savedWarehouse = readStorage('mp_scan_warehouse', '');
        this.setData({
            scanTypeIndex: idx,
            qualityIndex: scanType === 'quality' ? 1 : this.data.qualityIndex,
            warehouse: savedWarehouse != null ? String(savedWarehouse) : '',
            qtyHint: '数量需填写；二维码带数量会自动识别，可手动修改。',
        });
        this.loadMyPanel(true);
    },

    onHide() {
        if (undoTimer) {
            clearTimeout(undoTimer);
            undoTimer = null;
        }
        this.setData({ undo: { ...this.data.undo, canUndo: false, loading: false, expireAt: 0, payload: null } });
        if (confirmTimer) {
            clearTimeout(confirmTimer);
            confirmTimer = null;
        }
        if (confirmTickTimer) {
            clearInterval(confirmTickTimer);
            confirmTickTimer = null;
        }
        this.setData({ scanConfirm: { ...this.data.scanConfirm, visible: false, expireAt: 0, remain: 0, payload: null, detail: null, loading: false } });
    },

    onUnload() {
        if (undoTimer) {
            clearTimeout(undoTimer);
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

    openScanConfirm(payload, detail) {
        if (!payload) return;
        if (confirmTimer) {
            clearTimeout(confirmTimer);
            confirmTimer = null;
        }
        if (confirmTickTimer) {
            clearInterval(confirmTickTimer);
            confirmTickTimer = null;
        }
        const expireAt = Date.now() + 15000;
        this.setData({
            scanConfirm: {
                visible: true,
                expireAt,
                remain: 15,
                payload,
                detail: detail || null,
                loading: false,
            },
        });
        confirmTimer = setTimeout(() => {
            confirmTimer = null;
            this.closeScanConfirm(true);
        }, 15000);
        confirmTickTimer = setInterval(() => {
            const now = Date.now();
            const remain = Math.max(0, Math.ceil((expireAt - now) / 1000));
            if (!this.data.scanConfirm || !this.data.scanConfirm.visible) {
                clearInterval(confirmTickTimer);
                confirmTickTimer = null;
                return;
            }
            if (remain <= 0) {
                clearInterval(confirmTickTimer);
                confirmTickTimer = null;
                return;
            }
            if (this.data.scanConfirm.remain !== remain) {
                this.setData({ scanConfirm: { ...this.data.scanConfirm, remain } });
            }
        }, 500);
    },

    closeScanConfirm(silent) {
        if (confirmTimer) {
            clearTimeout(confirmTimer);
            confirmTimer = null;
        }
        if (confirmTickTimer) {
            clearInterval(confirmTickTimer);
            confirmTickTimer = null;
        }
        this.setData({ scanConfirm: { ...this.data.scanConfirm, visible: false, expireAt: 0, remain: 0, payload: null, detail: null, loading: false } });
        if (!silent) {
            wx.showToast({ title: '已取消', icon: 'none' });
        }
    },

    onConfirmScan() {
        const confirm = this.data.scanConfirm;
        if (!confirm || !confirm.visible || confirm.loading || !confirm.payload) return;
        if (confirmTimer) {
            clearTimeout(confirmTimer);
            confirmTimer = null;
        }
        if (confirmTickTimer) {
            clearInterval(confirmTickTimer);
            confirmTickTimer = null;
        }
        this.setData({ scanConfirm: { ...confirm, loading: true } });
        this.submitScanPayload(confirm.payload, confirm.detail);
    },

    onCancelScan() {
        this.closeScanConfirm(false);
    },

    async submitScanPayload(basePayload, detail) {
        const payload = { ...(basePayload || {}) };
        const dedupKey = [
            payload.scanCode,
            payload.scanType,
            payload.progressStage || '',
            payload.processCode || '',
            payload.warehouse || '',
            payload.remark || '',
            String(payload.quantity || ''),
        ].join('|');
        payload.dedupKey = dedupKey;
        payload.clientTime = Date.now();
        if (isRecentDuplicate(dedupKey)) {
            this.closeScanConfirm(true);
            wx.showToast({ title: '已处理', icon: 'none' });
            this.setData({
                lastResult: {
                    success: false,
                    message: '已处理',
                    scanCode: payload.scanCode || '',
                    orderNo: (detail && detail.orderNo) || '',
                    styleNo: (detail && detail.styleNo) || '',
                    processName: (detail && detail.processName) || '',
                    color: (detail && detail.color) || payload.color || '',
                    size: (detail && detail.size) || payload.size || '',
                    unitPrice: payload.unitPrice,
                },
            });
            return;
        }

        let lastDedupKey = dedupKey;
        markRecent(dedupKey, 2500);
        try {
            const data = (await api.production.executeScan(payload)) || {};
            const sr = data.scanRecord || {};
            const oi = data.orderInfo || {};
            const rawMsg = String(data.message || '成功');
            const msg = rawMsg.trim();
            const exceed = msg.includes('裁剪') && msg.includes('超出');
            if (exceed) {
                this.closeScanConfirm(true);
                wx.showToast({ title: '数量超出无法入库', icon: 'none' });
                unmarkRecent(dedupKey);
                return;
            }
            const isDuplicate = msg.includes('忽略') || msg.includes('无需重复') || msg.includes('已扫码') || msg.includes('重复');
            const displayMsg = isDuplicate ? '已处理' : (msg || '成功');
            const isProcurement = detail && detail.isProcurement;
            if (isProcurement) {
                const raw = Array.isArray(data.materialPurchases) ? data.materialPurchases : [];
                const received = await this.receivePurchases(raw);
                let merged = raw;
                if (received.length) {
                    const byId = new Map(received.map((it) => [String(it.id || ''), it]));
                    merged = raw.map((it) => {
                        const id = it && it.id != null ? String(it.id) : '';
                        return id && byId.has(id) ? { ...it, ...byId.get(id) } : it;
                    });
                }
                const purchases = this.buildMaterialPurchases(merged);
                this.setData({ materialPurchases: purchases });
            }
            this.setData({
                lastResult: {
                    success: data && data.success === false ? false : true,
                    message: displayMsg,
                    scanCode: payload.scanCode,
                    orderNo: oi.orderNo || sr.orderNo || (detail && detail.orderNo) || '',
                    styleNo: oi.styleNo || sr.styleNo || (detail && detail.styleNo) || '',
                    processName: sr.processName || (detail && detail.processName) || '',
                    color: sr.color || payload.color || (detail && detail.color) || '',
                    size: sr.size || payload.size || (detail && detail.size) || '',
                    unitPrice: sr.unitPrice != null ? sr.unitPrice : payload.unitPrice,
                },
            });
            wx.vibrateShort({ type: 'light' });
            if (data && data.success === false) {
                unmarkRecent(dedupKey);
            } else {
                markRecent(dedupKey, 8000);
                const expireAt = Date.now() + 15000;
                this.setData({ undo: { ...this.data.undo, canUndo: true, loading: false, expireAt, payload } });
                undoTimer = setTimeout(() => {
                    undoTimer = null;
                    this.setData({ undo: { ...this.data.undo, canUndo: false, loading: false, expireAt: 0, payload: null } });
                }, 15000);
            }
            this.closeScanConfirm(true);
            return;
        } catch (e) {
            if (lastDedupKey) unmarkRecent(lastDedupKey);
            const errMsg = e && (e.errMsg || e.message) ? String(e.errMsg || e.message).trim() : '';
            const lower = errMsg.toLowerCase();
            if (e && e.type === 'network') {
                wx.showToast({ title: '连接失败', icon: 'none' });
            } else if (e && e.type === 'biz') {
                const exceed = errMsg.includes('裁剪') && errMsg.includes('超出');
                if (exceed) {
                    wx.showToast({ title: '数量超出无法入库', icon: 'none' });
                } else if (errMsg.includes('忽略') || errMsg.includes('无需重复') || errMsg.includes('已扫码') || errMsg.includes('重复')) {
                    wx.showToast({ title: '已处理', icon: 'none' });
                } else if (errMsg) {
                    wx.showToast({ title: errMsg, icon: 'none' });
                } else {
                    console.error('scan_execute_failed', e);
                    wx.showToast({ title: '系统繁忙', icon: 'none' });
                }
            } else if (lower.includes('network')) {
                wx.showToast({ title: '连接失败', icon: 'none' });
            } else {
                console.error('scan_execute_failed', e);
                wx.showToast({ title: '系统繁忙', icon: 'none' });
            }
        } finally {
            this.setData({ scanConfirm: { ...this.data.scanConfirm, loading: false } });
            this.closeScanConfirm(true);
        }
    },

    onScanTypeChange(e) {
        const idx = Number((e && e.detail && e.detail.value) || 0);
        const scanType = (this.data.scanTypeOptions[idx] && this.data.scanTypeOptions[idx].value) ? this.data.scanTypeOptions[idx].value : '';
        this.setData({
            scanTypeIndex: idx,
            qualityIndex: scanType === 'quality' ? 1 : this.data.qualityIndex,
            lastResult: null,
            qtyHint: '数量需填写；二维码带数量会自动识别，可手动修改。',
            materialPurchases: [],
        });
        writeStorage('mp_scan_type_index', idx);
        this.loadMyPanel(true);
    },

    currentScanType() {
        const option = this.data.scanTypeOptions[this.data.scanTypeIndex];
        return option && option.value ? option.value : '';
    },

    async loadMyPanel(resetHistory) {
        const scanType = this.currentScanType();
        await Promise.all([this.loadMyStats(scanType), this.loadMyHistory(resetHistory === true, scanType)]);
    },

    async loadMyStats(scanType) {
        if (this.data.my.loadingStats) return;
        this.setData({ 'my.loadingStats': true });
        try {
            const params = scanType ? { scanType } : {};
            const stats = await api.production.personalScanStats(params);
            this.setData({ 'my.stats': stats || null });
        } catch (e) {
            if (e && e.type === 'auth') return;
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '加载失败');
        } finally {
            this.setData({ 'my.loadingStats': false });
        }
    },

    async loadMyHistory(reset, scanType) {
        const my = {
            loadingHistory: false,
            history: { page: 1, pageSize: 10, hasMore: true, list: [] },
            ...(this.data.my || {}),
        };
        const history = my.history || { page: 1, pageSize: 10, hasMore: true, list: [] };
        if (my.loadingHistory) return;
        if (!reset && history.hasMore === false) return;

        const nextPage = reset ? 1 : (Number(history.page) || 1) + 1;
        const pageSize = Number(history.pageSize) || 10;
        this.setData({ 'my.loadingHistory': true });
        try {
            const params = { page: nextPage, pageSize };
            if (scanType) params.scanType = scanType;
            const page = await api.production.myScanHistory(params);
            const records = page && Array.isArray(page.records) ? page.records : [];
            const prev = Array.isArray(history.list) ? history.list : [];
            const merged = reset ? records : prev.concat(records);
            const app = getApp();
            const hasMore = app && typeof app.hasMoreByPage === 'function' ? app.hasMoreByPage(page) : true;
            this.setData({
                'my.history': {
                    ...history,
                    page: nextPage,
                    pageSize,
                    list: merged,
                    hasMore,
                },
            });
        } catch (e) {
            if (e && e.type === 'auth') return;
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '加载失败');
        } finally {
            this.setData({ 'my.loadingHistory': false });
        }
    },

    refreshMy() {
        this.loadMyPanel(true);
    },

    loadMoreMyHistory() {
        this.loadMyHistory(false, this.currentScanType());
    },

    onQuantityInput(e) {
        const raw = e && e.detail ? e.detail.value : '';
        if (raw === '' || raw == null) {
            this.setData({ quantity: '' });
            return;
        }
        const v = Number(raw);
        const q = Number.isFinite(v) && v > 0 ? Math.floor(v) : '';
        this.setData({ quantity: q === '' ? '' : String(q) });
    },

    onWarehouseInput(e) {
        const v = (e && e.detail && e.detail.value) || '';
        this.setData({ warehouse: v });
        writeStorage('mp_scan_warehouse', v);
    },

    onQualityChange(e) {
        const idx = Number((e && e.detail && e.detail.value) || 0);
        const next = this.data.qualityOptions[idx] ? this.data.qualityOptions[idx].value : '';
        const patch = { qualityIndex: idx };
        if (next !== 'unqualified') {
            patch.defectRemarkIndex = 0;
            patch.defectImageUrls = [];
            patch.defectImageFullUrls = [];
            patch.defectUploading = false;
        }
        this.setData(patch);
    },

    onDefectCategoryChange(e) {
        const idx = Number((e && e.detail && e.detail.value) || 0);
        const len = Array.isArray(this.data.defectCategoryOptions) ? this.data.defectCategoryOptions.length : 0;
        const safe = len > 0 ? Math.min(Math.max(0, idx), len - 1) : 0;
        this.setData({ defectCategoryIndex: safe });
    },

    onDefectRemarkChange(e) {
        const idx = Number((e && e.detail && e.detail.value) || 0);
        const len = Array.isArray(this.data.defectRemarkOptions) ? this.data.defectRemarkOptions.length : 0;
        const safe = len > 0 ? Math.min(Math.max(0, idx), len - 1) : 0;
        this.setData({ defectRemarkIndex: safe });
    },

    async getCurrentUser() {
        const cached = this.data.currentUser;
        if (cached && cached.id) return cached;
        try {
            const user = await api.system.getMe();
            this.setData({ currentUser: user || null });
            return user || null;
        } catch (e) {
            return null;
        }
    },

    async receivePurchases(list) {
        const items = Array.isArray(list) ? list : [];
        if (items.length === 0) return [];
        const pending = items.filter((it) => {
            const status = it && it.status != null ? String(it.status).trim() : '';
            return !status || status === 'pending';
        });
        if (pending.length === 0) return [];
        const user = await this.getCurrentUser();
        const receiverId = user && user.id != null ? String(user.id).trim() : '';
        const receiverName = user && (user.name || user.username) ? String(user.name || user.username).trim() : '';
        const results = await Promise.allSettled(pending.map((it) => api.production.receivePurchase({
            purchaseId: it.id,
            receiverId,
            receiverName,
        })));
        const updated = [];
        const errors = [];
        results.forEach((r) => {
            if (r.status === 'fulfilled') {
                if (r.value) updated.push(r.value);
            } else {
                // 提取错误信息
                const err = r.reason;
                const msg = err && err.errMsg ? String(err.errMsg) : '领取失败';
                if (msg && !errors.includes(msg)) {
                    errors.push(msg);
                }
            }
        });
        if (errors.length > 0) {
            // 显示第一个错误的详细信息（例如"该任务已被「XXX」领取"）
            wx.showToast({ title: errors[0], icon: 'none', duration: 3000 });
        } else if (updated.length > 0) {
            wx.showToast({ title: '采购已领取', icon: 'none' });
        }
        return updated;
    },

    buildMaterialPurchases(list) {
        const items = Array.isArray(list) ? list : [];
        return items.map((it) => {
            const purchaseQuantity = Number(it && it.purchaseQuantity) || 0;
            const arrivedQuantity = Number(it && it.arrivedQuantity) || 0;
            const rawDemand = it && it.demandQuantity != null ? it.demandQuantity : it && it.purchaseQuantity;
            const demandQuantity = Number(rawDemand) || 0;
            return {
                ...it,
                demandQuantity,
                purchaseQuantity,
                arrivedQuantity,
                arrivedInput: arrivedQuantity > 0 ? arrivedQuantity : 0,
                remarkInput: '',
            };
        });
    },

    onPurchaseArrivedInput(e) {
        const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || 0);
        const v = Number((e && e.detail && e.detail.value) || 0);
        const q = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
        this.setData({ [`materialPurchases[${idx}].arrivedInput`]: q });
    },

    onPurchaseRemarkInput(e) {
        const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || 0);
        const v = (e && e.detail && e.detail.value) || '';
        this.setData({ [`materialPurchases[${idx}].remarkInput`]: v });
    },

    async onReceivePurchase(e) {
        const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || 0);
        const list = Array.isArray(this.data.materialPurchases) ? this.data.materialPurchases : [];
        const item = list[idx];
        if (!item || !item.id) {
            wx.showToast({ title: '未找到采购任务', icon: 'none' });
            return;
        }
        const status = item && item.status != null ? String(item.status).trim() : '';
        if (status === 'completed' || status === 'cancelled') {
            wx.showToast({ title: '该采购任务不可领取', icon: 'none' });
            return;
        }
        try {
            const user = await this.getCurrentUser();
            const receiverId = user && user.id != null ? String(user.id).trim() : '';
            const receiverName = user && (user.name || user.username) ? String(user.name || user.username).trim() : '';
            const updated = await api.production.receivePurchase({
                purchaseId: item.id,
                receiverId,
                receiverName,
            });
            if (updated) {
                this.setData({ [`materialPurchases[${idx}]`]: { ...item, ...updated } });
            }
            wx.showToast({ title: '已领取', icon: 'none' });
        } catch (e) {
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '领取失败');
            else wx.showToast({ title: '领取失败', icon: 'none' });
        }
    },

    async onConfirmPurchaseArrived(e) {
        const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || 0);
        const list = Array.isArray(this.data.materialPurchases) ? this.data.materialPurchases : [];
        const item = list[idx];
        if (!item || !item.id) {
            wx.showToast({ title: '未找到采购任务', icon: 'none' });
            return;
        }
        const arrivedInput = Number(item.arrivedInput);
        if (!Number.isFinite(arrivedInput) || arrivedInput < 0) {
            wx.showToast({ title: '请输入正确米数', icon: 'none' });
            return;
        }
        const purchaseQuantity = Number(item.purchaseQuantity) || 0;
        const remark = (item.remarkInput || '').trim();
        if (purchaseQuantity > 0 && arrivedInput < purchaseQuantity * 0.7 && !remark) {
            wx.showToast({ title: '到货不足70%，请填写备注', icon: 'none' });
            return;
        }
        try {
            await api.production.updateArrivedQuantity({ id: item.id, arrivedQuantity: arrivedInput, remark });
            this.setData({
                [`materialPurchases[${idx}].arrivedQuantity`]: arrivedInput,
                [`materialPurchases[${idx}].remark`]: remark,
            });
            wx.showToast({ title: '已确认到货', icon: 'none' });
        } catch (e) {
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '确认失败');
            else wx.showToast({ title: '确认失败', icon: 'none' });
        }
    },

    async onAddDefectPhoto() {
        if (this.data.defectUploading) return;
        const current = Array.isArray(this.data.defectImageUrls) ? this.data.defectImageUrls : [];
        const remain = 4 - current.length;
        if (remain <= 0) return;

        this.setData({ defectUploading: true });
        try {
            const choose = await new Promise((resolve, reject) => {
                wx.chooseImage({
                    count: remain,
                    sizeType: ['compressed'],
                    sourceType: ['album', 'camera'],
                    success: resolve,
                    fail: reject,
                });
            });
            const tempFilePaths = choose && Array.isArray(choose.tempFilePaths) ? choose.tempFilePaths : [];
            if (tempFilePaths.length === 0) return;

            const baseUrl = getBaseUrl();
            const token = getToken();

            const uploads = tempFilePaths.map((filePath) => new Promise((resolve, reject) => {
                wx.uploadFile({
                    url: `${baseUrl}/api/common/upload`,
                    filePath,
                    name: 'file',
                    header: token ? { Authorization: `Bearer ${token}` } : {},
                    success: (uploadRes) => {
                        const statusCode = uploadRes && uploadRes.statusCode != null ? Number(uploadRes.statusCode) : NaN;
                        const raw = uploadRes && uploadRes.data != null ? uploadRes.data : '';
                        const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
                        if (statusCode !== 200 || !parsed || parsed.code !== 200) {
                            const msg = parsed && parsed.message ? String(parsed.message) : '上传失败';
                            reject(new Error(msg));
                            return;
                        }
                        const path = parsed.data != null ? String(parsed.data).trim() : '';
                        if (!path) {
                            reject(new Error('上传失败'));
                            return;
                        }
                        resolve(path);
                    },
                    fail: (err) => {
                        const msg = err && err.errMsg ? String(err.errMsg) : '上传失败';
                        reject(new Error(msg));
                    },
                });
            }));

            const newPaths = await Promise.all(uploads);
            const uniq = new Set(current);
            const mergedPaths = current.slice();
            for (const p of newPaths) {
                if (!uniq.has(p)) {
                    uniq.add(p);
                    mergedPaths.push(p);
                }
            }
            const mergedFull = mergedPaths.map((p) => (p.startsWith('http://') || p.startsWith('https://')) ? p : `${baseUrl}${p}`);
            this.setData({ defectImageUrls: mergedPaths, defectImageFullUrls: mergedFull });
        } catch (e) {
            const msg = e && (e.errMsg || e.message) ? String(e.errMsg || e.message) : '上传失败';
            if (!msg.toLowerCase().includes('cancel')) {
                wx.showToast({ title: msg, icon: 'none' });
            }
        } finally {
            this.setData({ defectUploading: false });
        }
    },

    onPreviewDefectPhoto(e) {
        const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || 0);
        const urls = Array.isArray(this.data.defectImageFullUrls) ? this.data.defectImageFullUrls : [];
        if (!urls.length) return;
        const safe = Math.min(Math.max(0, idx), urls.length - 1);
        wx.previewImage({ current: urls[safe], urls });
    },

    onRemoveDefectPhoto(e) {
        if (this.data.defectUploading) return;
        const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || 0);
        const urls = Array.isArray(this.data.defectImageUrls) ? this.data.defectImageUrls : [];
        const full = Array.isArray(this.data.defectImageFullUrls) ? this.data.defectImageFullUrls : [];
        if (!urls.length) return;
        const safe = Math.min(Math.max(0, idx), urls.length - 1);
        const nextUrls = urls.slice();
        const nextFull = full.slice();
        nextUrls.splice(safe, 1);
        nextFull.splice(safe, 1);
        this.setData({ defectImageUrls: nextUrls, defectImageFullUrls: nextFull });
    },

    async onScan() {
        if (this.data.loading) return;

        const option = this.data.scanTypeOptions[this.data.scanTypeIndex];
        const scanType = option.value;
        const inputQuantity = Number(this.data.quantity);
        const hasInputQuantity = Number.isFinite(inputQuantity) && inputQuantity > 0;
        let quantity = hasInputQuantity ? Math.floor(inputQuantity) : null;
        const warehouse = (this.data.warehouse || '').trim();
        const qualityResult = this.data.qualityOptions[this.data.qualityIndex].value;

        if (scanType === 'quality' && qualityResult === 'unqualified') {
            if (this.data.defectUploading) {
                wx.showToast({ title: '图片上传中，请稍候', icon: 'none' });
                return;
            }
            // 检查问题类型是否已选择（强制必填）
            const catOpts = Array.isArray(this.data.defectCategoryOptions) ? this.data.defectCategoryOptions : [];
            const catIdx = Number.isFinite(Number(this.data.defectCategoryIndex)) ? Number(this.data.defectCategoryIndex) : -1;
            const catSafe = catOpts.length ? Math.min(Math.max(0, catIdx), catOpts.length - 1) : -1;
            const catSelected = catSafe >= 0 && catOpts[catSafe] && catOpts[catSafe].value ? String(catOpts[catSafe].value).trim() : '';
            if (!catSelected) {
                wx.showToast({ title: '请选择问题类型（必选）', icon: 'none' });
                return;
            }
            // 检查处理方式是否已选择（强制必填）
            const opts = Array.isArray(this.data.defectRemarkOptions) ? this.data.defectRemarkOptions : [];
            const idx = Number.isFinite(Number(this.data.defectRemarkIndex)) ? Number(this.data.defectRemarkIndex) : 0;
            const safe = opts.length ? Math.min(Math.max(0, idx), opts.length - 1) : 0;
            const selected = opts[safe] && opts[safe].value ? String(opts[safe].value).trim() : '';
            if (!selected) {
                wx.showToast({ title: '请选择次品处理方式（必选）', icon: 'none' });
                return;
            }
        }

        if (scanType === 'warehouse' && !warehouse) {
            wx.showToast({ title: '请输入仓库', icon: 'none' });
            return;
        }

        if (undoTimer) {
            clearTimeout(undoTimer);
            undoTimer = null;
        }
        this.setData({
            loading: true,
            lastResult: null,
            qtyHint: '数量需填写；二维码带数量会自动识别，可手动修改。',
            undo: { ...this.data.undo, canUndo: false, loading: false, expireAt: 0, payload: null },
            materialPurchases: [],
        });
        let lastDedupKey = '';
        try {
            const scanRes = await new Promise((resolve, reject) => {
                wx.scanCode({
                    onlyFromCamera: true,
                    success: resolve,
                    fail: reject,
                });
            });
            const scanCode = (scanRes && scanRes.result) ? String(scanRes.result).trim() : '';
            if (!scanCode) {
                wx.showToast({ title: '未获取到扫码内容', icon: 'none' });
                return;
            }

            const parsed = parseScanContent(scanCode);
            const finalScanCode = parsed && parsed.scanCode ? parsed.scanCode : scanCode;
            const parsedQty = parsed ? parsed.quantity : null;
            const recognizedQty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : null;
            const allowQrAutofill = recognizedQty != null && !(scanType === 'quality' && qualityResult === 'unqualified');
            if (allowQrAutofill) {
                quantity = recognizedQty;
                this.setData({ quantity: String(quantity), qtyHint: `已从二维码识别数量：${quantity}（可手动修改）` });
            } else if (recognizedQty != null) {
                this.setData({ qtyHint: `已识别二维码数量：${recognizedQty}；当前录入：${quantity}（可手动修改）` });
            } else {
                this.setData({ qtyHint: '未识别到数量，请手动填写' });
            }

            if (scanType === 'quality' && qualityResult === 'repaired') {
                const stats = await api.production.repairStats({ cuttingBundleQrCode: finalScanCode });
                const remaining = stats && stats.remaining != null ? Number(stats.remaining) : NaN;
                if (!Number.isFinite(remaining) || remaining <= 0) {
                    wx.showToast({ title: '该菲号无可返修入库数量', icon: 'none' });
                    return;
                }
                if (quantity > remaining) {
                    quantity = remaining;
                }
                this.setData({ quantity: String(quantity), qtyHint: `该菲号只可返修入库数量：${remaining}（可手动修改）` });
            }

            if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
                wx.showToast({ title: '请填写数量', icon: 'none' });
                return;
            }

            const stage = {
                scanType,
                progressStage: option.progressStage,
                processName: option.processName,
                processCode: option.processCode,
            };
            const payload = {
                requestId: generateRequestId(),
                scanCode: finalScanCode,
                scanType: stage.scanType,
                quantity,
            };
            if (parsed && parsed.orderNo) payload.orderNo = String(parsed.orderNo);
            if (parsed && parsed.styleNo) payload.styleNo = String(parsed.styleNo);
            if (parsed && parsed.color) payload.color = String(parsed.color);
            if (parsed && parsed.size) payload.size = String(parsed.size);
            if (parsed && parsed.bundleNo) payload.bundleNo = String(parsed.bundleNo);
            if (stage.progressStage) payload.progressStage = stage.progressStage;
            if (stage.processName) payload.processName = stage.processName;
            if (stage.processCode) payload.processCode = stage.processCode;

            if (scanType === 'warehouse') payload.warehouse = warehouse;
            if (scanType === 'quality') {
                payload.qualityResult = qualityResult;
                payload.remark = `qualityResult=${qualityResult}`;
                if (qualityResult === 'repaired') {
                    payload.repairRemark = '返修完成';
                }
                if (qualityResult === 'unqualified') {
                    const opts = Array.isArray(this.data.defectCategoryOptions) ? this.data.defectCategoryOptions : [];
                    const idx = Number.isFinite(Number(this.data.defectCategoryIndex)) ? Number(this.data.defectCategoryIndex) : 0;
                    const safe = opts.length ? Math.min(Math.max(0, idx), opts.length - 1) : 0;
                    payload.defectCategory = opts[safe] && opts[safe].value ? opts[safe].value : '';
                    const remarkOpts = Array.isArray(this.data.defectRemarkOptions) ? this.data.defectRemarkOptions : [];
                    const rIdx = Number.isFinite(Number(this.data.defectRemarkIndex)) ? Number(this.data.defectRemarkIndex) : 0;
                    const rSafe = remarkOpts.length ? Math.min(Math.max(0, rIdx), remarkOpts.length - 1) : 0;
                    payload.defectRemark = remarkOpts[rSafe] && remarkOpts[rSafe].value ? String(remarkOpts[rSafe].value).trim() : '';
                    const imgs = Array.isArray(this.data.defectImageUrls) ? this.data.defectImageUrls : [];
                    if (imgs.length) payload.unqualifiedImageUrls = JSON.stringify(imgs);
                }
            }

            const detail = {
                scanCode: payload.scanCode,
                quantity: payload.quantity,
                scanType: option && option.label ? option.label : payload.scanType,
                progressStage: payload.progressStage || '',
                processName: payload.processName || '',
                orderNo: payload.orderNo || (parsed && parsed.orderNo) || '',
                styleNo: payload.styleNo || (parsed && parsed.styleNo) || '',
                color: payload.color || (parsed && parsed.color) || '',
                size: payload.size || (parsed && parsed.size) || '',
                warehouse: payload.warehouse || '',
                qualityResult: payload.qualityResult || '',
                isProcurement: option && option.progressStage === '采购',
            };
            this.openScanConfirm(payload, detail);
            return;
        } catch (e) {
            if (e && e.type === 'auth') return;
            const msg = scanCodeErrorText(e);
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError({ errMsg: msg }, msg);
            else wx.showToast({ title: msg, icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },

    onUndoLast() {
        const undo = this.data.undo;
        if (!undo || !undo.canUndo || undo.loading || !undo.payload) return;
        wx.showModal({
            title: '撤销本次扫码',
            content: '只支持撤销刚刚的一次成功扫码，确认撤销？',
            confirmText: '撤销',
            cancelText: '取消',
            success: async (res) => {
                if (!res || !res.confirm) return;
                await this.undoLast();
            },
        });
    },

    async undoLast() {
        const undo = this.data.undo;
        if (!undo || !undo.canUndo || undo.loading || !undo.payload) return;
        this.setData({ undo: { ...undo, loading: true } });
        try {
            await api.production.undoScan(undo.payload);
            unmarkRecent(undo.payload.dedupKey || '');
            this.setData({
                undo: { ...this.data.undo, canUndo: false, loading: false, expireAt: 0, payload: null },
                lastResult: {
                    success: true,
                    message: '已撤销本次扫码',
                    scanCode: undo.payload.scanCode || '',
                    orderNo: (this.data.lastResult && this.data.lastResult.orderNo) || '',
                    styleNo: (this.data.lastResult && this.data.lastResult.styleNo) || '',
                    processName: (this.data.lastResult && this.data.lastResult.processName) || '',
                },
            });
            wx.showToast({ title: '已撤销', icon: 'none' });
        } catch (e) {
            const statusCode = e && e.type === 'http' ? Number(e.statusCode) : NaN;
            const unsupported = statusCode === 404 || statusCode === 405;
            this.setData({ undo: { ...this.data.undo, loading: false, canUndo: !unsupported } });
            if (unsupported) {
                wx.showModal({
                    title: '无法撤销',
                    content: '服务器暂不支持撤销，请联系管理员在后台回退本次扫码记录。',
                    showCancel: false,
                });
                return;
            }
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '撤销失败');
            else wx.showToast({ title: '撤销失败', icon: 'none' });
        }
    },

});
