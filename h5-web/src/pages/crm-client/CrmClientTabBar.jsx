import { useNavigate, useLocation } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';

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
    case 'cart':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M7 4h-2l-1-2h-2v2h2l3.6 7.6-1.4 2.5c-.2.3-.2.7 0 1 .2.3.5.5.8.5h10v-2h-9.4l1-2h7.4c.6 0 1.1-.3 1.4-.8l3.6-6.4-1.8-1L17.6 11H7.5L6.2 4H7zm-1 14a2 2 0 100 4 2 2 0 000-4zm12 0a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      );
    case 'money':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v2h-2V7zm1 2a4 4 0 010 8v2a6 6 0 100-12v2z" />
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

const CrmClientTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = useCrmClientStore((s) => s.currentPage);

  const tabs = [
    { key: 'dashboard', path: '/crm-client/dashboard', icon: 'home', label: '首页' },
    { key: 'orders', path: '/crm-client/orders', icon: 'box', label: '订单' },
    { key: 'purchases', path: '/crm-client/purchases', icon: 'cart', label: '采购' },
    { key: 'receivables', path: '/crm-client/receivables', icon: 'money', label: '应收' },
    { key: 'profile', path: '/crm-client/profile', icon: 'user', label: '我的' },
  ];

  const getActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div style={s.bar}>
      {tabs.map((tab) => {
        const active = getActive(tab.path);
        const color = active ? '#667eea' : '#999';
        return (
          <button
            key={tab.key}
            onClick={() => navigate(tab.path)}
            style={{ ...s.tab, color }}
          >
            <span style={{ ...s.icon, color }}>
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
