import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { getGreeting, toast } from '@/utils/uiHelper';
import { isAdminOrSupervisor } from '@/utils/permission';
import { isTenantOwner } from '@/utils/storage';
import DateCard from '@/components/DateCard';

const menuItems = [
  { path: '/dashboard', label: '进度看板', tone: 'blue', icon: '📊', admin: true },
  { path: '/work', label: '生产', tone: 'green', icon: '🏭' },
  { path: '/scan', label: '扫码质检', tone: 'blue', icon: '◉' },
  { path: '/work/bundle-split', label: '菲号单价', tone: 'indigo', icon: '🏷️' },
  { path: '/scan/history', label: '历史记录', tone: 'indigo', icon: '📋' },
  { path: '/payroll/payroll', label: '当月工资', tone: 'orange', icon: '💰' },
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

  const handleMenuClick = (item) => {
    navigate(item.path);
  };

  return (
    <div className="home-stack">
      <section className="hero-card">
        <div>
          <div className="eyebrow">{getGreeting()}</div>
          <h2 className="hero-title">{storeUser?.name || storeUser?.realName || storeUser?.username || '用户'}</h2>
          <p className="hero-subtitle">
            {tenantName ? `${tenantName} · ` : ''}未读通知 {unreadCount} 条
          </p>
        </div>
      </section>

      <DateCard />

      <section className="stats-grid">
        <div className="stat-card tone-blue">
          <div className="stat-number">{stats.scanCount}</div>
          <div className="stat-label">今日扫码</div>
        </div>
        <div className="stat-card tone-green">
          <div className="stat-number">{stats.orderCount}</div>
          <div className="stat-label">参与订单</div>
        </div>
        <div className="stat-card tone-orange">
          <div className="stat-number">{stats.totalQuantity}</div>
          <div className="stat-label">累计件数</div>
        </div>
        <div className="stat-card tone-indigo">
          <div className="stat-number">¥{stats.totalAmount.toFixed(2)}</div>
          <div className="stat-label">累计金额</div>
        </div>
      </section>

      <section className="menu-grid">
        {visibleMenu.map((item) => (
          <button
            key={item.path + item.label}
            className={`menu-card tone-${item.tone}`}
            onClick={() => handleMenuClick(item)}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
            <div className="menu-card-label">{item.label}</div>
          </button>
        ))}
      </section>
    </div>
  );
}
