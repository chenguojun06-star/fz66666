import React, { useState, useMemo } from 'react';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { TaskItem } from './types';
import styles from './TaskListView.module.css';

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '紧急', color: '#cf1322', bg: '#fff1f0' },
  medium: { label: '一般', color: '#d48806', bg: '#fffbe6' },
  low: { label: '低', color: '#389e0d', bg: '#f6ffed' },
};

const MODULE_LABELS: Record<string, string> = {
  production: '生产', style: '样衣', warehouse: '仓库',
  procurement: '采购', quality: '质检', finance: '财务', system: '系统',
};

interface Props {
  tasks: TaskItem[];
  loading: boolean;
  onClaim: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (task: TaskItem) => void;
  onCreate: () => void;
  onOpenInFrame: (path: string, label: string) => void;
}

const TaskListView: React.FC<Props> = ({ tasks, loading, onClaim, onComplete, onEdit, onCreate, onOpenInFrame }) => {
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusTab !== 'all') result = result.filter(t => t.status === statusTab);
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(kw) ||
        (t.orderNo && t.orderNo.toLowerCase().includes(kw)) ||
        (t.styleNo && t.styleNo.toLowerCase().includes(kw))
      );
    }
    return result;
  }, [tasks, statusTab, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length };
    for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
    return counts;
  }, [tasks]);

  const handleCardClick = (task: TaskItem) => {
    if (task.source === 'system' && task.deepLinkPath) {
      onOpenInFrame(task.deepLinkPath, task.title);
    } else {
      onEdit(task);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchOutlined className={styles.searchIcon} />
          <input className={styles.searchInput} placeholder="搜索任务/订单号/款号..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={styles.createBtn} onClick={onCreate}><PlusOutlined />新建任务</button>
      </div>

      <div className={styles.filterRow}>
        {STATUS_TABS.map(tab => (
          <button key={tab.key}
            className={`${styles.filterChip} ${statusTab === tab.key ? styles.filterChipActive : ''}`}
            onClick={() => setStatusTab(tab.key)}>
            {tab.label} ({statusCounts[tab.key] || 0})
          </button>
        ))}
      </div>

      <div className={styles.listArea}>
        {filtered.map(task => {
          const isSystem = task.source === 'system';
          return (
            <div key={task.id}
              className={`${styles.taskCard} ${isSystem ? styles.taskCardSystem : ''}`}
              onClick={() => handleCardClick(task)}>
              <div className={styles.taskCardTop}>
                <span className={styles.priorityTag} style={{ color: PRIORITY_CONFIG[task.priority]?.color, background: PRIORITY_CONFIG[task.priority]?.bg }}>
                  {PRIORITY_CONFIG[task.priority]?.label || '一般'}
                </span>
                <span className={styles.moduleTag}>{MODULE_LABELS[task.module] || task.module}</span>
                {isSystem && <span className={styles.sysTag}>系统</span>}
                <span className={styles.taskTitle}>{task.title}</span>
              </div>
              <div className={styles.taskCardBottom}>
                <div className={styles.taskMeta}>
                  {task.orderNo && <span>📦 {task.orderNo}</span>}
                  {task.assigneeName && <span>👤 {task.assigneeName}</span>}
                  {task.endTime && <span>📅 {task.endTime.slice(0, 10)}</span>}
                </div>
                <div className={styles.taskActions} onClick={e => e.stopPropagation()}>
                  {!isSystem && task.status === 'pending' && (
                    <>
                      <button className={`${styles.actionBtn} ${styles.claimBtn}`} onClick={() => onClaim(task.id)}>领取</button>
                      <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => onEdit(task)}>编辑</button>
                    </>
                  )}
                  {!isSystem && task.status === 'in_progress' && (
                    <>
                      <button className={`${styles.actionBtn} ${styles.completeBtn}`} onClick={() => onComplete(task.id)}>完成</button>
                      <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => onEdit(task)}>编辑</button>
                    </>
                  )}
                  {isSystem && task.deepLinkPath && (
                    <button className={`${styles.actionBtn} ${styles.claimBtn}`}
                      onClick={() => onOpenInFrame(task.deepLinkPath!, task.title)}>
                      打开
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className={styles.emptyState}>
            <span style={{ fontSize: 32 }}>📋</span>
            <span>暂无任务</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(TaskListView);