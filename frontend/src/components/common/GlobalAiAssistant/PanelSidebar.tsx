import React from 'react';
import styles from './index.module.css';
import type { PanelView } from './types';

interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  highPriority: number;
}

interface PanelSidebarProps {
  showSidebar: boolean;
  panelView: PanelView;
  switchToChat: () => void;
  switchToTasks: () => void;
  taskStats: TaskStats;
}

const PanelSidebar: React.FC<PanelSidebarProps> = ({
  showSidebar,
  panelView,
  switchToChat,
  switchToTasks,
  taskStats,
}) => {
  if (showSidebar) {
    return (
      <div className={styles.sidebar}>
        <button
          className={`${styles.sidebarItem} ${panelView === 'chat' ? styles.sidebarItemActive : ''}`}
          onClick={switchToChat}
          title="对话"
        >
          💬 <span className={styles.sidebarLabel}>对话</span>
        </button>
        <button
          className={`${styles.sidebarItem} ${panelView === 'tasks' ? styles.sidebarItemActive : ''}`}
          onClick={switchToTasks}
          title="任务"
        >
          📋 <span className={styles.sidebarLabel}>任务</span>
          {taskStats.pending > 0 && <span className={styles.sidebarBadge}>{taskStats.pending}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.bottomNav}>
      <button
        className={`${styles.bottomNavItem} ${panelView === 'chat' ? styles.bottomNavItemActive : ''}`}
        onClick={switchToChat}
      >
        💬
      </button>
      <button
        className={`${styles.bottomNavItem} ${panelView === 'tasks' ? styles.bottomNavItemActive : ''}`}
        onClick={switchToTasks}
      >
        📋
        {taskStats.pending > 0 && <span className={styles.bottomNavBadge}>{taskStats.pending}</span>}
      </button>
    </div>
  );
};

export default PanelSidebar;
