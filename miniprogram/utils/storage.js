const TOKEN_KEY = 'auth_token';

function getToken() {
    try {
        return wx.getStorageSync(TOKEN_KEY) || '';
    } catch (e) {
        return '';
    }
}

function setToken(token) {
    try {
        wx.setStorageSync(TOKEN_KEY, token || '');
    } catch (e) {
        null;
    }
}

function clearToken() {
    try {
        wx.removeStorageSync(TOKEN_KEY);
    } catch (e) {
        null;
    }
}

module.exports = {
    getToken,
    setToken,
    clearToken,
};

