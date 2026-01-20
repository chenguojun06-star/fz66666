const { request } = require('./request');
const { validateProductionOrder, validateScanRecord } = require('./dataValidator');
const { errorHandler } = require('./errorHandler');

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
    submitQualityResult(payload) {
        return ok('/api/production/scan/submit-quality-result', 'POST', payload || {});
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
    updateUser(payload) {
        return ok('/api/system/user', 'PUT', payload || {});
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
    async getOnlineCount() {
        const resp = await raw('/api/system/user/online-count', 'GET', {});
        if (resp && resp.code === 200) return resp.data;
        throw createBizError(resp, 'GET /api/system/user/online-count');
    },
};

const wechat = {
    miniProgramLogin(payload) {
        return raw('/api/wechat/mini-program/login', 'POST', payload || {}, { skipAuthRedirect: true });
    },
};

module.exports = {
    dashboard,
    production,
    system,
    wechat,
};
