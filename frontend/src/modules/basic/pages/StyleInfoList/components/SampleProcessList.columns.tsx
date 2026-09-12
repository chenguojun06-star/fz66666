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
  onUndo: (row: SubProcessRow) => void;
  /** D-382：「完成」入口——弹窗勾选色码 + 手填本次完成数量（与手机端一致） */
  onBatchComplete?: (row: SubProcessRow) => void;
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
    onUndo,
    onBatchComplete,
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
      title: '指派安排',
      dataIndex: 'receiver',
      key: 'receiver',
      width: 110,
      render: (val: string, record: SubProcessRow) => {
        // D-384：优先展示指派安排（张三 2 件 / 李四 1 件）——同一工序可指派多人分工
        const assigns = record.assignments || [];
        if (assigns.length > 0) {
          const text = assigns
            .map((a) => `${a.assignee} ${a.quantity}件`)
            .join('、');
          return <span style={{ fontSize: 12 }}>{text}</span>;
        }
        return <span style={{ fontSize: 12 }}>{val || '-'}</span>;
      },
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
      width: 110,
      render: (_: any, record: SubProcessRow) => {
        // D-382：多色多码——按颜色聚合的明细优先，显示「x/y 色」。
        // 后端 process-config 的 status 不带颜色维度（任一颜色完成即整行 COMPLETED），
        // 直接用会导致"红色做完整行就显示已完成"，看不出还有颜色没做（与手机端不一致）。
        const colorItems = record.colorItems || [];
        if (colorItems.length > 1) {
          const doneColors = colorItems.filter((c) => c.completed).length;
          const allDone = doneColors >= colorItems.length;
          return (
            <Tag color={allDone ? 'success' : 'processing'} style={{ fontSize: 11 }}>
              {allDone ? '已完成' : `${doneColors}/${colorItems.length} 色`}
            </Tag>
          );
        }
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
        // D-382：统一为「完成」入口——弹窗里勾选色码 + **手填本次完成数量**（与手机端一致）。
        // 原来的「手动完成」不让人填数量（后端取样板记录的数量），一个版多人生产时记录会失真。
        // 注意：不受 record.status === 'completed' 限制——整行 completed 只代表
        // "至少一个颜色完成"，仍需入口去完成其余颜色，否则后续颜色会被卡住。
        if (onBatchComplete) {
          const acting = actioningKey === record.key;
          actions.push({
            key: 'complete',
            label: '完成',
            primary: currentStageKey !== 'procurement',
            disabled: acting || !!completed,
            onClick: () => onBatchComplete(record),
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
