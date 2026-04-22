import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSupplierStore from '@/stores/supplierStore';
import supplierPortal from '@/api/supplierPortal';

const SupplierLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useSupplierStore((s) => s.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('请输入用户名和密码'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await supplierPortal.login({ username: username.trim(), password });
      if (res?.token) {
        setAuth({ token: res.token, supplierId: res.supplierId, tenantId: res.tenantId, supplier: res.supplier, user: res.user });
        navigate('/supplier-portal/dashboard');
      } else {
        setError(res?.message || '登录失败');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logoArea}>
          <div style={s.logoIcon}>🏭</div>
          <h1 style={s.title}>供应商协同平台</h1>
          <p style={s.subtitle}>采购需求 · 发货管理 · 对账结算</p>
        </div>
        <form onSubmit={handleLogin} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名" style={s.input} autoComplete="username" />
          </div>
          <div style={s.field}>
            <label style={s.label}>密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" style={s.input} autoComplete="current-password" />
          </div>
          {error && <div style={s.error}>{error}</div>}
          <button type="submit" disabled={loading} style={s.button}>{loading ? '登录中...' : '登 录'}</button>
        </form>
        <p style={s.footer}>由服装供应链管理系统提供</p>
      </div>
    </div>
  );
};

const s = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', padding: '20px' },
  card: { width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '16px', padding: '32px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  logoArea: { textAlign: 'center', marginBottom: '32px' },
  logoIcon: { fontSize: '48px', marginBottom: '12px' },
  title: { fontSize: '24px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 8px' },
  subtitle: { fontSize: '14px', color: '#888', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '14px', fontWeight: '600', color: '#333' },
  input: { padding: '12px 14px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '15px', outline: 'none' },
  error: { color: '#e74c3c', fontSize: '13px', textAlign: 'center', padding: '8px', background: '#ffeaea', borderRadius: '8px' },
  button: { padding: '14px', background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  footer: { textAlign: 'center', fontSize: '12px', color: '#aaa', marginTop: '24px' },
};

export default SupplierLogin;
