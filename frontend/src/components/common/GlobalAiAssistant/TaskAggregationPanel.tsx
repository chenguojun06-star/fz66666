import React, { useState, useMemo, useCallback } from 'react';
import { CloseOutlined, RightOutlined, MessageOutlined } from '@ant-design/icons';
import type { PendingTaskDTO } from '@/services/intelligence/intelligenceApi';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { useDebouncedValue } from '@/hooks/usePerformance';
import styles from './TaskAggregationPanel.module.css';

interface TaskAggregationPanelProps {
  tasks: PendingTaskDTO[];
  onClose: () => void;
  onNavigate: (path: string) => void;
  onBackToChat?: () => void;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  high: { label: '紧急', color: '#cf1322', bg: '#fff1f0', border: '#ffa39e' },
  medium: { label: '一般', color: '#d48806', bg: '#fffbe6', border: '#ffe58f' },
  low: { label: '低', color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' },
};

const MODULE_LABELS: Record<string, string> = {
  production: '生产管理',
  style: '样衣管理',
  finance: '财务管理',
  warehouse: '成品管理',
  system: '系统',
};

const TaskAggregationPanel: React.FC<TaskAggregationPanelProps> = ({ tasks, onClose, onNavigate, onBackToChat }) => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const debouncedSearchKeyword = useDebouncedValue(searchKeyword, 200);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; tasks: PendingTaskDTO[] }> = {};
    for (const t of tasks) {
      const key = t.taskType;
      if (!groups[key]) {
        groups[key] = {
          label: t.categoryLabel || key,
          icon: t.categoryIcon || '📌',
          tasks: [],
        };
      }
      groups[key].tasks.push(t);
    }
    return groups;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    // '__high__' 是紧急优先级筛选，不按 taskType 过滤，后续在渲染层用 priority==='high' 筛选
    if (activeFilter !== 'all' && activeFilter !== '__high__') {
      result = result.filter(t => t.taskType === activeFilter);
    }
    if (debouncedSearchKeyword.trim()) {
      const kw = debouncedSearchKeyword.trim().toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(kw) ||
        t.description.toLowerCase().includes(kw) ||
        (t.orderNo && t.orderNo.toLowerCase().includes(kw)) ||
        (t.styleNo && t.styleNo.toLowerCase().includes(kw))
      );
    }
    // 防御性去重：按 id 保留首次出现的任务（正常应由后端保证唯一）
    const seenIds = new Set<string>();
    result = result.filter(t => {
      if (!t.id || seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return true;
    });
    return result;
  }, [tasks, activeFilter, debouncedSearchKeyword]);

  const filteredGroups = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; tasks: PendingTaskDTO[] }> = {};
    for (const t of filteredTasks) {
      const key = t.taskType;
      if (!groups[key]) {
        groups[key] = {
          label: t.categoryLabel || key,
          icon: t.categoryIcon || '📌',
          tasks: [],
        };
      }
      groups[key].tasks.push(t);
    }
    return groups;
  }, [filteredTasks]);

  const handleTaskClick = useCallback((task: PendingTaskDTO) => {
    let path = task.deepLinkPath || '/production';
    const params: string[] = [];
    if (task.orderNo) params.push(`orderNo=${encodeURIComponent(task.orderNo)}`);
    if (task.styleNo) params.push(`styleNo=${encodeURIComponent(task.styleNo)}`);
    if (params.length > 0) {
      path += (path.includes('?') ? '&' : '?') + params.join('&');
    }
    onNavigate(path);
  }, [onNavigate]);

  const highCount = tasks.filter(t => t.priority === 'high').length;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <XiaoyunCloudAvatar size={28} active mood={highCount > 0 ? 'urgent' : 'normal'} />
          <div className={styles.panelHeaderText}>
            <div className={styles.panelTitle}>全域待办任务</div>
            <div className={styles.panelSubtitle}>
              共 {tasks.length} 项{highCount > 0 && `，${highCount} 项紧急`}
            </div>
          </div>
        </div>
        {onBackToChat && (
          <button className={styles.panelBackBtn} onClick={onBackToChat} title="返回聊天">
            <MessageOutlined style={{ fontSize: 14 }} />
          </button>
        )}
        <button className={styles.panelCloseBtn} onClick={onClose}>
          <CloseOutlined style={{ fontSize: 12 }} />
        </button>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="搜索订单号/款号/任务..."
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
        />
      </div>

      <div className={styles.filterRow}>
        <button
          className={`${styles.filterChip} ${activeFilter === 'all' ? styles.filterChipActive : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          全部 ({tasks.length})
        </button>
        {highCount > 0 && (
          <button
            className={`${styles.filterChip} ${activeFilter === '__high__' ? styles.filterChipActive : ''}`}
            onClick={() => setActiveFilter(activeFilter === '__high__' ? 'all' : '__high__')}
            style={activeFilter === '__high__' ? { background: '#fff1f0', borderColor: '#ffa39e', color: '#cf1322' } : {}}
          >
            🔴 紧急 ({highCount})
          </button>
        )}
        {Object.entries(groupedTasks).map(([key, group]) => (
          <button
            key={key}
            className={`${styles.filterChip} ${activeFilter === key ? styles.filterChipActive : ''}`}
            onClick={() => setActiveFilter(activeFilter === key ? 'all' : key)}
          >
            {group.icon} {group.label} ({group.tasks.length})
          </button>
        ))}
      </div>

      <div className={styles.taskList}>
        {activeFilter === '__high__' ? (
          filteredTasks.filter(t => t.priority === 'high').map(task => (
            <TaskItem key={task.id} task={task} onClick={handleTaskClick} />
          ))
        ) : (
          Object.entries(filteredGroups).map(([key, group]) => (
            <div key={key} className={styles.groupSection}>
              <div className={styles.groupHeader}>
                <span className={styles.groupIcon}>{group.icon}</span>
                <span className={styles.groupLabel}>{group.label}</span>
                <span className={styles.groupCount}>{group.tasks.length}</span>
              </div>
              {group.tasks.map(task => (
                <TaskItem key={task.id} task={task} onClick={handleTaskClick} />
              ))}
            </div>
          ))
        )}
        {filteredTasks.length === 0 && (
          <div className={styles.emptyState}>
            <XiaoyunCloudAvatar size={40} active mood="success" />
            <div className={styles.emptyText}>暂无待办任务，一切顺利！</div>
          </div>
        )}
      </div>
    </div>
  );
};

/** 将时间字符串格式化为 MM-DD HH:mm（纯日期则仅显示 MM-DD） */
function fmtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const normalized = iso.includes(' ') ? iso.replace(' ', 'T') : iso;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (!normalized.includes('T')) {
      return `${m}-${day}`;
    }
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  } catch {
    return null;
  }
}

const TaskItem: React.FC<{
  task: PendingTaskDTO;
  onClick: (task: PendingTaskDTO) => void;
}> = ({ task, onClick }) => {
  const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const moduleLabel = MODULE_LABELS[task.module] || task.module;

  const startText = fmtDateTime(task.startTime);
  const endText = fmtDateTime(task.endTime);
  const showExtra = task.quantity != null || !!startText || !!endText || !!task.assigneeName || !!task.assigneeRole;

  return (
    <div
      className={styles.taskItem}
      style={{ borderLeftColor: prio.color }}
      onClick={() => onClick(task)}
    >
      <div className={styles.taskItemTop}>
        <span className={styles.taskPriorityTag} style={{ color: prio.color, background: prio.bg, borderColor: prio.border }}>
          {prio.label}
        </span>
        <span className={styles.taskModuleTag}>{moduleLabel}</span>
        <span className={styles.taskTitle}>{task.title}</span>
      </div>
      <div className={styles.taskItemBottom}>
        <span className={styles.taskDesc}>{task.description}</span>
        {(task.orderNo || task.styleNo) && (
          <span className={styles.taskRef}>
            {task.orderNo && <span className={styles.taskRefNo}>{task.orderNo}</span>}
            {task.styleNo && <span className={styles.taskRefNo}>{task.styleNo}</span>}
          </span>
        )}
        <RightOutlined className={styles.taskArrow} />
      </div>
      {showExtra && (
        <div className={styles.taskExtraInfo}>
          {task.quantity != null && (
            <span className={styles.taskExtraItem}>
              <span className={styles.taskExtraLabel}>数量</span>
              <span className={styles.taskExtraValue}>{task.quantity}件</span>
            </span>
          )}
          {startText && (
            <span className={styles.taskExtraItem}>
              <span className={styles.taskExtraLabel}>开始</span>
              <span className={styles.taskExtraValue}>{startText}</span>
            </span>
          )}
          {endText && (
            <span className={styles.taskExtraItem}>
              <span className={styles.taskExtraLabel}>截止</span>
              <span className={styles.taskExtraValue}>{endText}</span>
            </span>
          )}
          {task.assigneeName && (
            <span className={styles.taskExtraItem}>
              <span className={styles.taskExtraLabel}>{task.assigneeRole || '领取人'}</span>
              <span className={styles.taskExtraValue}>{task.assigneeName}</span>
            </span>
          )}
          {!task.assigneeName && task.assigneeRole && (
            <span className={styles.taskExtraItem}>
              <span className={styles.taskExtraLabel}>负责人</span>
              <span className={styles.taskExtraValue}>{task.assigneeRole}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskAggregationPanel;
