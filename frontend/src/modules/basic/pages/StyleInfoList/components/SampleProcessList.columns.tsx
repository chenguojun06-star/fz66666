import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { STAGE_COLORS, parseSizeDisplay, type SubProcessRow } from './SampleProcessList.helpers';

// 列定义：从 SampleProcessList.tsx 拆分而来
// 保持原字段名、宽度、渲染逻辑不变

export interface BuildColumnsParams {
  activeTab: string;
  currentStageKey?: string;
  actioningKey: string;
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
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 85,
      render: (val: string) => val || '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 65,
      render: (val: string) => val ? <Tag color="blue" style={{ fontSize: 11 }}>{val}</Tag> : '-',
    },
    {
      title: '码数',
      dataIndex: 'size',
      key: 'size',
      width: 60,
      render: (val: string) => <span style={{ fontSize: 12 }}>{parseSizeDisplay(val)}</span>,
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
            disabled: acting,
            onClick: () => onManualComplete(record),
          });
        }
        if (record.status === 'completed') {
          actions.push({
            key: 'undo',
            label: '撤回',
            danger: true,
            onClick: () => onUndo(record),
          });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];
}
