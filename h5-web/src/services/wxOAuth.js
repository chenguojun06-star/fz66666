import { http } from './http';
import { useAuthStore } from '@/stores/authStore';
import { setToken, setUserInfo, setTenantInfo } from '@/utils/storage';

const WX_OAUTH_STATE_KEY = 'wx_oauth_state';
const WX_OAUTH_REDIRECT_KEY = 'wx_oauth_redirect';

function generateState() {
  const state = 'h5_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  sessionStorage.setItem(WX_OAUTH_STATE_KEY, state);
  return state;
}

function validateState(state) {
  const saved = sessionStorage.getItem(WX_OAUTH_STATE_KEY);
  if (!saved || saved !== state) {
    console.warn('[WX-OAuth] State mismatch');
    return false;
  }
  sessionStorage.removeItem(WX_OAUTH_STATE_KEY);
  return true;
}

function storeAuth(token, user) {
  setToken(token);
  setUserInfo(user);
  if (user?.tenantId) {
    setTenantInfo({ tenantId: user.tenantId, tenantName: user.tenantName || '' });
  }
  useAuthStore.getState().setAuth(token, user, {
    tenantId: user?.tenantId || '',
    tenantName: user?.tenantName || '',
  });
}

export function initiateWxOAuth(redirectPath) {
  const ua = navigator.userAgent.toLowerCase();
  if (!ua.includes('micromessenger')) {
    console.warn('[WX-OAuth] Not in WeChat browser');
    return false;
  }

  const appId = import.meta.env.VITE_WX_H5_APP_ID;
  if (!appId) {
    console.warn('[WX-OAuth] VITE_WX_H5_APP_ID not configured');
    return false;
  }

  if (redirectPath) {
    sessionStorage.setItem(WX_OAUTH_REDIRECT_KEY, redirectPath);
  }

  const redirectUri = encodeURIComponent(`${window.location.origin}/login`);
  const state = generateState();
  const scope = 'snsapi_userinfo';

  const oauthUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;

  window.location.href = oauthUrl;
  return true;
}

export async function handleWxOAuthCallback(code, state) {
  if (!code) {
    console.warn('[WX-OAuth] No code in callback');
    return false;
  }

  if (state && !validateState(state)) {
    console.warn('[WX-OAuth] Invalid state parameter');
    return false;
  }

  try {
    const res = await http.post('/api/wechat/h5/oauth-login', { code });

    if (res && res.data) {
      const { token, user, needBind, openid } = res.data;

      if (token && user) {
        storeAuth(token, user);
        return { success: true };
      }

      if (needBind) {
        return { success: false, needBind: true, openid };
      }
    }

    return false;
  } catch (err) {
    console.warn('[WX-OAuth] Login failed:', err?.message);
    return false;
  }
}

export async function bindWxAccountAndLogin({ openid, username, password, tenantId }) {
  try {
    const res = await http.post('/api/wechat/h5/bind-login', {
      openid,
      username,
      password,
      tenantId,
    });

    if (res && res.data) {
      const { token, user } = res.data;
      if (token && user) {
        storeAuth(token, user);
        return { success: true };
      }
    }

    return { success: false, message: '绑定登录失败' };
  } catch (err) {
    return { success: false, message: err?.message || '绑定登录失败' };
  }
}

export function getOAuthRedirectPath() {
  const path = sessionStorage.getItem(WX_OAUTH_REDIRECT_KEY);
  sessionStorage.removeItem(WX_OAUTH_REDIRECT_KEY);
  return path || '/home';
}
