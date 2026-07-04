import React from 'react';
import { Steps } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

/**
 * ApprovalFlowProgress - 审批流程进度条式可视化
 *
 * 以 Ant Design Steps 横向进度条展示单据审批流程节点：
 *   提交 → 审批 → 完成（或驳回）
 *
 * 用法：
 *   <ApprovalFlowProgress
 *     currentStatus={record.status}
 *     steps={buildExpenseFlowSteps(record)}
 *   />
 *
 * 设计原则：
 *   - 纯展示组件，不触发任何数据变更（不影响数据链路）
 *   - 节点状态由 currentStatus 与每步 time 字段共同决定
 *   - 驳回状态会终止流程并标红当前节点
 */

export type FlowStepStatus = 'wait' | 'process' | 'finish' | 'error';

export interface ApprovalFlowStep {
  /** 步骤标题（如：提交、审批、付款） */
  title: string;
  /** 该步骤完成时间（有则视为已完成） */
  time?: string | null;
  /** 操作人 */
  operator?: string | null;
  /** 备注（驳回原因等） */
  remark?: string | null;
  /** 该步骤对应的业务状态值（用于判断当前进行中节点） */
  statusValue?: string;
}

export interface ApprovalFlowConfig {
  /** 业务当前状态 */
  currentStatus: string;
  /** 驳回状态值（命中后当前节点标红） */
  rejectedStatus?: string;
  /** 流程步骤定义 */
  steps: ApprovalFlowStep[];
}

function formatTime(t?: string | null): string {
  if (!t) return '';
  return dayjs(t).format('YYYY-MM-DD HH:mm');
}

function buildDescription(step: ApprovalFlowStep): React.ReactNode {
  const parts: string[] = [];
  if (step.operator) parts.push(step.operator);
  if (step.time) parts.push(formatTime(step.time));
  if (step.remark) parts.push(`备注：${step.remark}`);
  if (parts.length === 0) return '';
  return parts.join(' · ');
}

/**
 * 计算每个节点的状态：
 *   - 已有 time → finish
 *   - 当前状态匹配且无 time → process
 *   - 驳回状态匹配当前节点 → error
 *   - 其他 → wait
 */
function resolveStepStatuses(config: ApprovalFlowConfig): FlowStepStatus[] {
  const { currentStatus, rejectedStatus, steps } = config;
  const isRejected = rejectedStatus != null && currentStatus === rejectedStatus;

  // 找到第一个没有 time 的节点索引（当前进行中节点候选）
  const firstUntimedIndex = steps.findIndex(s => !s.time);

  return steps.map((step, idx) => {
    // 驳回状态：标红"审批"节点（通常第二个节点）
    if (isRejected && step.statusValue === rejectedStatus) {
      return 'error';
    }
    // 有 time 视为已完成
    if (step.time) return 'finish';
    // 当前进行中节点
    if (idx === firstUntimedIndex) {
      // 如果当前状态匹配该节点 statusValue，或该节点是驳回后的下一个节点
      if (step.statusValue === currentStatus) return 'process';
      // 如果是已完成状态（所有节点都 finish），剩余节点标 wait
      return 'wait';
    }
    return 'wait';
  });
}

const ApprovalFlowProgress: React.FC<ApprovalFlowConfig> = ({ currentStatus, rejectedStatus, steps }) => {
  const stepStatuses = resolveStepStatuses({ currentStatus, rejectedStatus, steps });

  // 找到当前节点索引（process 或 error）
  const currentIdx = stepStatuses.findIndex(s => s === 'process' || s === 'error');
  const activeIdx = currentIdx === -1 ? steps.length - 1 : currentIdx;

  const items = steps.map((step, idx) => {
    const status = stepStatuses[idx];
    const description = buildDescription(step);
    const icon =
      status === 'error' ? <CloseCircleOutlined style={{ color: 'var(--color-error)' }} /> :
      status === 'finish' ? <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> :
      status === 'process' ? <ClockCircleOutlined style={{ color: 'var(--color-primary)' }} /> :
      undefined;
    return {
      title: step.title,
      description: description || undefined,
      status: status as any,
      icon,
    };
  });

  return (
    <div style={{ padding: '12px 8px 4px' }}>
      <Steps
        current={activeIdx}
        size="small"
        items={items}
        responsive
      />
    </div>
  );
};

export default ApprovalFlowProgress;
