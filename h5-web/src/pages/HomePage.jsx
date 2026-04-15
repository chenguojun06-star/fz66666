import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';

const MENU_ITEMS = [
  { label: '进度看板', icon: 'chart', path: '/dashboard', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)' },
  { label: '生产', icon: 'factory', path: '/work', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)' },
  { label: '扫码质检', icon: 'scan', path: '/scan', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)' },
  { label: '菲号单价', icon: 'tag', path: '/work/bundle-split', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
  { label: '历史记录', icon: 'clipboard', path: '/scan/history', color: 'var(--color-info)', bg: 'rgba(16,174,255,0.1)' },
  { label: '当月工资', icon: 'dollarSign', path: '/payroll/payroll', color: 'var(--color-error)', bg: 'rgba(250,81,81,0.1)' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user, tenantName, setAuth, token } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.system.getMe().then(res => {
      const u = res?.data || res;
      if (u && token) setAuth(token, u);
    }).catch(() => {});
    api.production.personalScanStats().then(res => {
      const p = res?.data || res;
      if (p) {
        setStats({
          scanCount: Number(p.scanCount ?? p.todayScanCount ?? 0),
          totalQuantity: Number(p.totalQuantity ?? p.quantity ?? 0),
          totalAmount: Number(p.totalAmount ?? p.amount ?? 0),
        });
      }
    }).catch(() => {});
    api.notice.unreadCount().then(res => {
      setUnreadCount(Number(res?.data ?? (res || 0)));
    }).catch(() => {});
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  };

  const storeUser = user || {};
  const displayName = storeUser.name || storeUser.realName || storeUser.username || '未知用户';
  const visibleMenu = MENU_ITEMS.filter(m => !m.roles || m.roles.includes((storeUser.role || '').toLowerCase()));

  return (
    <div className="home-page">
      {/* === 上区：用户问候 === */}
      <div className="home-section-top">
        <div className="card-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(var(--color-primary-rgb), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="home" size={24} color="var(--color-primary)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{displayName}，{getGreeting()}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3 }}>{tenantName || '欢迎使用衣智链'}</div>
            </div>
            {unreadCount > 0 && (
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/work/inbox')}>
                <Icon name="bell" size={22} color="var(--color-text-secondary)" />
                <span style={{ position: 'absolute', top: -4, right: -6, background: 'var(--color-danger)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === 中区：功能菜单 === */}
      <div className="home-section-mid">
        <div className="card-item">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--color-text-primary)' }}>功能菜单</div>
          <div className="menu-grid">
            {visibleMenu.map((item, idx) => (
              <div key={idx} className="menu-item" onClick={() => navigate(item.path)}>
                <div className="menu-icon-circle" style={{ background: item.bg }}>
                  <Icon name={item.icon} size={26} color={item.color} />
                </div>
                <span className="menu-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === 下区：今日数据 === */}
      <div className="home-section-bot">
        {stats && (stats.scanCount > 0 || stats.totalQuantity > 0) && (
          <div className="card-item">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--color-text-primary)' }}>今日扫码</div>
            <div style={{ display: 'flex', textAlign: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>{stats.scanCount}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>次数</div>
              </div>
              <div style={{ width: 1, background: 'var(--color-border-light)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success)' }}>{stats.totalQuantity}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>数量</div>
              </div>
              <div style={{ width: 1, background: 'var(--color-border-light)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-warning)' }}>¥{stats.totalAmount.toFixed(0)}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>收入</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
