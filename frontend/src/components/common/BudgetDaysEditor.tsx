import React, { useState, useCallback, useMemo } from 'react';
import { InputNumber, Modal, Space, Tooltip } from 'antd';
import { App } from 'antd';
import dayjs from 'dayjs';
import { ProductionOrder } from '@/types/production';
import { computeStageBudgetHint, getStageConfig } from '@/utils/progressTimeBudget';
import { computeStageTimeline, type StageTimelineItem } from '@/components/common/StageTimelineHint';
import {
  calculateActualDuration,
  calculateWaitingDuration,
  computeBudgetStatus,
  formatBudgetHours,
} from '@/utils/workingTimeCalculator';
import api from '@/utils/api';

interface BudgetDaysEditorProps {
  record: ProductionOrder;
  nodeName: string;
  stageStartTime?: string | null;
  stageEndTime?: string | null;
  isCompletedOrClosed: boolean;
  isProcureNode?: boolean;
  onUpdated?: () => void;
  /** 独立设定的预算工时（小时），优先于按比例计算 */
  budgetHours?: number | null;
  /** 保存预算工时的回调 */
  onBudgetHoursChange?: (hours: number) => Promise<void>;
}

function formatGapDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}天${hours}时`;
  if (hours > 0) return `${hours}时${mins}分`;
  if (mins > 0) return `${mins}分`;
  return '<1分';
}

function gapColorForDays(days: number): string {
  if (days >= 3) return '#ff7875';
  if (days >= 1) return '#faad14';
  return 'var(--color-text-quaternary, #bfbfbf)';
}

const BudgetDaysEditor: React.FC<BudgetDaysEditorProps> = ({
  record,
  nodeName,
  stageStartTime,
  stageEndTime,
  isCompletedOrClosed,
  isProcureNode = false,
  onUpdated,
  budgetHours,
  onBudgetHoursChange,
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
    budgetHours,
  });

  const actualDaysText = (() => {
    if (!stageEndTime || !hint) return '';
    const start = stageStartTime || (record.createTime as string | null);
    if (!start) return '';
    return `实际${calculateActualDuration(start, stageEndTime)}`;
  })();

  const gapInfo = useMemo(() => {
    const timelineItems: StageTimelineItem[] = [
      { name: '下单', startTime: record.createTime, endTime: record.createTime, isCompleted: true },
      { name: '采购', startTime: (record as any).procurementStartTime, endTime: (record as any).procurementEndTime, isProcureNode: true },
      { name: '裁剪', startTime: (record as any).cuttingStartTime, endTime: (record as any).cuttingEndTime },
      { name: '二次工艺', startTime: (record as any).secondaryProcessStartTime, endTime: (record as any).secondaryProcessEndTime },
      { name: '车缝', startTime: (record as any).carSewingStartTime, endTime: (record as any).carSewingEndTime },
      { name: '尾部', startTime: (record as any).ironingStartTime, endTime: (record as any).ironingEndTime },
      { name: '入库', startTime: (record as any).warehousingStartTime, endTime: (record as any).warehousingEndTime },
    ];
    const computed = computeStageTimeline(
      timelineItems,
      record.createTime as string | null,
      (record.expectedShipDate || record.plannedEndDate) as string | null,
    );
    const idx = timelineItems.findIndex(t => t.name === nodeName);
    if (idx < 0) return null;
    const stage = computed[idx];
    if (!stage?.gapText) return null;
    return { text: stage.gapText, color: stage.gapColor, from: stage.gapFrom };
  }, [record, nodeName]);

  const isStageCompleted = !!stageEndTime;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompletedOrClosed || isStageCompleted) return;
    if (editing) return;
    setEditing(true);

    // 如果提供了 budgetHours + onBudgetHoursChange，使用小时编辑模式
    if (budgetHours != null && budgetHours > 0 && onBudgetHoursChange) {
      let newBudgetHours = budgetHours;
      modal.confirm({
        title: `调整「${nodeName}」预算工时`,
        width: 360,
        okText: '确认',
        cancelText: '取消',
        destroyOnHidden: true,
        content: (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>
              当前预算 {formatBudgetHours(budgetHours)}，调整后将保存到服务器
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                defaultValue={budgetHours}
                min={1}
                max={999}
                style={{ width: '100%' }}
                onChange={(v) => { newBudgetHours = v ?? budgetHours; }}
              />
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0 11px', fontSize: 14,
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border)',
                borderLeft: 0, borderRadius: '0 6px 6px 0',
                whiteSpace: 'nowrap',
              }}>小时</span>
            </Space.Compact>
          </div>
        ),
        onOk: async () => {
          if (newBudgetHours === budgetHours) return;
          try {
            await onBudgetHoursChange(newBudgetHours);
            window.dispatchEvent(new CustomEvent('progress-data-refresh'));
            onUpdated?.();
          } catch { /* ignore */ }
        },
        onCancel: () => { setEditing(false); },
        afterClose: () => { setEditing(false); },
      });
      return;
    }

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
  }, [record, nodeName, hint, isCompletedOrClosed, editing, onUpdated, modal, budgetHours, onBudgetHoursChange, isStageCompleted]);

  if (!hint && !gapInfo && budgetHours == null) return null;

  const budgetText = (() => {
    if (budgetHours != null && budgetHours > 0) {
      const budgetLabel = `预算${formatBudgetHours(budgetHours)}`;
      const status = computeBudgetStatus(budgetHours, stageStartTime ?? null, stageEndTime ?? null);
      const parts = [budgetLabel];
      if (status.text) parts.push(status.text);
      if (actualDaysText) parts.push(actualDaysText);
      return parts.join(' · ');
    }
    if (hint) {
      return actualDaysText ? `${hint.text} · ${actualDaysText}` : hint.text;
    }
    return null;
  })();
  const isReadOnly = isCompletedOrClosed || isStageCompleted;

  // 当使用 budgetHours 模式时，用科学计算的状态颜色
  const budgetColor = (() => {
    if (budgetHours != null && budgetHours > 0) {
      const status = computeBudgetStatus(budgetHours, stageStartTime ?? null, stageEndTime ?? null);
      return status.color || 'var(--color-text-quaternary, #bfbfbf)';
    }
    return hint?.color ?? 'var(--color-text-quaternary, #bfbfbf)';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
      {gapInfo && (
        <Tooltip title={`${gapInfo.from} → ${nodeName} ${gapInfo.text}`}>
          <div style={{
            fontSize: 10,
            color: gapInfo.color,
            fontWeight: 400,
            lineHeight: 1.2,
            textAlign: 'center',
            whiteSpace: 'normal',
            wordBreak: 'break-all',
          }}>
            {gapInfo.text}
          </div>
        </Tooltip>
      )}
      {budgetText && (
        <Tooltip title={isReadOnly ? budgetText : (budgetHours != null && onBudgetHoursChange ? '点击调整预算工时' : '点击调整预算天数')}>
          <div
            style={{
              fontSize: 10,
              color: budgetColor,
              fontWeight: 400,
              lineHeight: 1.2,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              cursor: isReadOnly ? 'default' : 'pointer',
              ...(isReadOnly ? {} : {
                borderBottom: '1px dashed',
                borderColor: budgetColor,
              }),
            }}
            onClick={handleClick}
          >
            {budgetText}
          </div>
        </Tooltip>
      )}
    </div>
  );
};

export default BudgetDaysEditor;
