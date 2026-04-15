import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { getGreeting, toast } from '@/utils/uiHelper';
import { isAdminOrSupervisor } from '@/utils/permission';
import { isTenantOwner } from '@/utils/storage';
import DateCard from '@/components/DateCard';

const menuItems = [
  { path: '/dashboard', label: '进度看板', icon: '📊', admin: true },
  { path: '/work', label: '生产', icon: '🏭' },
  { path: '/scan', label: '扫码质检', icon: '🔍' },
  { path: '/work/bundle-split', label: '菲号单价', icon: '🏷️' },
  { path: '/scan/history', label: '历史记录', icon: '📋' },
  { path: '/payroll/payroll', label: '当月工资', icon: '💰' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const storeUser = useAuthStore((s) => s.user);
  const tenantName = useAuthStore((s) => s.tenantName);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const [stats, setStats] = useState({ scanCount: 0, orderCount: 0, totalQuantity: 0, totalAmount: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api.system.getMe(),
      api.production.personalScanStats(),
      api.notice.unreadCount(),
    ]).then(([meResult, statsResult, unreadResult]) => {
      if (!mounted) return;
      if (meResult.status === 'fulfilled') {
        const user = meResult.value?.data || meResult.value;
        setAuth(token, user);
        setAdmin(isAdminOrSupervisor() || isTenantOwner());
      }
      if (statsResult.status === 'fulfilled') {
        const p = statsResult.value?.data || statsResult.value;
        setStats({
          scanCount: Number(p?.scanCount || 0),
          orderCount: Number(p?.orderCount || 0),
          totalQuantity: Number(p?.totalQuantity || 0),
          totalAmount: Number(p?.totalAmount || 0),
        });
      }
      if (unreadResult.status === 'fulfilled') {
        const raw = unreadResult.value?.data ?? unreadResult.value;
        setUnreadCount(Number(raw || 0));
      }
    });
    return () => { mounted = false; };
  }, [setAuth, token]);

  const visibleMenu = menuItems.filter((m) => !m.admin || admin);

  return (
    <div className="page-home">
      <div className="home-header">
        <div className="greeting-name">{storeUser?.name || storeUser?.realName || storeUser?.username || '未知用户'}，{getGreeting()}</div>
        <div className="greeting-sub">欢迎使用衣智链</div>
      </div>

      <DateCard />

      <div className="menu-section">
        <div className="section-header">
          <span className="section-title">全部菜单</span>
        </div>
        <div className="menu-grid">
          {visibleMenu.map((item) => (
            <div key={item.path + item.label} className="menu-item" onClick={() => navigate(item.path)}>
              <div className="menu-icon-circle">{item.icon}</div>
              <span className="menu-name">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
