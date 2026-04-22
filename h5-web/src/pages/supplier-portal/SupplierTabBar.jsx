import { useNavigate, useLocation } from 'react-router-dom';

const tabs = [
  { path: '/supplier-portal/dashboard', label: '首页', icon: '🏠' },
  { path: '/supplier-portal/purchases', label: '采购', icon: '📦' },
  { path: '/supplier-portal/inventory', label: '库存', icon: '📊' },
  { path: '/supplier-portal/payables', label: '财务', icon: '💰' },
  { path: '/supplier-portal/profile', label: '我的', icon: '👤' },
];

const SupplierTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div style={s.bar}>
      {tabs.map((tab) => {
        const active = currentPath.startsWith(tab.path) ||
          (tab.path === '/supplier-portal/dashboard' && currentPath === '/supplier-portal');
        return (
          <button key={tab.path} onClick={() => navigate(tab.path)} style={s.tab}>
            <span style={{ ...s.icon, transform: active ? 'scale(1.15)' : 'scale(1)' }}>{tab.icon}</span>
            <span style={{ ...s.label, color: active ? '#11998e' : '#999', fontWeight: active ? '600' : '400' }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const s = {
  bar: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    background: '#fff', borderTop: '1px solid #eee',
    padding: '6px 0 env(safe-area-inset-bottom, 8px)', zIndex: 100,
    boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
  },
  tab: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 12px' },
  icon: { fontSize: '22px', transition: 'transform 0.2s' },
  label: { fontSize: '11px', transition: 'color 0.2s' },
};

export default SupplierTabBar;
