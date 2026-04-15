import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import { isAdminOrSupervisor, getRoleDisplayName } from '@/utils/permission';

const menuConfig = [
  { path: '/admin/change-password', label: '修改密码', icon: '🔑', roles: null },
  { path: '/payroll/payroll', label: '工资查询', icon: '💰', roles: null },
  { path: '/admin/feedback', label: '问题反馈', icon: '💬', roles: null },
  { path: '/admin/invite', label: '邀请员工', icon: '👥', roles: ['admin', 'supervisor', 'tenant_owner'] },
  { path: '/admin/user-approval', label: '用户审批', icon: '✅', roles: ['admin', 'supervisor', 'tenant_owner'] },
  { path: '/dashboard', label: '进度看板', icon: '📊', roles: ['admin', 'supervisor', 'tenant_owner'] },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenantName = useAuthStore((s) => s.tenantName);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (isAdminOrSupervisor()) {
      api.system.onlineCount().then((res) => {
        setOnlineCount(Number((res?.data ?? res) || 0));
      }).catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    if (!window.confirm('确定退出登录？')) return;
    clearAuth();
    navigate('/login', { replace: true });
  };

  const copyFactoryCode = () => {
    const code = user?.tenantCode || user?.factoryCode || '';
    if (!code) { toast.info('暂无工厂码'); return; }
    navigator.clipboard.writeText(code).then(() => toast.success('工厂码已复制')).catch(() => toast.error('复制失败'));
  };

  const copyRegisterLink = () => {
    const code = user?.tenantCode || user?.factoryCode || '';
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/register?inviteToken=${code}`;
    navigator.clipboard.writeText(link).then(() => toast.success('注册链接已复制')).catch(() => toast.error('复制失败'));
  };

  const visibleMenu = menuConfig.filter((m) => {
    if (!m.roles) return true;
    const role = user?.role || '';
    return m.roles.includes(role) || (role === 'tenant_owner' && m.roles.includes('admin'));
  });

  const avatarUrl = user?.avatarImgUrl || user?.avatar || '';
  const displayName = user?.name || user?.realName || user?.username || '用户';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div style={{ padding: '16px', paddingBottom: 'calc(80px + var(--safe-area-bottom, 0px))' }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(var(--color-primary-rgb),0.08) 0%, rgba(var(--color-primary-rgb),0.02) 100%)',
        borderRadius: 16, padding: '20px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
      }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-border-light)' }}
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        ) : null}
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff',
          display: avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700, flexShrink: 0,
        }}>{initial}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{displayName}</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {getRoleDisplayName(user?.role)} {tenantName ? `· ${tenantName}` : ''}
          </div>
          {onlineCount > 0 && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              在线 {onlineCount} 人
            </div>
          )}
        </div>
      </div>

      {user?.tenantCode && (
        <div style={{
          background: 'var(--color-bg-card)', borderRadius: 12, padding: '14px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
          border: '1px solid var(--color-border-light)',
        }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>工厂码</div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, letterSpacing: 2, marginTop: 2 }}>{user.tenantCode}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost-button" onClick={copyFactoryCode} style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}>复制</button>
            <button className="ghost-button" onClick={copyRegisterLink} style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}>注册链接</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 12, overflow: 'hidden', background: 'var(--color-border-light)' }}>
        {visibleMenu.map((item) => (
          <button key={item.path} onClick={() => navigate(item.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: 'var(--color-bg-card)', border: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)',
            }}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            <span style={{ color: 'var(--color-text-disabled)' }}>›</span>
          </button>
        ))}
      </div>

      <button onClick={handleLogout}
        style={{
          width: '100%', marginTop: 24, padding: '14px', borderRadius: 12,
          border: '1px solid var(--color-danger)', background: 'transparent',
          color: 'var(--color-danger)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer',
        }}>
        退出登录
      </button>
    </div>
  );
}
