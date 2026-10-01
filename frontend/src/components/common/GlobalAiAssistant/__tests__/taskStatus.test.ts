import { describe, it, expect } from 'vitest';
import { STATUS_BUCKET, statusBucket } from '../TaskListView';
import type { TaskStatus } from '../types';

/**
 * D-694 任务状态契约守护。
 *
 * 后端 `CollaborationTask.TaskStatus` 有 6 个枚举值，经
 * `TaskCenterOrchestrator.toPersonalTaskViewList`（第 501 行 `.toLowerCase()`）
 * 出参后为小写。修复前前端 `TaskStatus` 只声明 5 个（缺 `escalated`），
 * 且 `statusBucket` 用 `as` 断言对未知值静默透传，导致已升级任务
 * 「出现在全部列表、但哪个状态页签都不算」，且卡片上不出现任何操作按钮。
 */
describe('TaskStatus 与后端枚举一致性（D-694）', () => {
  // 与 CollaborationTask.TaskStatus 的 6 个枚举严格一一对应
  const BACKEND_STATUSES = [
    'pending',
    'accepted',
    'in_progress',
    'escalated',
    'completed',
    'cancelled',
  ] as const;

  it('后端每个状态都必须有归桶映射，否则升级任务会变幽灵项', () => {
    for (const s of BACKEND_STATUSES) {
      expect(STATUS_BUCKET[s]).toBeDefined();
    }
    // 映射表键数必须与状态数一致（多一个少一个都要发现）
    expect(Object.keys(STATUS_BUCKET).sort()).toEqual([...BACKEND_STATUSES].sort());
  });

  it('escalated 归入「进行中」——与后端 countByTenantAndStatus 口径一致', () => {
    // 后端把 ESCALATED 计入 inProgressRaw，页签计数不能漏
    expect(statusBucket('escalated')).toBe('in_progress');
  });

  it('accepted / in_progress / escalated 三者归同一桶', () => {
    expect(statusBucket('accepted')).toBe('in_progress');
    expect(statusBucket('in_progress')).toBe('in_progress');
    expect(statusBucket('escalated')).toBe(statusBucket('in_progress'));
  });

  it('pending / completed / cancelled 各自独立成桶', () => {
    expect(statusBucket('pending')).toBe('pending');
    expect(statusBucket('completed')).toBe('completed');
    expect(statusBucket('cancelled')).toBe('cancelled');
  });

  it('未知状态兜底为 pending（不抛异常、不返回 undefined）', () => {
    expect(statusBucket('WHATEVER' as TaskStatus)).toBe('pending');
    expect(statusBucket('' as TaskStatus)).toBe('pending');
  });
});
