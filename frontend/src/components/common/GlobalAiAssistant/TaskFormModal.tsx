import React, { useState, useEffect } from 'react';
import { DeleteOutlined } from '@ant-design/icons';
import type { TaskItem, TaskPriority, TaskModule } from './types';
import styles from './TaskFormModal.module.css';

const PRIORITY_OPTS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: '紧急' }, { value: 'medium', label: '一般' }, { value: 'low', label: '低' },
];
const MODULE_OPTS: { value: TaskModule; label: string }[] = [
  { value: 'production', label: '生产管理' }, { value: 'style', label: '样衣开发' },
  { value: 'warehouse', label: '仓库管理' }, { value: 'procurement', label: '采购管理' },
  { value: 'quality', label: '质检管理' }, { value: 'finance', label: '财务管理' },
  { value: 'system', label: '系统管理' },
];

interface Props {
  task?: TaskItem | null;
  onSave: (data: { title: string; description?: string; priority: string; module: string; orderNo?: string; styleNo?: string; endTime?: string }) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

const TaskFormModal: React.FC<Props> = ({ task, onSave, onDelete, onCancel, saving }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [desc, setDesc] = useState(task?.description || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'medium');
  const [module, setModule] = useState<TaskModule>((task?.module as TaskModule) || 'production');
  const [orderNo, setOrderNo] = useState(task?.orderNo || '');
  const [styleNo, setStyleNo] = useState(task?.styleNo || '');
  const [endTime, setEndTime] = useState(task?.endTime?.slice(0, 10) || '');

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDesc(task.description || '');
      setPriority(task.priority || 'medium');
      setModule((task.module as TaskModule) || 'production');
      setOrderNo(task.orderNo || '');
      setStyleNo(task.styleNo || '');
      setEndTime(task.endTime?.slice(0, 10) || '');
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: desc.trim() || undefined,
      priority,
      module,
      orderNo: orderNo.trim() || undefined,
      styleNo: styleNo.trim() || undefined,
      endTime: endTime || undefined
    });
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <form className={styles.panel} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className={styles.header}>
          <span className={styles.title}>{task?.id ? '编辑任务' : '新建任务'}</span>
          {task?.id && onDelete && (
            <button type="button" className={styles.deleteBtn} onClick={() => onDelete(task.id)}>
              <DeleteOutlined /> 删除
            </button>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.label}>任务标题 *</span>
            <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="输入任务标题" autoFocus />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>描述</span>
            <textarea className={styles.textarea} value={desc} onChange={e => setDesc(e.target.value)} placeholder="任务详细描述" />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>所属模块</span>
            <select className={styles.select} value={module} onChange={e => setModule(e.target.value as TaskModule)}>
              {MODULE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>优先级</span>
            <select className={styles.select} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
              {PRIORITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>关联订单号</span>
            <input className={styles.input} value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="选填，如 PO-2024-001" />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>款号</span>
            <input className={styles.input} value={styleNo} onChange={e => setStyleNo(e.target.value)} placeholder="选填，如 ST-2024-001" />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>截止日期</span>
            <input className={styles.input} type="date" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>取消</button>
          <button type="submit" className={styles.saveBtn} disabled={!title.trim() || saving}>
            {saving ? '保存中...' : task?.id ? '更新' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default React.memo(TaskFormModal);