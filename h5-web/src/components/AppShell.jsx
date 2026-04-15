import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import AiAssistantFloat from './AiAssistantFloat';
import Icon from '@/components/Icon';

const TABS = [
  { path: '/home', icon: 'chart', activeIcon: 'chart', label: '首页' },
  { path: '/work', icon: 'factory', activeIcon: 'factory', label: '生产' },
  { path: '/scan', icon: 'scan', activeIcon: 'scan', label: '扫码' },
  { path: '/admin', icon: 'users', activeIcon: 'users', label: '我的' },
];

import { TAB_PATHS } from '@/App';

export default function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const tenantName = useAuthStore((state) => state.tenantName);

  const isTab = TAB_PATHS.includes(location.pathname);
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="sub-page-row">
          {!isTab && (
            <button className="topbar-back-btn" onClick={() => navigate(-1)}>‹</button>
          )}
          <div>
            <div className="topbar-title">{pageTitle}</div>
            {isTab && (
              <div className="topbar-subtitle">
                {tenantName ? `${tenantName} · ` : ''}{user?.name || user?.realName || user?.username || ''}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="page-container">{children}</main>

      {isTab && (
        <nav className="tabbar">
          {TABS.map((tab) => {
            const matched = location.pathname === tab.path;
            return (
              <NavLink key={tab.path} to={tab.path} className={`tabbar-item${matched ? ' active' : ''}`}>
                <span className="tabbar-icon">
                  <Icon name={matched ? tab.activeIcon : tab.icon} size={32} />
                </span>
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
