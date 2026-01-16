const { request } = require('../../utils/request');
const { getToken, clearToken } = require('../../utils/storage');

Page({
    data: {
        loading: false,
        scanTypeOptions: [
            { label: '生产扫码', value: 'production' },
            { label: '物料扫码', value: 'material' },
            { label: '裁剪扫码', value: 'cutting' },
            { label: '质检扫码', value: 'quality' },
            { label: '入库扫码', value: 'warehouse' },
            { label: '出货扫码', value: 'shipment' },
        ],
        scanTypeIndex: 0,
        quantity: 1,
        warehouse: '',
        qualityOptions: [
            { label: '合格', value: 'qualified' },
            { label: '次品待返修', value: 'unqualified' },
            { label: '返修完成', value: 'repaired' },
        ],
        qualityIndex: 0,
        lastResult: null,
    },

    onShow() {
        const token = getToken();
        if (!token) {
            wx.reLaunch({ url: '/pages/login/index' });
        }
    },

    onScanTypeChange(e) {
        const idx = Number((e && e.detail && e.detail.value) || 0);
        this.setData({ scanTypeIndex: idx, lastResult: null });
    },

    onQuantityInput(e) {
        const v = Number((e && e.detail && e.detail.value) || 1);
        const q = Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
        this.setData({ quantity: q });
    },

    onWarehouseInput(e) {
        this.setData({ warehouse: (e && e.detail && e.detail.value) || '' });
    },

    onQualityChange(e) {
        const idx = Number((e && e.detail && e.detail.value) || 0);
        this.setData({ qualityIndex: idx });
    },

    async onScan() {
        if (this.data.loading) return;

        const scanType = this.data.scanTypeOptions[this.data.scanTypeIndex].value;
        const quantity = Number(this.data.quantity) || 1;
        const warehouse = (this.data.warehouse || '').trim();
        const qualityResult = this.data.qualityOptions[this.data.qualityIndex].value;

        if (scanType === 'warehouse' && !warehouse) {
            wx.showToast({ title: '请输入仓库', icon: 'none' });
            return;
        }

        this.setData({ loading: true, lastResult: null });
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

            const payload = {
                scanCode,
                scanType,
                quantity,
            };
            if (scanType === 'warehouse') {
                payload.warehouse = warehouse;
            }
            if (scanType === 'quality') {
                payload.qualityResult = qualityResult;
            }

            const resp = await request({
                url: '/api/production/scan/execute',
                method: 'POST',
                data: payload,
            });

            if (resp && resp.code === 200) {
                const data = resp.data || {};
                const sr = data.scanRecord || {};
                const oi = data.orderInfo || {};
                this.setData({
                    lastResult: {
                        success: !!data.success,
                        message: String(data.message || resp.message || '成功'),
                        scanCode,
                        orderNo: oi.orderNo || sr.orderNo || '',
                        styleNo: oi.styleNo || sr.styleNo || '',
                        processName: sr.processName || '',
                    },
                });
                wx.vibrateShort();
                return;
            }

            const msg = (resp && resp.message) || '扫码失败';
            this.setData({
                lastResult: {
                    success: false,
                    message: msg,
                    scanCode,
                },
            });
            wx.showToast({ title: msg, icon: 'none' });
        } catch (e) {
            wx.showToast({ title: '扫码或网络异常', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },

    onLogout() {
        clearToken();
        wx.reLaunch({ url: '/pages/login/index' });
    },
});

