import { useNavigate, useLocation } from 'react-router-dom';

const Icon = ({ name, color }) => {
  const common = { width: '22px', height: '22px', fill: color, display: 'block' };
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M12 3l9 8h-3v9h-4v-6H10v6H6v-9H3l9-8z" />
        </svg>
      );
    case 'box':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M3 4l9-3 9 3v16l-9 3-9-3V4zm2 3l7 2.5V19l-7-2.33V7zm14 0l-7 2.5V19l7-2.33V7zM12 7.3L5.5 5 12 3l6.5 2L12 7.3z" />
        </svg>
      );
    case 'stock':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h10v2H4v-2zm0 4h10v2H4v-2zm12 0v6l5-3-5-3z" />
        </svg>
      );
    case 'money':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v2h-2V7zm1 2a4 4 0 010 8v2a6 6 0 100-12v2z" />
          <path d="M12 11a3 3 0 100 6 3 3 0 000-6z" />
        </svg>
      );
    case 'user':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4 0-9 2-9 6v3h18v-3c0-4-5-6-9-6z" />
        </svg>
      );
    default:
      return null;
  }
};

const tabs = [
  { path: '/supplier-portal/dashboard', label: '首页', icon: 'home' },
  { path: '/supplier-portal/purchases', label: '采购', icon: 'box' },
  { path: '/supplier-portal/inventory', label: '库存', icon: 'stock' },
  { path: '/supplier-portal/payables', label: '财务', icon: 'money' },
  { path: '/supplier-portal/profile', label: '我的', icon: 'user' },
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
        const color = active ? '#11998e' : '#999';
        return (
          <button key={tab.path} onClick={() => navigate(tab.path)} style={s.tab}>
            <span style={{ ...s.icon, transform: active ? 'scale(1.1)' : 'scale(1)' }}>
              <Icon name={tab.icon} color={color} />
            </span>
            <span style={{ ...s.label, color, fontWeight: active ? '600' : '400' }}>{tab.label}</span>
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
