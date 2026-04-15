import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { setToken, setUserInfo, setTenantInfo, clearBusinessCaches } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import { handleWxOAuthCallback, initiateWxOAuth, bindWxAccountAndLogin, getOAuthRedirectPath } from '@/services/wxOAuth';
import wxAdapter from '@/adapters/wx';

const isWechat = wxAdapter.isWechat;
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.webyszl.cn';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [tenants, setTenants] = useState([]);
  const [filteredTenants, setFilteredTenants] = useState([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wxBindMode, setWxBindMode] = useState(false);
  const [wxOpenid, setWxOpenid] = useState('');
  const hasTenantKeyword = tenantSearch.trim().length > 0;

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (code && isWechat) {
      handleOAuthCallback(code, state);
      return;
    }
    const inviteToken = searchParams.get('inviteToken');
    if (inviteToken) {
      api.wechat.inviteInfo(inviteToken).then((res) => {
        const data = res?.data || res;
        if (data?.tenantCode) {
          const t = { tenantId: data.tenantId, tenantName: data.tenantName || data.factoryName, tenantCode: data.tenantCode };
          setSelectedTenant(t);
          setTenantSearch(t.tenantName || '');
        }
      }).catch(() => {});
    }
    loadTenants();
  }, []);

  const loadTenants = () => {
    api.tenant.publicList().then((res) => {
      const list = res?.data || res || [];
      const arr = Array.isArray(list) ? list : [];
      setTenants(arr);
      setFilteredTenants(arr);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!tenantSearch.trim()) { setFilteredTenants([]); return; }
    const kw = tenantSearch.trim().toLowerCase();
    setFilteredTenants(tenants.filter((t) => (t.tenantName || t.name || '').toLowerCase().includes(kw)));
  }, [tenantSearch, tenants]);

  const handlePickTenant = (tenant) => {
    setSelectedTenant(tenant);
    setTenantSearch(tenant.tenantName || tenant.name || '');
  };

  const handleClearTenant = () => {
    setSelectedTenant(null);
    setTenantSearch('');
  };

  const handleOAuthCallback = async (code, state) => {
    setLoading(true);
    setError('');
    try {
      const result = await handleWxOAuthCallback(code, state);
      if (result && result.success) {
        const redirectPath = getOAuthRedirectPath();
        navigate(redirectPath, { replace: true });
        return;
      }
      if (result && result.needBind) {
        setWxBindMode(true);
        setWxOpenid(result.openid);
        setError('该微信未绑定账号，请输入账号密码完成绑定');
        loadTenants();
        return;
      }
      setError('微信授权登录失败');
    } catch (err) {
      setError(err?.message || '微信授权登录异常');
    } finally {
      setLoading(false);
    }
  };

  const handleWxLogin = () => {
    const currentPath = window.location.pathname + window.location.search;
    initiateWxOAuth(currentPath);
  };

  const validate = () => {
    if (!username.trim()) { setError('请输入用户名'); return false; }
    if (username.trim().length < 3 || username.trim().length > 20) { setError('用户名需3-20位字母数字'); return false; }
    if (!password) { setError('请输入密码'); return false; }
    if (password.length < 6 || password.length > 20) { setError('密码需6-20位'); return false; }
    if (!selectedTenant) { setError('请选择公司'); return false; }
    return true;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setError('');
    try {
      if (wxBindMode && wxOpenid) {
        const result = await bindWxAccountAndLogin({
          openid: wxOpenid, username: username.trim(), password,
          tenantId: selectedTenant.tenantId || selectedTenant.id,
        });
        if (result && result.success) {
          navigate(getOAuthRedirectPath(), { replace: true });
          return;
        }
        setError(result?.message || '绑定登录失败');
        return;
      }
      const res = await api.system.login({
        username: username.trim(), password,
        tenantId: selectedTenant.tenantId || selectedTenant.id,
      });
      const data = res?.data || res;
      const tk = data.token || data.access_token || '';
      const user = data.user || data.userInfo || {};
      if (!tk) { setError('登录失败：未获取到令牌'); return; }
      setToken(tk);
      setUserInfo(user);
      setTenantInfo(selectedTenant);
      clearBusinessCaches();
      setAuth(tk, user, selectedTenant);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">小云供应链</h1>
        <p className="login-subtitle">有问题找小云｜多端协同更轻松</p>

        <div className="form-stack">
          {isWechat && !wxBindMode && (
            <button className="wx-login-button" onClick={handleWxLogin} disabled={loading}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.045c.134 0 .24-.11.24-.245 0-.06-.024-.12-.04-.178l-.325-1.233a.492.492 0 01.177-.554C23.028 18.135 24 16.413 24 14.508c0-3.367-3.226-5.65-7.062-5.65zm-2.095 2.926c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.19 0c.535 0 .969.44.969.982a.976.976 0 01-.97.983.976.976 0 01-.968-.983c0-.542.434-.982.969-.982z"/>
              </svg>
              微信一键登录
            </button>
          )}

          {wxBindMode && (
            <div className="info-banner">检测到微信账号未绑定系统用户，请输入账号密码完成绑定</div>
          )}

          <div className="field-block">
            <label><span className="required-star">*</span>公司</label>
            <div className="tenant-select-wrap">
              <input className="text-input tenant-select-input" type="text" placeholder="请输入公司名称搜索（如：云裳智链）" value={tenantSearch}
              onChange={(e) => {
                setTenantSearch(e.target.value);
                if (selectedTenant && (selectedTenant.tenantName || selectedTenant.name) !== e.target.value) {
                  setSelectedTenant(null);
                }
              }} />
              {tenantSearch && (
                <button
                  type="button"
                  className="tenant-clear-btn"
                  onClick={handleClearTenant}
                  aria-label="清空公司"
                >
                  ×
                </button>
              )}
            </div>
            {selectedTenant && (
              <div className="tenant-picked-tip">
                ✓ 已选择：{selectedTenant.tenantName || selectedTenant.name}
              </div>
            )}
            {hasTenantKeyword && (
              <div className="tenant-dropdown-list">
                {filteredTenants.slice(0, 20).map((t) => (
                  <button
                    key={t.tenantId || t.id}
                    className={`tenant-dropdown-option${(selectedTenant?.tenantId === t.tenantId || selectedTenant?.id === t.id) ? ' active' : ''}`}
                    onClick={() => handlePickTenant(t)}
                  >
                    {t.tenantName || t.name}
                  </button>
                ))}
                {filteredTenants.length === 0 && (
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, padding: '8px 2px' }}>
                    未搜索到对应公司，请检查名称是否正确
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="field-block">
            <label><span className="required-star">*</span>用户名</label>
            <input className="text-input" type="text" placeholder="请输入用户名(3-20位)" value={username}
              onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>

          <div className="field-block">
            <label><span className="required-star">*</span>密码</label>
            <div style={{ position: 'relative' }}>
              <input className="text-input" type={showPassword ? 'text' : 'password'} placeholder="请输入密码(6-20位)" value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoComplete="current-password" style={{ paddingRight: 48 }} />
              <button onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12 }}>
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button className="primary-button" onClick={handleLogin} disabled={loading}>
            {loading ? '处理中...' : wxBindMode ? '绑定并登录' : '登录'}
          </button>

          {!wxBindMode && (
            <button className="ghost-button" onClick={() => navigate('/register')}>新员工注册</button>
          )}

          <div className="field-block">
            <label>服务器地址</label>
            <input className="text-input" type="text" value={DEFAULT_API_BASE_URL} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}
