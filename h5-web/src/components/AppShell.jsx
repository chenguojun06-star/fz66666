import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import AiAssistantFloat from './AiAssistantFloat';

const TABS = [
  { path: '/home', icon: '⌂', label: '首页' },
  { path: '/work', icon: '◫', label: '生产' },
  { path: '/scan', icon: '◉', label: '扫码' },
  { path: '/admin', icon: '☻', label: '我的' },
];

export default function AppShell({ children, isTab }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const tenantName = useAuthStore((state) => state.tenantName);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const isSubpage = !isTab;
  const pageTitle = getPageTitle(location.pathname);

  const onLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSubpage && (
            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-primary)', padding: 0 }}>
              ‹
            </button>
          )}
          <div>
            <div className="topbar-title">{pageTitle}</div>
            {isTab && (
              <div className="topbar-subtitle">
                {tenantName ? `${tenantName} · ` : ''}
                {user?.name || user?.realName || user?.username || '未登录'}
              </div>
            )}
          </div>
        </div>
        {isTab && (
          <button className="ghost-button" onClick={onLogout} style={{ fontSize: 12 }}>
            退出
          </button>
        )}
      </header>

      <main className="page-container">{children}</main>

      {isTab && (
        <nav className="tabbar">
          {TABS.map((tab) => {
            const matched = location.pathname === tab.path;
            return (
              <NavLink key={tab.path} to={tab.path} className={`tabbar-item${matched ? ' active' : ''}`}>
                <span className="tabbar-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      <AiAssistantFloat />
    </div>
  );
}

function getPageTitle(pathname) {
  const titleMap = {
    '/home': '服装供应链',
    '/work': '生产管理',
    '/scan': '扫码操作',
    '/admin': '个人中心',
    '/dashboard': '进度看板',
    '/work/inbox': '通知消息',
    '/work/ai-assistant': 'AI助手',
    '/work/bundle-split': '菲号拆分',
    '/scan/history': '扫码历史',
    '/scan/scan-result': '扫码结果',
    '/scan/confirm': '扫码确认',
    '/scan/quality': '质检录入',
    '/scan/rescan': '退回重扫',
    '/scan/pattern': '样板操作',
    '/admin/change-password': '修改密码',
    '/admin/feedback': '问题反馈',
    '/admin/invite': '邀请员工',
    '/admin/user-approval': '用户审批',
    '/payroll/payroll': '工资查询',
    '/privacy': '隐私政策',
    '/privacy/service': '用户服务协议',
    '/cutting/task-list': '裁剪任务',
    '/cutting/task-detail': '裁剪详情',
    '/procurement/task-detail': '采购详情',
    '/warehouse/material/scan': '面辅料扫码',
    '/warehouse/sample/scan-action': '样衣扫码',
  };
  return titleMap[pathname] || '服装供应链';
}
