import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSupplierStore from '@/stores/supplierStore';
import supplierPortal from '@/api/supplierPortal';

const SupplierProfile = () => {
  const navigate = useNavigate();
  const { supplier, user, logout } = useSupplierStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await supplierPortal.getProfile();
      setProfile(res);
    } catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    logout();
    navigate('/supplier-portal/login', { replace: true });
  };

  const displaySupplier = profile || supplier;

  if (loading) return <div style={s.loading}>加载中...</div>;

  return (
    <div style={s.page}>
      <div style={s.profileCard}>
        <div style={s.avatar}>{(displaySupplier?.factoryName || '供')[0]}</div>
        <h2 style={s.name}>{displaySupplier?.factoryName || '供应商'}</h2>
        <p style={s.code}>{displaySupplier?.factoryCode || ''}</p>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>联系信息</h3>
        <div style={s.row}><span style={s.label}>联系人</span><span style={s.val}>{displaySupplier?.contactPerson || user?.contactPerson || '-'}</span></div>
        <div style={s.row}><span style={s.label}>联系电话</span><span style={s.val}>{displaySupplier?.contactPhone || user?.contactPhone || '-'}</span></div>
        <div style={s.row}><span style={s.label}>地址</span><span style={s.val}>{displaySupplier?.address || '-'}</span></div>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>账号信息</h3>
        <div style={s.row}><span style={s.label}>用户名</span><span style={s.val}>{user?.username || '-'}</span></div>
        <div style={s.row}><span style={s.label}>状态</span><span style={{ ...s.val, color: '#27ae60' }}>{user?.status === 'ACTIVE' ? '正常' : user?.status || '-'}</span></div>
        <div style={s.row}><span style={s.label}>最后登录</span><span style={s.val}>{user?.lastLoginTime || '-'}</span></div>
      </div>

      <button onClick={handleLogout} style={s.logoutBtn}>退出登录</button>
    </div>
  );
};

const s = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  loading: { textAlign: 'center', padding: '60px 20px', color: '#888' },
  profileCard: { background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', borderRadius: '16px', padding: '24px', textAlign: 'center', marginBottom: '16px' },
  avatar: { width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', color: '#fff', margin: '0 auto 12px' },
  name: { fontSize: '20px', fontWeight: '700', color: '#fff', margin: '0 0 4px' },
  code: { fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0 },
  section: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  sectionTitle: { fontSize: '16px', fontWeight: '600', color: '#1a1a2e', margin: '0 0 12px' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' },
  label: { color: '#888' },
  val: { color: '#333', fontWeight: '500' },
  logoutBtn: { width: '100%', padding: '14px', background: '#fff', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '12px' },
};

export default SupplierProfile;
