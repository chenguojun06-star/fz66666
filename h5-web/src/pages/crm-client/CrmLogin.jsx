import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmLogin.css';

export default function CrmLogin() {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useCrmClientStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const res = await crmClient.login({ username, password });
      if (res.code === 200 && res.data) {
        setAuth(res.data);
        navigate('/crm-client/dashboard');
      } else {
        setError(res.message || '登录失败');
      }
    } catch (error) {
      console.error('登录失败:', error);
      setError(error.response?.data?.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    navigate('/crm-client/dashboard');
    return null;
  }

  return (
    <div className="crm-login">
      <div className="crm-login-header">
        <div className="crm-login-logo">
          <Icon name="buildings" size={48} color="var(--color-primary)" />
        </div>
        <h1 className="crm-login-title">客户服务中心</h1>
        <p className="crm-login-subtitle">订单查询 · 账款管理 · 采购跟进</p>
      </div>

      <div className="crm-login-form">
        {error && (
          <div className="crm-login-error">{error}</div>
        )}

        <div className="crm-form-item">
          <div className="crm-form-label">
            <Icon name="user" size={16} color="var(--color-text-secondary)" />
            <span>用户名</span>
          </div>
          <input
            type="text"
            className="crm-form-input"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            autoComplete="username"
          />
        </div>

        <div className="crm-form-item">
          <div className="crm-form-label">
            <Icon name="lock" size={16} color="var(--color-text-secondary)" />
            <span>密码</span>
          </div>
          <input
            type="password"
            className="crm-form-input"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            autoComplete="current-password"
          />
        </div>

        <button
          className="crm-login-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <span className="crm-login-btn-loading">
              <span className="crm-spinner"></span>
              <span>登录中...</span>
            </span>
          ) : (
            '登录'
          )}
        </button>

        <div className="crm-login-tip">
          <p><Icon name="info" size={14} color="var(--color-text-tertiary)" /> 请联系管理员获取账号密码</p>
        </div>
      </div>
    </div>
  );
}
