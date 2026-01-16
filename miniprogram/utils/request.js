const { baseUrl } = require('../config');
const { getToken, clearToken } = require('./storage');

function request(options) {
    return new Promise((resolve, reject) => {
        const url = (options && options.url) || '';
        const method = (options && options.method) || 'GET';
        const data = (options && options.data) || undefined;
        const header = (options && options.header) || {};

        const token = getToken();
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

        wx.request({
            url: `${baseUrl}${url}`,
            method,
            data,
            header: {
                'content-type': 'application/json',
                ...authHeader,
                ...header,
            },
            success(res) {
                const body = res && res.data;
                if (body && body.code === 401) {
                    clearToken();
                }
                resolve(body);
            },
            fail(err) {
                reject(err);
            },
        });
    });
}

module.exports = {
    request,
};

