import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';
import crmClient from '@/api/crmClient';

const CrmLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useCrmClientStore((s) => s.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await crmClient.login({ username: username.trim(), password });
      if (res?.token) {
        setAuth({
          token: res.token,
          customerId: res.customerId,
          tenantId: res.tenantId,
          customer: res.customer,
          user: res.user,
        });
        navigate('/crm-client/dashboard');
      } else {
        setError(res?.message || '登录失败');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>📋</div>
          <h1 style={styles.title}>客户门户</h1>
          <p style={styles.subtitle}>查看订单进度 · 应收账款 · 采购信息</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              style={styles.input}
              autoComplete="username"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              style={styles.input}
              autoComplete="current-password"
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>

        <p style={styles.footer}>由服装供应链管理系统提供</p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#fff',
    borderRadius: '16px',
    padding: '32px 24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  logoArea: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logoIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  input: {
    padding: '12px 14px',
    border: '1px solid #ddd',
    borderRadius: '10px',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    color: '#e74c3c',
    fontSize: '13px',
    textAlign: 'center',
    padding: '8px',
    background: '#ffeaea',
    borderRadius: '8px',
  },
  button: {
    padding: '14px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px',
  },
  footer: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#aaa',
    marginTop: '24px',
  },
};

export default CrmLogin;
