import { request } from './request';
import { validateProductionOrder, validateScanRecord } from './dataValidator';
import { errorHandler } from './errorHandler';

function pickMessage(resp, fallback) {
    const msg = resp && resp.message != null ? String(resp.message) : '';
    return msg || (fallback ? String(fallback) : '请求失败');
}

function createBizError(resp, fallback) {
    return {
        type: 'biz',
        code: resp && resp.code,
        errMsg: pickMessage(resp, fallback),
        resp,
    };
}

async function ok(url, method, data, options) {
    const resp = await request({ url, method, data, ...(options || {}) });
    if (resp && resp.code === 200) return resp.data;
    throw createBizError(resp, `${method} ${url}`);
}

async function raw(url, method, data, options) {
    return request({ url, method, data, ...(options || {}) });
}

const dashboard = {
    get(params) {
        return ok('/api/dashboard', 'GET', params || {});
    },
};

const production = {
    listOrders(params) {
        return ok('/api/production/order/list', 'GET', params || {});
    },
    orderDetail(id) {
        const oid = String(id || '').trim();
        return ok(`/api/production/order/detail/${encodeURIComponent(oid)}`, 'GET', {});
    },
    updateProgress(payload) {
        return ok('/api/production/order/update-progress', 'POST', payload || {});
    },
    listWarehousing(params) {
        return ok('/api/production/warehousing/list', 'GET', params || {});
    },
    listScans(params) {
        return ok('/api/production/scan/list', 'GET', params || {});
    },
    myScanHistory(params) {
        return ok('/api/production/scan/my-history', 'GET', params || {});
    },
    personalScanStats(params) {
        return ok('/api/production/scan/personal-stats', 'GET', params || {});
    },
    executeScan(payload) {
        return ok('/api/production/scan/execute', 'POST', payload || {});
    },
    repairStats(params) {
        return ok('/api/production/warehousing/repair-stats', 'GET', params || {});
    },
    rollbackByBundle(payload) {
        return ok('/api/production/warehousing/rollback-by-bundle', 'POST', payload || {});
    },
    receivePurchase(payload) {
        return ok('/api/production/purchase/receive', 'POST', payload || {});
    },
    updateArrivedQuantity(payload) {
        return ok('/api/production/purchase/update-arrived-quantity', 'POST', payload || {});
    },
    // 通过扫码获取关联的采购单
    getMaterialPurchases(params) {
        return ok('/api/production/purchase/by-scan-code', 'GET', params || {});
    },
    // 获取我的采购任务
    myProcurementTasks() {
        return ok('/api/production/purchase/my-tasks', 'GET', {});
    },
    // 提交质检结果（通过更新扫码记录）
    submitQualityResult(payload) {
        return ok('/api/production/scan/execute', 'POST', payload || {});
    },
    // 查询裁剪菲号信息（验证菲号是否存在，获取准确数量）
    getCuttingBundle(orderNo, bundleNo) {
        return ok('/api/production/cutting/by-no', 'GET', { orderNo, bundleNo });
    },
    // 生成裁剪菲号
    generateCuttingBundles(orderId, bundles) {
        return raw('/api/production/cutting/generate', 'POST', { orderId, bundles });
    },
    async undoScan(payload) {
        const data = payload || {};
        const candidates = ['/api/production/scan/undo', '/api/production/scan/revoke', '/api/production/scan/cancel'];
        let lastErr = null;

        for (const url of candidates) {
            try {
                const resp = await raw(url, 'POST', data);
                if (resp && resp.code === 200) return resp.data;
                lastErr = createBizError(resp, `POST ${url}`);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || createBizError(null, 'POST /api/production/scan/undo');
    },
};

const system = {
    getMe() {
        return ok('/api/system/user/me', 'GET', {});
    },
    listUsers(params) {
        return ok('/api/system/user/list', 'GET', params || {});
    },
    listPendingUsers(params) {
        return ok('/api/system/user/pending', 'GET', params || {});
    },
    getUser(userId) {
        return ok(`/api/system/user/${userId}`, 'GET', {});
    },
    updateUser(userId, payload) {
        return ok(`/api/system/user/${userId}`, 'PUT', payload || {});
    },
    approveUser(userId) {
        return ok(`/api/system/user/${userId}/approve`, 'POST', {});
    },
    rejectUser(userId, payload) {
        return ok(`/api/system/user/${userId}/reject`, 'POST', payload || {});
    },
    listRoles(params) {
        return ok('/api/system/role/list', 'GET', params || {});
    },
    getRolePermissionIds(roleId) {
        return ok(`/api/system/role/${roleId}/permission-ids`, 'GET', {});
    },
    setRolePermissionIds(roleId, ids) {
        return ok(`/api/system/role/${roleId}/permission-ids`, 'PUT', Array.isArray(ids) ? ids : []);
    },
    getPermissionTree() {
        return ok('/api/system/permission/tree', 'GET', {});
    },
    getOnlineCount() {
        return ok('/api/system/user/online-count', 'GET', {});
    },
};

const wechat = {
    miniProgramLogin(payload) {
        return raw('/api/wechat/mini-program/login', 'POST', payload || {}, { skipAuthRedirect: true });
    },
};

const api = {
    dashboard,
    production,
    system,
    wechat,
};

export {
    dashboard,
    production,
    system,
    wechat,
};

export default api;
