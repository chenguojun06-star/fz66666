import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { STAGE_COLORS, type SubProcessRow } from './SampleProcessList.helpers';

// 列定义：从 SampleProcessList.tsx 拆分而来
// 保持原字段名、宽度、渲染逻辑不变

export interface BuildColumnsParams {
  activeTab: string;
  currentStageKey?: string;
  actioningKey: string;
  /** 整件样衣生产是否已完成：完成后工序行操作置灰，禁止撤回/改派 */
  completed?: boolean;
  /** 是否为管理账号：撤回按钮仅管理可见 */
  canManage?: boolean;
  onAssign: (row: SubProcessRow) => void;
  onPurchaseClick: () => void;
  onManualComplete: (row: SubProcessRow) => void;
  onUndo: (row: SubProcessRow) => void;
}

export function buildColumns(params: BuildColumnsParams): ColumnsType<SubProcessRow> {
  const {
    activeTab,
    currentStageKey,
    actioningKey,
    completed,
    canManage,
    onAssign,
    onPurchaseClick,
    onManualComplete,
    onUndo,
  } = params;

  return [
    {
      title: '工序',
      dataIndex: 'name',
      key: 'name',
      width: 90,
      render: (val: string, record: SubProcessRow) => {
        const icon = record.status === 'completed'
          ? <CheckCircleOutlined style={{ color: 'var(--color-success)', fontSize: 12, marginRight: 4 }} />
          : record.status === 'in_progress'
            ? <PlayCircleOutlined style={{ color: STAGE_COLORS[activeTab] || 'var(--color-info)', fontSize: 12, marginRight: 4 }} />
            : <ClockCircleOutlined style={{ color: 'var(--color-text-quaternary)', fontSize: 12, marginRight: 4 }} />;
        return <span>{icon}{val}</span>;
      },
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 65,
      align: 'right' as const,
      render: (val: string) => <span style={{ fontWeight: 600 }}>{val}</span>,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (v: number | null | undefined) =>
        v != null && v > 0 ? `¥${Number(v).toFixed(2)}` : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>,
    },
    {
      title: '领取人',
      dataIndex: 'receiver',
      key: 'receiver',
      width: 65,
      render: (val: string) => val || '-',
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 100,
      render: (val: string) => <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{val || '-'}</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 65,
      render: (_: any, record: SubProcessRow) => {
        if (record.status === 'completed') return <Tag color="success" style={{ fontSize: 11 }}>已完成</Tag>;
        if (record.status === 'in_progress') return <Tag color="processing" style={{ fontSize: 11 }}>{record.percent}%</Tag>;
        // D-208：已领取未报工=生产中（与手机端 process-config 口径一致）
        if (record.status === 'claimed') return <Tag color="processing" style={{ fontSize: 11 }}>生产中</Tag>;
        return <Tag color="default" style={{ fontSize: 11 }}>待领取</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: SubProcessRow) => {
        const actions: RowAction[] = [];
        actions.push({
          key: 'assign',
          label: '指派',
          // 整件样衣已完成或该工序已完成后不可再改派 → 置灰
          disabled: !!completed || record.status === 'completed',
          onClick: () => onAssign(record),
        });
        if (currentStageKey === 'procurement' && record.status !== 'completed') {
          actions.push({
            key: 'purchase',
            label: '采购',
            primary: true,
            onClick: onPurchaseClick,
          });
        }
        if (record.status !== 'completed') {
          const acting = actioningKey === record.key;
          actions.push({
            key: 'complete',
            label: acting ? '完成中...' : '手动完成',
            primary: currentStageKey !== 'procurement',
            disabled: acting || !!completed,
            onClick: () => onManualComplete(record),
          });
        }
        // 撤回仅管理员可见；整件样衣已完成则置灰，避免误撤已闭环工序
        if (canManage && record.status === 'completed') {
          actions.push({
            key: 'undo',
            label: '撤回',
            danger: true,
            disabled: !!completed,
            onClick: () => onUndo(record),
          });
        }
        return <RowActions actions={actions} revealOnHover />;
      },
    },
  ];
}
