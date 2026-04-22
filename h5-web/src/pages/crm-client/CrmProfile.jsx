import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';
import crmClient from '@/api/crmClient';

const CrmProfile = () => {
  const navigate = useNavigate();
  const logout = useCrmClientStore((s) => s.logout);
  const customer = useCrmClientStore((s) => s.customer);
  const user = useCrmClientStore((s) => s.user);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await crmClient.getProfile();
      if (res) setProfile(res);
    } catch (err) {
      console.error('加载资料失败:', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/crm-client/login', { replace: true });
  };

  const displayData = profile || customer;

  return (
    <div style={s.page}>
      <h1 style={s.title}>我的资料</h1>

      <div style={s.avatarArea}>
        <div style={s.avatar}>{displayData?.companyName?.charAt(0) || '?'}</div>
        <div style={s.name}>{displayData?.companyName || '-'}</div>
        <div style={s.level}>{displayData?.customerLevel === 'VIP' ? '⭐ VIP客户' : '普通客户'}</div>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>公司信息</h2>
        <div style={s.row}><span style={s.label}>公司名称</span><span style={s.val}>{displayData?.companyName || '-'}</span></div>
        <div style={s.row}><span style={s.label}>客户编号</span><span style={s.val}>{displayData?.customerNo || '-'}</span></div>
        <div style={s.row}><span style={s.label}>联系人</span><span style={s.val}>{displayData?.contactPerson || '-'}</span></div>
        <div style={s.row}><span style={s.label}>联系电话</span><span style={s.val}>{displayData?.contactPhone || '-'}</span></div>
        <div style={s.row}><span style={s.label}>邮箱</span><span style={s.val}>{displayData?.contactEmail || '-'}</span></div>
        <div style={s.row}><span style={s.label}>地址</span><span style={s.val}>{displayData?.address || '-'}</span></div>
        <div style={s.row}><span style={s.label}>行业</span><span style={s.val}>{displayData?.industry || '-'}</span></div>
      </div>

      {user && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>账号信息</h2>
          <div style={s.row}><span style={s.label}>用户名</span><span style={s.val}>{user.username || '-'}</span></div>
          <div style={s.row}><span style={s.label}>上次登录</span><span style={s.val}>{user.lastLoginTime || '-'}</span></div>
        </div>
      )}

      <button onClick={handleLogout} style={s.logoutBtn}>退出登录</button>
    </div>
  );
};

const s = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  title: { fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 16px' },
  avatarArea: { textAlign: 'center', marginBottom: '24px' },
  avatar: {
    width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', fontSize: '28px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 12px',
  },
  name: { fontSize: '18px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' },
  level: { fontSize: '13px', color: '#888' },
  card: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: '16px', fontWeight: '600', color: '#1a1a2e', margin: '0 0 12px' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: '14px' },
  label: { color: '#888' },
  val: { color: '#333', fontWeight: '500', textAlign: 'right', maxWidth: '60%' },
  logoutBtn: {
    width: '100%', padding: '14px', background: '#fff', color: '#e74c3c', border: '1px solid #e74c3c',
    borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginTop: '16px',
  },
};

export default CrmProfile;
