/**
 * StyleProcessTab 工具函数、类型定义与列配置
 * 从 StyleProcessTab.tsx 提取的纯函数与列构建器（零业务状态）
 */

import React from 'react';
import { Button, Input, InputNumber, Select, Tag, Tooltip } from 'antd';
import { DeleteOutlined, BulbOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { modal } from '@/utils/antdStatic';
import { StyleProcess } from '@/types/style';
import { toNumberSafe } from '@/utils/api';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import type { ProcessPriceHintResponse } from '@/services/intelligence/intelligenceApi';
import { STAGE_ACCENT, STAGE_ACCENT_LIGHT } from '@/utils/stageStyles';
import { STAGE_ORDER, computeStageSortedAndSpan } from '@/utils/productionStage';
export { STAGE_ORDER, computeStageSortedAndSpan };

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface StyleProcessTabProps {
  styleId: string | number;
  styleNo?: string;
  readOnly?: boolean;
  hidePrice?: boolean; // 是否隐藏单价列
  progressNode?: string; // 进度节点
  processAssignee?: string;
  processStartTime?: string;
  processCompletedTime?: string;
  onRefresh?: () => void; // 刷新父组件的回调
  onDataLoaded?: (data: any[]) => void; // 数据加载完成后通知父组件
  // 款式开发码/开发色配置（来自款式详情 sizeColorConfig）。
  // 工序单价码数列必须与款式详情开发码同步（此前从尺寸表/码价兜底导致显示 S/M/L/XL/XXL 通用码）
  sizeColorConfig?: {
    sizes?: string[];
    commonSizes?: string[];
  };
}

// 多码单价数据接口
export interface SizePrice {
  id?: string;
  styleId: number;
  processCode: string;
  processName: string;
  progressStage?: string;
  size: string;
  price: number;
}

// 扩展的工序数据，包含各尺码单价
export interface StyleProcessWithSizePrice extends StyleProcess {
  sizePrices?: Record<string, number>; // { 'XS': 2.5, 'S': 2.5, 'M': 3.0 }
  sizePriceTouched?: Record<string, boolean>;
}

export interface StageSpanInfo {
  rowSpan: number;
  stage: string;
  count: number;
}

// ─────────────────────────────────────────────
// 工具函数与常量
// ─────────────────────────────────────────────

export const norm = (v: unknown) => String(v || '').trim();

export const isTempId = (id: any) => {
  const s = String(id ?? '').trim();
  if (!s) return true;
  return s.startsWith('-');
};

export function processCodeOrdinal(code?: string): number {
  const m = String(code || '').match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

export function computeSortedDataAndStageSpan(data: StyleProcessWithSizePrice[]) {
  // D-264（用户拍板）：工序编号即顺序——整表按编码数字序排列（无编码的排最后），
  // 进度节点不再参与排序，仅把相邻同节点行合并展示（rowSpan）。
  // 编码可在编辑态直接修改，改完即按新顺序排列，保存后固化。
  const sorted = [...data].sort((a, b) => processCodeOrdinal(a.processCode) - processCodeOrdinal(b.processCode));
  const stageSpanMap = new Map<number, StageSpanInfo>();
  const stageOf = (row: StyleProcessWithSizePrice) => {
    const ps = String(row.progressStage || '').trim();
    return ps || STAGE_ORDER[0] || '裁剪';
  };
  let i = 0;
  while (i < sorted.length) {
    const stage = stageOf(sorted[i]);
    let j = i + 1;
    while (j < sorted.length && stageOf(sorted[j]) === stage) j++;
    const count = j - i;
    stageSpanMap.set(i, { rowSpan: count, stage, count });
    for (let k = i + 1; k < j; k++) stageSpanMap.set(k, { rowSpan: 0, stage, count });
    i = j;
  }
  return { sortedData: sorted, stageSpanMap };
}

// ─────────────────────────────────────────────
// 列配置构建器
// ─────────────────────────────────────────────

export interface BuildProcessColumnsOptions {
  editableMode: boolean;
  hidePrice: boolean;
  showSizePrices: boolean;
  sizes: string[];
  stageSpanMap: Map<number, StageSpanInfo>;
  priceHints: Record<string | number, ProcessPriceHintResponse | null>;
  priceHintLoading: Record<string | number, boolean>;
  updateField: (id: string | number, field: string, value: any) => void;
  updateSizePrice: (id: string | number, size: string, value: number) => void;
  handleAdd: (stage: string) => void;
  handleDelete: (id: string | number) => void;
  handleRemoveSize: (size: string) => void;
}

export function buildProcessColumns(opts: BuildProcessColumnsOptions): any[] {
  const {
    editableMode, hidePrice, showSizePrices, sizes, stageSpanMap,
    priceHints, priceHintLoading,
    updateField, updateSizePrice, handleAdd, handleDelete, handleRemoveSize,
  } = opts;
  return [
    {
      title: '工序编码',
      dataIndex: 'processCode',
      width: 100,
      ellipsis: true,
      // D-264（用户拍板）：工序编号开放编辑——编码即顺序，改编码即调顺序，
      // 整表按编码数字序排列（见 computeSortedDataAndStageSpan）
      render: (text: string, record: StyleProcessWithSizePrice) => editableMode ? (
        <Input
          value={text}
          placeholder="如 01"
          maxLength={10}
          onChange={(e) => updateField(record.id as string | number, 'processCode', e.target.value)}
        />
      ) : (text || '-'),
    },
    {
      title: '工序名称',
      dataIndex: 'processName',
      width: 160,
      ellipsis: true,
      render: (text: string, record: StyleProcess) =>
        editableMode ? (
          <DictAutoComplete
            dictType="process_name"
            autoCollect
            value={record.processName}
            placeholder="请选择或输入工序名称"
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 260 } } }}
            onChange={(v) => updateField(record.id!, 'processName', v)}
          />
        ) : (
          text
        ),
    },
    {
      title: '进度节点',
      dataIndex: 'progressStage',
      width: 130,
      onCell: (_: StyleProcess, index?: number) => {
        const info = stageSpanMap.get(index ?? -1);
        return {
          rowSpan: info?.rowSpan ?? 1,
          style: info && info.rowSpan > 0
            ? { background: STAGE_ACCENT_LIGHT, borderLeft: `3px solid ${STAGE_ACCENT}`, verticalAlign: 'middle' as const, textAlign: 'center' as const }
            : undefined,
        };
      },
      render: (_: string, record: StyleProcess, index: number) => {
        const info = stageSpanMap.get(index);
        if (!info || info.rowSpan === 0) return null;
        const stage = record.progressStage || '车缝';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Tag style={{ background: STAGE_ACCENT, color: 'var(--color-bg-base)', border: 'none', fontWeight: 600, fontSize: 14 }}>{stage}</Tag>
            <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{info.count} 个工序</span>
            {editableMode && (
              <Button type="link" icon={<PlusOutlined />} onClick={() => handleAdd(stage)} style={{ fontSize: 14, padding: 0 }}>
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
      width: 130,
      ellipsis: true,
      render: (text: string, record: StyleProcess) =>
        editableMode ? (
          <DictAutoComplete
            dictType="machine_type"
            autoCollect
            value={record.machineType}
            placeholder="请选择或输入机器类型"
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 260 } } }}
            onChange={(v) => updateField(record.id!, 'machineType', v)}
          />
        ) : (
          text
        ),
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      width: 90,
      render: (text: string, record: StyleProcess) =>
        editableMode ? (
          <Select
            value={record.difficulty || undefined}
            style={{ width: '100%' }}
            allowClear
            placeholder="-"
            onChange={(v) => updateField(record.id!, 'difficulty', v ?? null)}
            options={[
              { label: '易', value: '易' },
              { label: '中', value: '中' },
              { label: '难', value: '难' },
            ]}
          />
        ) : (
          text || '-'
        ),
    },
    {
      title: '工序描述',
      dataIndex: 'description',
      width: 160,
      ellipsis: true,
      render: (text: string, record: StyleProcess) =>
        editableMode ? (
          <DictAutoComplete
            dictType="process_description"
            autoCollect
            value={record.description || ''}
            placeholder="请选择或输入工序描述"
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 260 } } }}
            onChange={(v) => updateField(record.id!, 'description', v || null)}
          />
        ) : (
          <span title={text || ''}>{text || '-'}</span>
        ),
    },
    {
      title: '标准工时(秒)',
      dataIndex: 'standardTime',
      width: 140,
      render: (text: number, record: StyleProcess) =>
        editableMode ? (
          <InputNumber
            value={record.standardTime}
            min={0}
            style={{ width: '100%' }}
            onChange={(v) => updateField(record.id!, 'standardTime', toNumberSafe(v))}
          />
        ) : (
          text
        ),
    },
    ...(!hidePrice ? [{
      title: '工价(元)',
      dataIndex: 'price',
      width: 160,
      render: (text: number, record: StyleProcess) => {
        if (!editableMode) return `¥${toNumberSafe(text)}`;
        const hint = priceHints[record.id!];
        const loading = priceHintLoading[record.id!];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <InputNumber
              value={record.price}
              min={0}
              step={0.01}
              prefix="¥"
              style={{ width: '100%' }}
              onChange={(v) => updateField(record.id!, 'price', v)}
            />
            {/* AI 单价提示卡片 */}
            {loading && (
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <LoadingOutlined style={{ fontSize: 12 }} /> 查询历史...
              </span>
            )}
            {!loading && hint && (
              <Tooltip title={hint.reasoning}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(45,127,249,0.08)', borderRadius: 4,
                    padding: '2px 6px', cursor: 'pointer',
                  }}
                  onClick={() => {
                    updateField(record.id!, 'price', hint.suggestedPrice);
                  }}
                >
                  <BulbOutlined style={{ fontSize: 13, color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: 14, color: 'var(--color-primary)' }}>
                    建议 ¥{Number(hint.suggestedPrice).toFixed(2)}
                  </span>
                  <Tag
                    color="blue"
                    style={{ fontSize: 14, padding: '0 4px', lineHeight: '16px', margin: 0, cursor: 'pointer' }}
                  >
                    采用
                  </Tag>
                  <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                    均¥{Number(hint.avgPrice).toFixed(2)} · {hint.usageCount}款
                  </span>
                </div>
              </Tooltip>
            )}
          </div>
        );
      },
    }] : []),
    // 多码单价列（动态生成）
    ...(showSizePrices ? sizes.map((size) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span>{size}</span>
          {editableMode && (
            <DeleteOutlined
              style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: "var(--font-size-xs)" }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                modal.confirm({
                  width: '30vw',
                  title: `确定删除"${size}"码？`,
                  content: '删除后该尺码的单价数据将被清除',
                  onOk: () => handleRemoveSize(size),
                });
              }}
            />
          )}
        </div>
      ),
      dataIndex: `sizePrice_${size}`,
      width: 90,
      render: (_: any, record: StyleProcessWithSizePrice) => {
        const price = record.sizePrices?.[size] ?? record.price ?? 0;
        return editableMode ? (
          <InputNumber
            value={price}
            min={0}
            step={0.01}
            prefix="¥"
           
            style={{ width: '100%' }}
            onChange={(v) => updateSizePrice(record.id!, size, toNumberSafe(v))}
          />
        ) : (
          `¥${toNumberSafe(price)}`
        );
      },
    })) : []),
    {
      title: '操作',
      dataIndex: 'operation',
      width: 120,
      resizable: false,
      render: (_: any, record: StyleProcess) =>
        editableMode ? (
          <RowActions
            maxInline={1}
            actions={[
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                danger: true,
                onClick: () => {
                  modal.confirm({
                    width: '30vw',
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id!),
                  });
                },
              },
            ]}
          />
        ) : null,
    },
  ];
}
