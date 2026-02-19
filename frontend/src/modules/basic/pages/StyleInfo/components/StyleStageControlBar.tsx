import React, { useMemo } from 'react';
import { App, Button, Input, Space, Tag } from 'antd';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { formatDateTime } from '@/utils/datetime';
import api from '@/utils/api';

interface Props {
  /** 阶段名称（如：纸样开发、BOM清单等） */
  stageName: string;
  /** 款式ID */
  styleId: string | number;
  /** API 前缀路径（如：pattern, bom, size, process, production, secondary） */
  apiPath: string;
  /** 状态（COMPLETED=已完成, IN_PROGRESS=进行中, NOT_STARTED=未开始） */
  status?: string;
  /** 领取人/负责人 */
  assignee?: string;
  /** 开始时间 */
  startTime?: string;
  /** 完成时间 */
  completedTime?: string;
  /** 是否只读 */
  readOnly?: boolean;
  /** 刷新回调 */
  onRefresh: () => void;
  /** 自定义开始前的验证（返回 false 阻止开始） */
  onBeforeStart?: () => boolean | Promise<boolean>;
  /** 自定义完成前的验证（返回 false 阻止完成） */
  onBeforeComplete?: () => boolean | Promise<boolean>;
  /** 额外显示的信息节点 */
  extraInfo?: React.ReactNode;
}

/**
 * 样衣开发各阶段统一的状态控制栏
 *
 * 功能：
 * 1. 显示状态、负责人、时间信息
 * 2. 统一的三个按钮：开始、完成、退回（维护）
 * 3. 权限控制：完成后按钮变灰，只有主管可以退回
 * 4. 样式统一：所有 Tab 使用相同的布局和交互
 */
const StyleStageControlBar: React.FC<Props> = ({
  stageName,
  styleId,
  apiPath,
  status: rawStatus,
  assignee,
  startTime,
  completedTime,
  readOnly = false,
  onRefresh,
  onBeforeStart,
  onBeforeComplete,
  extraInfo,
}) => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [saving, setSaving] = React.useState(false);

  // 状态标准化
  const status = useMemo(() => String(rawStatus || '').trim().toUpperCase(), [rawStatus]);

  // 是否已完成（完成后锁定）
  const isCompleted = useMemo(() => status === 'COMPLETED', [status]);

  // 是否可以退回修改（只有主管及以上可以）
  const canRollback = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // 状态标签
  const statusTag = useMemo(() => {
    if (status === 'COMPLETED') return <Tag color="success">已完成</Tag>;
    if (status === 'IN_PROGRESS') return <Tag color="processing">进行中</Tag>;
    return <Tag color="default">未开始</Tag>;
  }, [status]);

  // 格式化时间
  const startTimeText = useMemo(() => formatDateTime(startTime), [startTime]);
  const completedTimeText = useMemo(() => formatDateTime(completedTime), [completedTime]);

  // 调用 API
  const callApi = async (action: 'start' | 'complete' | 'reset', reason?: string) => {
    setSaving(true);
    try {
      const url = `/style/info/${styleId}/stage-action?stage=${apiPath}&action=${action}`;
      const body = reason ? { reason } : undefined;

      const res = await api.post(url, body);
      const result = res as any;

      if (result.code === 200) {
        message.success('操作成功');
        onRefresh();
        return true;
      }
      message.error((result.message as string) || '操作失败');
      return false;
    } catch (error: any) {
      message.error(error?.message || '操作失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 开始
  const handleStart = async () => {
    if (onBeforeStart) {
      const canStart = await onBeforeStart();
      if (!canStart) return;
    }
    await callApi('start');
  };

  // 完成
  const handleComplete = async () => {
    if (onBeforeComplete) {
      const canComplete = await onBeforeComplete();
      if (!canComplete) return;
    }
    await callApi('complete');
  };

  // 退回修改（维护）
  const handleRollback = () => {
    let reason = '';
    modal.confirm({
      title: `退回修改 - ${stageName}`,
      content: (
        <div>
          <div style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
            退回后将重新进入开发状态，需要重新完成。
          </div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>退回原因</div>
          <Input.TextArea
            placeholder="请输入退回原因（必填）"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              reason = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        await callApi('reset', remark);
      },
    });
  };

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      {/* 左侧：状态信息 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{stageName}状态：</span>
          {statusTag}
        </div>
        <span style={{ color: 'var(--text-secondary)' }}>
          负责人：<span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{assignee || '-'}</span>
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          开始时间：<span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{startTimeText}</span>
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          完成时间：<span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{completedTimeText}</span>
        </span>
        {/* 额外信息 */}
        {extraInfo}
      </div>

      {/* 右侧：操作按钮 */}
      <Space size={8} wrap>
        {isCompleted ? (
          // 已完成状态：只显示退回按钮（灰色），仅主管可用
          <>
            {canRollback ? (
              <Button size="small" danger loading={saving} onClick={handleRollback}>
                退回修改
              </Button>
            ) : (
              <Button size="small" disabled>
                已完成（主管可退回）
              </Button>
            )}
          </>
        ) : (
          // 未完成状态：显示开始/完成按钮
          <>
            {!startTime && (
              <Button
                type="primary"
                size="small"
                loading={saving}
                disabled={readOnly}
                onClick={handleStart}
              >
                开始{stageName}
              </Button>
            )}
            {startTime && !completedTime && (
              <Button
                type="primary"
                size="small"
                loading={saving}
                disabled={readOnly}
                onClick={handleComplete}
              >
                标记完成
              </Button>
            )}
            {/* 主管可以随时退回（即使未完成） */}
            {canRollback && (startTime || completedTime) && (
              <Button size="small" danger loading={saving} onClick={handleRollback}>
                退回修改
              </Button>
            )}
          </>
        )}
      </Space>
    </div>
  );
};

export default StyleStageControlBar;
