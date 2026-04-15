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
      api.system.getOnlineCount().then((res) => {
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
  const displayName = user?.name || user?.realName || user?.username || '未知用户';
  const displayRole = getRoleDisplayName(user?.role) || '普通用户';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="admin-container">
      <div className="user-profile-card">
        <div className="profile-header">
          <div className="profile-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.textContent = initial; }} />
            ) : (
              initial
            )}
          </div>
          <div className="profile-info">
            <div className="profile-name-row">
              <span className="profile-name">{displayName}</span>
              <button className="logout-btn" onClick={handleLogout}>
                <span className="logout-text">退出</span>
              </button>
            </div>
            <div className="profile-role">{displayRole}</div>
            {onlineCount > 0 && (
              <div className="profile-online">
                <span>👥</span>
                <span>{onlineCount}人</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="admin-menu-list">
        {visibleMenu.map((item) => (
          <button key={item.path} className="admin-menu-item" onClick={() => navigate(item.path)}>
            <div className="admin-menu-icon-wrap">{item.icon}</div>
            <span className="admin-menu-label">{item.label}</span>
            <span className="admin-menu-arrow">›</span>
          </button>
        ))}
      </div>

      {(isAdminOrSupervisor() || user?.role === 'tenant_owner') && (
        <div className="admin-menu-list" style={{ marginTop: 12 }}>
          <div className="admin-menu-item" style={{ cursor: 'default' }}>
            <div className="admin-menu-icon-wrap">🏭</div>
            <span className="admin-menu-label" style={{ flex: 1 }}>工厂码</span>
            <button className="ghost-button" style={{ fontSize: 'var(--font-size-xs)', padding: '2px 10px' }} onClick={copyFactoryCode}>复制</button>
          </div>
          <div className="admin-menu-item" style={{ cursor: 'default' }}>
            <div className="admin-menu-icon-wrap">🔗</div>
            <span className="admin-menu-label" style={{ flex: 1 }}>注册链接</span>
            <button className="ghost-button" style={{ fontSize: 'var(--font-size-xs)', padding: '2px 10px' }} onClick={copyRegisterLink}>复制</button>
          </div>
        </div>
      )}

      <button className="admin-logout-btn" onClick={handleLogout}>退出登录</button>
    </div>
  );
}
