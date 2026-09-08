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
  high: { label: '紧急', color: 'var(--color-error)', bg: 'var(--color-bg-base)1F0' },
  medium: { label: '一般', color: 'var(--color-warning)', bg: 'var(--color-bg-base)BE6' },
  low: { label: '低', color: 'var(--color-success)', bg: 'var(--status-success-bg)' },
};

/**
 * 业务分类元数据：与后端 PendingTaskOrchestrator.CATEGORY_META 保持一致，
 * 统一待办面板按此分类分组展示，保证 PC/手机端/小云口径一致。
 */
const CATEGORY_META: Record<string, string> = {
  CUTTING_TASK: '裁剪任务',
  QUALITY_INSPECT: '质检待处理',
  REPAIR: '返修任务',
  MATERIAL_PURCHASE: '采购到货',
  OVERDUE_ORDER: '逾期订单',
  EXCEPTION_REPORT: '异常报告',
  STYLE_DEVELOPMENT: '样衣开发',
  PAYROLL_SETTLEMENT: '工资结算',
  MATERIAL_RECON: '物料对账',
  EXPENSE_REIMBURSE: '费用报销',
  SHIPMENT: '外发收货',
  SAMPLE_LOAN: '样衣借还',
  MATERIAL_PICKING: '领料出库',
};

/** 分类展示顺序：生产作业 → 样衣 → 订单外发 → 财务 → 仓储 */
const CATEGORY_ORDER = [
  'CUTTING_TASK', 'QUALITY_INSPECT', 'REPAIR', 'MATERIAL_PURCHASE',
  'STYLE_DEVELOPMENT',
  'OVERDUE_ORDER', 'EXCEPTION_REPORT', 'SHIPMENT',
  'PAYROLL_SETTLEMENT', 'MATERIAL_RECON', 'EXPENSE_REIMBURSE',
  'SAMPLE_LOAN', 'MATERIAL_PICKING',
];
const PERSONAL_GROUP_KEY = '__personal__';

/** 个人创建的任务归入"我的任务"组，系统任务按业务分类归组 */
function categoryOf(task: TaskItem): { key: string; label: string } {
  if (task.source === 'personal') {
    return { key: PERSONAL_GROUP_KEY, label: '我的任务' };
  }
  const label = CATEGORY_META[task.taskType];
  if (label) return { key: task.taskType, label };
  return { key: task.taskType || '__other__', label: task.categoryLabel || '其他' };
}

function groupOrder(key: string): number {
  if (key === PERSONAL_GROUP_KEY) return CATEGORY_ORDER.length + 1;
  const idx = CATEGORY_ORDER.indexOf(key);
  return idx >= 0 ? idx : CATEGORY_ORDER.length;
}

interface Props {
  tasks: TaskItem[];
  loading: boolean;
  currentUsername?: string;
  onClaim: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (task: TaskItem) => void;
  onCreate: () => void;
  onNavigate: (path: string) => void;
}

