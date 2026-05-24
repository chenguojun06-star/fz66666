import React, { useState, useCallback } from 'react';
import { InputNumber, Modal, Space, Tooltip } from 'antd';
import { App } from 'antd';
import dayjs from 'dayjs';
import { ProductionOrder } from '@/types/production';
import { computeStageBudgetHint, getStageConfig } from '@/utils/progressTimeBudget';
import api from '@/utils/api';

interface BudgetDaysEditorProps {
  record: ProductionOrder;
  nodeName: string;
  stageStartTime?: string | null;
  stageEndTime?: string | null;
  isCompletedOrClosed: boolean;
  isProcureNode?: boolean;
  onUpdated?: () => void;
}

const BudgetDaysEditor: React.FC<BudgetDaysEditorProps> = ({
  record,
  nodeName,
  stageStartTime,
  stageEndTime,
  isCompletedOrClosed,
  isProcureNode = false,
  onUpdated,
}) => {
  const { modal } = App.useApp();
  const [editing, setEditing] = useState(false);

  const hint = computeStageBudgetHint({
    nodeName,
    orderCreateTime: record.createTime as string | null,
    expectedShipDate: (record.expectedShipDate || record.plannedEndDate) as string | null,
    stageStartTime: stageStartTime || undefined,
    stageEndTime: stageEndTime || undefined,
    isCompletedOrClosed,
    isProcureNode,
  });

  const actualDaysText = (() => {
    if (!stageEndTime || !hint) return '';
    const start = stageStartTime ? dayjs(stageStartTime) : (record.createTime ? dayjs(record.createTime as string) : null);
    if (!start) return '';
    const actualDays = dayjs(stageEndTime).diff(start, 'day');
    return `实际${actualDays}天`;
  })();

  const isStageCompleted = !!stageEndTime;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompletedOrClosed || isStageCompleted) return;
    if (editing) return;
    setEditing(true);

    const currentBudgetDays = hint?.budgetDays ?? 1;
    const orderCreate = record.createTime ? dayjs(record.createTime as string) : dayjs();
    const currentShipDate = (record.expectedShipDate || record.plannedEndDate)
      ? dayjs(String(record.expectedShipDate || record.plannedEndDate))
      : orderCreate.add(30, 'day');
    const totalDays = currentShipDate.diff(orderCreate, 'day');
    let newBudgetDays = currentBudgetDays;

    modal.confirm({
      title: `调整「${nodeName}」预算天数`,
      width: 360,
      okText: '确认',
      cancelText: '取消',
      destroyOnHidden: true,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            当前预算 {currentBudgetDays} 天，调整后将自动更新预计交期
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <InputNumber
              defaultValue={currentBudgetDays}
              min={1}
              max={totalDays > 0 ? totalDays * 2 : 60}
              style={{ width: '100%' }}
              onChange={(v) => { newBudgetDays = v ?? currentBudgetDays; }}
            />
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0 11px', fontSize: 14,
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border)',
              borderLeft: 0, borderRadius: '0 6px 6px 0',
              whiteSpace: 'nowrap',
            }}>天</span>
          </Space.Compact>
        </div>
      ),
      onOk: async () => {
        if (newBudgetDays === currentBudgetDays) return;
        const config = getStageConfig(nodeName);
        const newTotalDays = Math.round(newBudgetDays / config.ratio);
        const newShipDate = orderCreate.add(newTotalDays, 'day').format('YYYY-MM-DD HH:mm');
        try {
          const res = await api.post('/production/order/quick-edit', {
            orderId: String(record.id || ''),
            expectedShipDate: newShipDate,
          });
          if (res.code === 200) {
            (record as any).expectedShipDate = newShipDate;
            window.dispatchEvent(new CustomEvent('progress-data-refresh'));
            onUpdated?.();
          }
        } catch { /* ignore */ }
      },
      onCancel: () => { setEditing(false); },
      afterClose: () => { setEditing(false); },
    });
  }, [record, nodeName, hint, isCompletedOrClosed, editing, onUpdated, modal]);

  if (!hint) return null;

  const displayText = actualDaysText
    ? `${hint.text} · ${actualDaysText}`
    : hint.text;

  const isReadOnly = isCompletedOrClosed || isStageCompleted;

  return (
    <Tooltip title={isReadOnly ? displayText : '点击调整预算天数'}>
      <div
        style={{
          fontSize: 10,
          color: hint.color,
          fontWeight: 400,
          lineHeight: 1.2,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          cursor: isReadOnly ? 'default' : 'pointer',
          ...(isReadOnly ? {} : {
            borderBottom: '1px dashed',
            borderColor: hint.color,
          }),
        }}
        onClick={handleClick}
      >
        {displayText}
      </div>
    </Tooltip>
  );
};

export default BudgetDaysEditor;
