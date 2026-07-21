import React from 'react';
import { WidgetKey } from '../helpers';

interface SidebarModuleCardProps {
  moduleKey: WidgetKey;
  children: React.ReactNode;
}

/**
 * 侧边栏可拖拽模块卡片容器：包装单个图表组件，提供拖拽源能力。
 */
const SidebarModuleCard: React.FC<SidebarModuleCardProps> = ({ moduleKey, children }) => {
  return (
    <div className="cockpit-sidebar-section">
      <div
        className="cockpit-module-card"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/module-key', moduleKey);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SidebarModuleCard;
