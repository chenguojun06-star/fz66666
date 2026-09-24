import React from 'react';
import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useLayoutAuth } from '@/components/Layout/useLayoutAuth';
import { QuickEntryConfig } from './quickEntryConfig';

interface HomeQuickGridProps {
  entries: QuickEntryConfig[];
  onOpenSettings: () => void;
}

/**
 * D-526 首页聚水潭化：首屏快捷宫格（原 QuickEntryCard 只占底部小卡）。
 * 入口按菜单权限过滤：无权限/租户未开通/工厂账号不可见的入口不渲染，
 * 不给死链接（旧版宫格没做这层，工人账号会点进财务页看空数据）。
 */
const HomeQuickGrid: React.FC<HomeQuickGridProps> = ({ entries, onOpenSettings }) => {
  const { hasPermissionForPath, isFactoryAccount, factoryVisiblePaths, isTenantModuleEnabled } = useLayoutAuth();

  const visibleEntries = entries.filter((entry) => {
    if (!entry.enabled) return false;
    if (isFactoryAccount && !factoryVisiblePaths.has(entry.href)) return false;
    return hasPermissionForPath(entry.href) && isTenantModuleEnabled(entry.href);
  });

  return (
    <div className="dashboard-card home-card">
      <div className="card-header">
        <h3 className="card-title">常用功能</h3>
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={onOpenSettings}
          title="设置常用功能"
          style={{ color: 'var(--color-text-tertiary)' }}
        />
      </div>
      <div className="card-content">
        <div className="home-quick-grid">
          {visibleEntries.map((entry) => (
            <a
              key={entry.id}
              href={entry.href}
              className="home-quick-item"
              title={entry.label}
            >
              <span className={`home-quick-icon entry-icon--${entry.className}`}>{entry.icon}</span>
              <span className="home-quick-label">{entry.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomeQuickGrid;
