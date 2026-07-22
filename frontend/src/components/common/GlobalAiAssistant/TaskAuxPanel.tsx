import React from 'react';
import styles from './index.module.css';

interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  highPriority: number;
}

interface TaskAuxPanelProps {
  taskStats: TaskStats;
  handleTaskCreate: () => void;
}

const TaskAuxPanel: React.FC<TaskAuxPanelProps> = ({ taskStats, handleTaskCreate }) => {
  return (
    <div className={styles.auxPanel}>
      <div className={styles.auxSectionTitle}>任务统计</div>
      <div className={styles.auxStatItem}>
        <span>全部</span>
        <span className={styles.auxStatValue}>{taskStats.total}</span>
      </div>
      <div className={styles.auxStatItem}>
        <span>待处理</span>
        <span className={styles.auxStatValue}>{taskStats.pending}</span>
      </div>
      <div className={styles.auxStatItem}>
        <span>进行中</span>
        <span className={styles.auxStatValue}>{taskStats.inProgress}</span>
      </div>
      <div className={styles.auxStatItem}>
        <span>已完成</span>
        <span className={styles.auxStatValue}>{taskStats.completed}</span>
      </div>
      <div className={styles.auxStatItem}>
        <span>紧急</span>
        <span className={styles.auxStatValue} style={{ color: 'var(--color-error)' }}>
          {taskStats.highPriority}
        </span>
      </div>
      <div className={styles.auxSectionTitle} style={{ marginTop: 20 }}>
        快捷操作
      </div>
      <button
        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
        style={{ width: '100%', marginTop: 8 }}
        onClick={handleTaskCreate}
      >
        + 新建任务
      </button>
    </div>
  );
};

export default TaskAuxPanel;
