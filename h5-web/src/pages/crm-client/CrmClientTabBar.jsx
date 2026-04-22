import { useNavigate, useLocation } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';

const CrmClientTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = useCrmClientStore((s) => s.currentPage);

  const tabs = [
    { key: 'dashboard', path: '/crm-client/dashboard', icon: '🏠', label: '首页' },
    { key: 'orders', path: '/crm-client/orders', icon: '📦', label: '订单' },
    { key: 'purchases', path: '/crm-client/purchases', icon: '🛒', label: '采购' },
    { key: 'receivables', path: '/crm-client/receivables', icon: '💰', label: '应收' },
    { key: 'profile', path: '/crm-client/profile', icon: '👤', label: '我的' },
  ];

  const getActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div style={s.bar}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => navigate(tab.path)}
          style={{
            ...s.tab,
            color: getActive(tab.path) ? '#667eea' : '#999',
          }}
        >
          <span style={s.icon}>{tab.icon}</span>
          <span style={{ ...s.label, fontWeight: getActive(tab.path) ? '600' : '400' }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

const s = {
  bar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, height: '60px',
    background: '#fff', display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    borderTop: '1px solid #eee', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)', zIndex: 1000,
  },
  tab: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 12px',
  },
  icon: { fontSize: '22px', lineHeight: 1 },
  label: { fontSize: '11px' },
};

export default CrmClientTabBar;
