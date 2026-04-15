import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import { isAdminOrSupervisor, getRoleDisplayName } from '@/utils/permission';
import Icon from '@/components/Icon';

const primaryMenu = [
  { path: '/admin/change-password', label: '修改密码', icon: 'lock', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)' },
  { path: '/payroll/payroll', label: '工资查询', icon: 'dollarSign', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
  { path: '/admin/feedback', label: '问题反馈', icon: 'messageCircle', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)' },
];

const secondaryMenu = [
  { path: '/admin/invite', label: '员工邀请', icon: 'userPlus', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)' },
  { path: '/admin/user-approval', label: '用户审批', icon: 'userCheck', color: 'var(--color-info)', bg: 'rgba(16,174,255,0.1)', roles: ['admin', 'supervisor', 'tenant_owner'] },
  { path: '/dashboard', label: '进度看板', icon: 'chart', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)', roles: ['admin', 'supervisor', 'tenant_owner'] },
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

  const visibleSecondary = secondaryMenu.filter((m) => {
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
                <Icon name="users" size={14} color="var(--color-text-secondary)" />
                <span>{onlineCount}人</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="admin-menu-grid">
        {primaryMenu.map((item) => (
          <button key={item.path} className="admin-menu-card" onClick={() => navigate(item.path)}>
            <div className="admin-menu-icon-wrap" style={{ background: item.bg }}>
              <Icon name={item.icon} size={22} color={item.color} />
            </div>
            <span className="admin-menu-card-label">{item.label}</span>
          </button>
        ))}
      </div>

      {visibleSecondary.length > 0 && (
        <div className="admin-menu-list">
          {visibleSecondary.map((item) => (
            <button key={item.path} className="admin-menu-item" onClick={() => navigate(item.path)}>
              <div className="admin-menu-icon-wrap" style={{ background: item.bg }}>
                <Icon name={item.icon} size={18} color={item.color} />
              </div>
              <span className="admin-menu-label">{item.label}</span>
              <span className="admin-menu-arrow">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