const TaskListView: React.FC<Props> = ({ tasks, loading, currentUsername, onClaim, onComplete, onEdit, onCreate, onNavigate }) => {
  const [categoryTab, setCategoryTab] = useState('all'); // all | __high__ | taskType
  const [scopeTab, setScopeTab] = useState('all');
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');

  // 归属筛选：全部 / 我创建的（creatorName 等于当前用户名）/ 我领取的（assigneeName 等于当前用户名）
  const scopedTasks = useMemo(() => {
    if (scopeTab === 'all' || !currentUsername) return tasks;
    const me = currentUsername;
    if (scopeTab === 'created') return tasks.filter(t => t.creatorName === me);
    if (scopeTab === 'mine') return tasks.filter(t => t.assigneeName === me);
    return tasks;
  }, [tasks, scopeTab, currentUsername]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scopedTasks.length, __high__: 0 };
    for (const t of scopedTasks) {
      if (t.priority === 'high') counts.__high__++;
      const key = categoryOf(t).key;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [scopedTasks]);

  const filtered = useMemo(() => {
    let result = scopedTasks;
    if (categoryTab === '__high__') {
      result = result.filter(t => t.priority === 'high');
    } else if (categoryTab !== 'all') {
      result = result.filter(t => categoryOf(t).key === categoryTab);
    }
    if (statusTab !== 'all') result = result.filter(t => t.status === statusTab);
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(kw) ||
        (t.description && t.description.toLowerCase().includes(kw)) ||
        (t.orderNo && t.orderNo.toLowerCase().includes(kw)) ||
        (t.styleNo && t.styleNo.toLowerCase().includes(kw))
      );
    }
    return result;
  }, [scopedTasks, categoryTab, statusTab, search]);

  // 分类分组：categoryTab=all 时按业务分类分组渲染；紧急筛选时平铺
  const groups = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    for (const t of filtered) {
      const key = categoryOf(t).key;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.keys(map)
      .sort((a, b) => groupOrder(a) - groupOrder(b))
      .map(groupKey => {
        const meta = categoryOf({ source: groupKey === PERSONAL_GROUP_KEY ? 'personal' : 'system', taskType: groupKey } as TaskItem);
        return { key: groupKey, label: meta.label, tasks: map[groupKey] };
      });
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scopedTasks.length };
    for (const t of scopedTasks) counts[t.status] = (counts[t.status] || 0) + 1;
    return counts;
  }, [scopedTasks]);

  const scopeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length, created: 0, mine: 0 };
    for (const t of tasks) {
      if (currentUsername && t.creatorName === currentUsername) counts.created++;
      if (currentUsername && t.assigneeName === currentUsername) counts.mine++;
    }
    return counts;
  }, [tasks, currentUsername]);

  const handleCardClick = (task: TaskItem) => {
    // 协作任务深链（xiaoyun://）指向的就是本统一面板，任务已在列表中，无需再跳转
    if (task.deepLinkPath && task.deepLinkPath.startsWith('xiaoyun://')) return;
    if (task.source === 'system' && task.deepLinkPath) {
      onNavigate(task.deepLinkPath);
    } else {
      onEdit(task);
    }
  };

  // 获取订单关联状态标签
  const getOrderLinkStatusLabel = (status?: string) => {
    switch (status) {
      case 'LINKED': return '已关联';
      case 'ORDER_NOT_FOUND': return '订单未找到';
      default: return '未关联';
    }
  };

  // 获取订单关联状态颜色
  const getOrderLinkStatusColor = (status?: string) => {
    switch (status) {
      case 'LINKED': return 'var(--color-success)';
      case 'ORDER_NOT_FOUND': return 'var(--color-error)';
      default: return 'var(--color-text-muted)';
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
        <button
          className={`${styles.filterChip} ${categoryTab === 'all' ? styles.filterChipActive : ''}`}
          onClick={() => setCategoryTab('all')}>
          全部 ({categoryCounts.all || 0})
        </button>
        {(categoryCounts.__high__ || 0) > 0 && (
          <button
            className={`${styles.filterChip} ${categoryTab === '__high__' ? styles.filterChipActive : ''}`}
            onClick={() => setCategoryTab(categoryTab === '__high__' ? 'all' : '__high__')}>
            紧急 ({categoryCounts.__high__})
          </button>
        )}
        {Object.keys(CATEGORY_META)
          .filter(key => (categoryCounts[key] || 0) > 0)
          .map(key => (
            <button
              key={key}
              className={`${styles.filterChip} ${categoryTab === key ? styles.filterChipActive : ''}`}
              onClick={() => setCategoryTab(categoryTab === key ? 'all' : key)}>
              {CATEGORY_META[key]} ({categoryCounts[key]})
            </button>
          ))}
        {(categoryCounts[PERSONAL_GROUP_KEY] || 0) > 0 && (
          <button
            className={`${styles.filterChip} ${categoryTab === PERSONAL_GROUP_KEY ? styles.filterChipActive : ''}`}
            onClick={() => setCategoryTab(categoryTab === PERSONAL_GROUP_KEY ? 'all' : PERSONAL_GROUP_KEY)}>
            我的任务 ({categoryCounts[PERSONAL_GROUP_KEY]})
          </button>
        )}
      </div>

      <div className={styles.filterRow}>
        {STATUS_TABS.map(tab => (
          <button key={tab.key}
            className={`${styles.filterChip} ${statusTab === tab.key ? styles.filterChipActive : ''}`}
            onClick={() => setStatusTab(tab.key)}>
            {tab.label} ({statusCounts[tab.key] || 0})
          </button>
        ))}
        <span className={styles.filterDivider} />
        {[{ key: 'all', label: '全部' }, { key: 'created', label: '我创建的' }, { key: 'mine', label: '我领取的' }].map(tab => (
          <button key={tab.key}
            className={`${styles.filterChip} ${scopeTab === tab.key ? styles.filterChipActive : ''}`}
            onClick={() => setScopeTab(tab.key)}>
            {tab.label} ({scopeCounts[tab.key] || 0})
          </button>
        ))}
      </div>

      <div className={styles.listArea}>
        {categoryTab === '__high__' ? (
          filtered.map(task => (
            <TaskCard key={task.id} task={task} onClick={handleCardClick}
              onClaim={onClaim} onComplete={onComplete} onEdit={onEdit}
              getOrderLinkStatusLabel={getOrderLinkStatusLabel} getOrderLinkStatusColor={getOrderLinkStatusColor} />
          ))
        ) : (
          groups.map(group => (
            <div key={group.key} className={styles.groupSection}>
              <div className={styles.groupHeader}>
                <span className={styles.groupLabel}>{group.label}</span>
                <span className={styles.groupCount}>{group.tasks.length}</span>
              </div>
              {group.tasks.map(task => (
                <TaskCard key={task.id} task={task} onClick={handleCardClick}
                  onClaim={onClaim} onComplete={onComplete} onEdit={onEdit}
                  getOrderLinkStatusLabel={getOrderLinkStatusLabel} getOrderLinkStatusColor={getOrderLinkStatusColor} />
              ))}
            </div>
          ))
        )}
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

const TaskCard: React.FC<{
  task: TaskItem;
  onClick: (task: TaskItem) => void;
  onClaim: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (task: TaskItem) => void;
  getOrderLinkStatusLabel: (status?: string) => string;
  getOrderLinkStatusColor: (status?: string) => string;
}> = ({ task, onClick, onClaim, onComplete, onEdit, getOrderLinkStatusLabel, getOrderLinkStatusColor }) => {
  const isSystem = task.source === 'system';
  const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  // 去重：title 已含订单号时 meta 不再重复显示（如系统任务 title="裁剪任务 ORD123"）
  const showOrderNo = !!task.orderNo && !task.title.includes(task.orderNo);

  return (
    <div
      className={`${styles.taskCard} ${isSystem ? styles.taskCardSystem : ''}`}
      style={{ borderLeftColor: prio.color }}
      onClick={() => onClick(task)}>
      <div className={styles.taskCardTop}>
        <span className={styles.priorityTag} style={{ color: prio.color, background: prio.bg }}>
          {prio.label}
        </span>
        {task.orderLinkStatus && (
          <span className={styles.moduleTag} style={{ color: getOrderLinkStatusColor(task.orderLinkStatus), borderColor: getOrderLinkStatusColor(task.orderLinkStatus) }}>
            {getOrderLinkStatusLabel(task.orderLinkStatus)}
          </span>
        )}
        {task.progressChangeMonitorEnabled && <span className={styles.sysTag} style={{ background: 'var(--status-processing-bg)', color: 'var(--color-info)' }}>监控中</span>}
        <span className={styles.taskTitle}>{task.title}</span>
      </div>
      {task.description && <div className={styles.taskDesc}>{task.description}</div>}
      <div className={styles.taskCardBottom}>
        <div className={styles.taskMeta}>
          {showOrderNo && <span>订单 {task.orderNo}</span>}
          {task.styleNo && <span>款号 {task.styleNo}</span>}
          {task.quantity != null && <span>{task.quantity}件</span>}
          {task.assigneeName && <span>{task.assigneeName}{task.assigneeRole && !task.assigneeName.includes(task.assigneeRole) ? `（${task.assigneeRole}）` : ''}</span>}
          {task.creatorName && <span>创建 {task.creatorName}</span>}
          {task.endTime && <span>截止 {task.endTime.slice(0, 10)}</span>}
          {!isSystem && task.lastOrderProgress != null && <span>进度 {task.lastOrderProgress}%</span>}
          {task.reminderCount != null && task.reminderCount > 0 && <span>提醒 {task.reminderCount}次</span>}
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
              onClick={() => onClick(task)}>
              打开
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(TaskListView);
