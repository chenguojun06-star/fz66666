import React from 'react';
import { Button } from 'antd';
import { BookOutlined, NotificationOutlined, RightOutlined, RobotOutlined } from '@ant-design/icons';
import { paths } from '@/routeConfig';
import { useLayoutAuth } from '@/components/Layout/useLayoutAuth';
import { HOME_CHANGELOG } from './homeChangelog';

/**
 * D-526 首页聚水潭化：右侧常驻服务栏（对齐参考稿「产品更新/新手入门」形态）。
 * 只放真实内容：更新公告（静态配置 homeChangelog.ts）+ 教程 + 小云入口，
 * 不放假客服电话/假二维码。
 */
const ServiceSidebar: React.FC = () => {
  const { hasPermissionForPath, isFactoryAccount, factoryVisiblePaths, isTenantModuleEnabled } = useLayoutAuth();

  const canGo = (path: string) => {
    if (isFactoryAccount && !factoryVisiblePaths.has(path)) return false;
    return hasPermissionForPath(path) && isTenantModuleEnabled(path);
  };

  const showTutorial = canGo(paths.tutorial);
  const showXiaoyun = canGo(paths.intelligenceCenter);

  return (
    <div className="home-side-stack">
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">
            <NotificationOutlined style={{ marginRight: 6 }} />
            产品更新
          </h3>
        </div>
        <div className="card-content home-changelog">
          {HOME_CHANGELOG.map((item) => (
            <div key={`${item.date}-${item.text}`} className="home-changelog-item">
              <span className="home-changelog-date">{item.date}</span>
              <span className="home-changelog-text">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {showTutorial && (
        <div className="dashboard-card">
          <div className="card-content home-side-entry">
            <span className="home-side-entry-icon"><BookOutlined /></span>
            <div className="home-side-entry-body">
              <div className="home-side-entry-title">新手入门</div>
              <div className="home-side-entry-desc">功能引导与常见操作教程</div>
            </div>
            <Button type="link" size="small" href={paths.tutorial} style={{ padding: 0 }}>
              去看看<RightOutlined style={{ fontSize: 10, marginLeft: 2 }} />
            </Button>
          </div>
        </div>
      )}

      {showXiaoyun && (
        <div className="dashboard-card">
          <div className="card-content home-side-entry">
            <span className="home-side-entry-icon home-side-entry-icon--ai"><RobotOutlined /></span>
            <div className="home-side-entry-body">
              <div className="home-side-entry-title">问小云</div>
              <div className="home-side-entry-desc">AI 助手：查数据、追生产、盯异常</div>
            </div>
            <Button type="link" size="small" href={paths.intelligenceCenter} style={{ padding: 0 }}>
              去看看<RightOutlined style={{ fontSize: 10, marginLeft: 2 }} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceSidebar;
