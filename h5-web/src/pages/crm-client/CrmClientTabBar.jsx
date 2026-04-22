import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '@/components/Icon';
import './CrmClientTabBar.css';

const TABS = [
  { path: '/crm-client/dashboard', icon: 'home', activeIcon: 'home', label: '首页' },
  { path: '/crm-client/orders', icon: 'factory', activeIcon: 'factory', label: '订单' },
  { path: '/crm-client/purchases', icon: 'shoppingCart', activeIcon: 'shoppingCart', label: '采购' },
  { path: '/crm-client/receivables', icon: 'dollarSign', activeIcon: 'dollarSign', label: '账款' },
  { path: '/crm-client/profile', icon: 'user', activeIcon: 'user', label: '我的' },
];

export default function CrmClientTabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (tabPath) => {
    return location.pathname.startsWith(tabPath.replace('/crm-client', ''));
  };

  return (
    <div className="crm-tabbar">
      {TABS.map((tab) => {
        const active = isActive(tab.path);
        return (
          <button
            key={tab.path}
            className={`crm-tabbar-item ${active ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <Icon name={active ? tab.activeIcon : tab.icon} size={24} color={active ? 'var(--color-primary)' : '#9e9e9e'} />
            <span className="crm-tabbar-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
