import React from 'react';
import { Button, Input, InputNumber, Popconfirm, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { STAGE_ACCENT, STAGE_ACCENT_LIGHT } from '@/utils/stageStyles';
import type { ProcessStepRow, ProcessTableData } from '../../../utils/templateUtils';

export interface BuildProcessColumnsParams {
  readOnly: boolean;
  compact: boolean;
  showSizePrices: boolean;
  templateSizes: string[];
  sortedSteps: Array<ProcessStepRow & { _origIdx: number }>;
  stageSpanMap: Map<number, { rowSpan: number; stage: string; count: number }>;
  value: ProcessTableData;
  onChange: (next: ProcessTableData) => void;
  updateStep: (sortedIndex: number, updates: Partial<ProcessStepRow>) => void;
  deleteStep: (sortedIndex: number) => void;
  addStepToStage: (stage: string) => void;
}

export const buildProcessColumns = ({
  readOnly,
  compact,
  showSizePrices,
  templateSizes,
  sortedSteps,
  stageSpanMap,
  value,
  onChange,
  updateStep,
  deleteStep,
  addStepToStage,
}: BuildProcessColumnsParams): ColumnsType<ProcessStepRow & { _origIdx: number }> => {
  return [
    {
      title: '工序编号',
      dataIndex: 'processCode',
      width: compact ? 60 : 80,
      render: (text: string, _: ProcessStepRow, index: number) => (
        <Input
          value={text || ''}
          disabled={readOnly}
          onChange={(event) => updateStep(index, { processCode: event.target.value })}
          style={{ border: 'none' }}
        />
      ),
    },
    {
      title: '工序名称',
      dataIndex: 'processName',
      width: compact ? 108 : 130,
      render: (text: string, _: ProcessStepRow, index: number) => (
        <DictAutoComplete
          dictType="process_name"
          autoCollect
          value={text || ''}
          disabled={readOnly}
          onChange={(nextValue) => updateStep(index, { processName: nextValue as string })}
          style={{ border: 'none' }}
        />
      ),
    },
    {
      title: '进度节点',
      dataIndex: 'progressStage',
      width: compact ? 112 : 140,
      onCell: (_: ProcessStepRow, index?: number) => {
        const info = stageSpanMap.get(index ?? -1);
        return {
          rowSpan: info?.rowSpan ?? 1,
          style: info && info.rowSpan > 0
            ? {
                background: STAGE_ACCENT_LIGHT,
                borderLeft: `3px solid ${STAGE_ACCENT}`,
                verticalAlign: 'middle' as const,
                textAlign: 'center' as const,
              }
            : undefined,
        };
      },
      render: (_: string, record: ProcessStepRow, index: number) => {
        const info = stageSpanMap.get(index);
        if (!info || info.rowSpan === 0) return null;
        const stage = record.progressStage || '车缝';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Tag style={{ background: STAGE_ACCENT, color: 'var(--color-bg-base)', border: 'none', fontWeight: 600, fontSize: compact ? 12 : 13, marginInlineEnd: 0 }}>
              {stage}
            </Tag>
            <span style={{ fontSize: compact ? 11 : 12, color: 'var(--color-text-tertiary)' }}>{info.count} 个工序</span>
            {readOnly ? null : (
              <Button type="link" icon={<PlusOutlined />} onClick={() => addStepToStage(stage)} style={{ padding: 0 }}>
                添加
              </Button>
            )}
          </div>
        );
      },
    },
    {
      title: '机器类型',
      dataIndex: 'machineType',
      width: compact ? 108 : 130,
      render: (text: string, _: ProcessStepRow, index: number) => (
        <DictAutoComplete
          dictType="machine_type"
          autoCollect
          value={text || ''}
          disabled={readOnly}
          onChange={(nextValue) => updateStep(index, { machineType: nextValue as string })}
          style={{ border: 'none' }}
        />
      ),
    },
    {
      title: '工序难度',
      dataIndex: 'difficulty',
      width: compact ? 84 : 100,
      render: (value: string, _: ProcessStepRow, index: number) => (
        <Input
          value={value || ''}
          disabled={readOnly}
          onChange={(event) => updateStep(index, { difficulty: event.target.value })}
          style={{ border: 'none' }}
        />
      ),
    },
    {
      title: '工时(秒)',
      dataIndex: 'standardTime',
      width: compact ? 84 : 100,
      render: (value: number, _: ProcessStepRow, index: number) => (
        <InputNumber
          min={0}
          disabled={readOnly}
          controls={false}
          value={value || 0}
          onChange={(nextValue) => updateStep(index, { standardTime: nextValue || 0 })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '工价(元)',
      dataIndex: 'unitPrice',
      width: compact ? 84 : 100,
      render: (_: unknown, record: ProcessStepRow, index: number) => (
        <InputNumber
          min={0}
          precision={2}
          disabled={readOnly}
          controls={false}
          value={record.unitPrice ?? record.price ?? 0}
          onChange={(nextValue) => updateStep(index, { unitPrice: nextValue || 0 })}
          style={{ width: '100%' }}
        />
      ),
    },
    ...(
      showSizePrices
        ? templateSizes.map((size) => ({
            title: `${size}码`,
            width: compact ? 80 : 95,
            render: (_: unknown, record: ProcessStepRow & { _origIdx: number }, index: number) => (
              <InputNumber
                min={0}
                precision={2}
                disabled={readOnly}
                controls={false}
                value={record.sizePrices?.[size] ?? record.unitPrice ?? record.price ?? 0}
                onChange={(nextValue) => {
                  const originalIndex = sortedSteps[index]?._origIdx ?? index;
                  const nextSteps = [...value.steps];
                  nextSteps[originalIndex] = {
                    ...nextSteps[originalIndex],
                    sizePrices: {
                      ...(nextSteps[originalIndex].sizePrices || {}),
                      [size]: nextValue || 0,
                    },
                  };
                  onChange({ ...value, steps: nextSteps });
                }}
                style={{ width: '100%' }}
              />
            ),
          }))
        : []
    ),
    {
      title: '操作',
      key: 'action',
      width: compact ? 60 : 80,
      render: (_: unknown, __: ProcessStepRow, index: number) => (
        readOnly ? null : (
          <Popconfirm title="确认删除该工序步骤？" onConfirm={() => deleteStep(index)} okButtonProps={{ danger: true }} okText="删除" cancelText="取消">
            <Button danger type="link">删除</Button>
          </Popconfirm>
        )
      ),
    },
  ];
};
