import React, { useMemo } from 'react';
import { Button, InputNumber, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { confirmDelete } from '@/utils/confirm';
import { resolvePatternUnit, type PatternMaterialRow } from './helpers';

const { Text } = Typography;

export interface UseUsageColumnsParams {
  allSizes: string[];
  extraSizes: string[];
  usageEdits: Record<string | number, Record<string, number | null>>;
  lossEdits: Record<string | number, number | null>;
  handleUsageChange: (bomId: string | number, size: string, val: number | null) => void;
  handleLossChange: (bomId: string | number, val: number | null) => void;
  childReadOnly: boolean;
  setExtraSizes: React.Dispatch<React.SetStateAction<string[]>>;
  setUsageEdits: React.Dispatch<React.SetStateAction<Record<string | number, Record<string, number | null>>>>;
}

// 各码用量配比表格列
export const useUsageColumns = ({
  allSizes,
  extraSizes,
  usageEdits,
  lossEdits,
  handleUsageChange,
  handleLossChange,
  childReadOnly,
  setExtraSizes,
  setUsageEdits,
}: UseUsageColumnsParams): TableColumnsType<PatternMaterialRow> => {
  return useMemo(() => {
    const cols: TableColumnsType<PatternMaterialRow> = [
      {
        title: '物料名称',
        dataIndex: 'bom',
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: PatternMaterialRow) => (
          <div>
            <div>{record.bom.materialName}</div>
            {record.bom.color && <Text type="secondary" style={{ fontSize: 14 }}>{record.bom.color}</Text>}
          </div>
        ),
      },
      {
        title: '单位',
        key: 'unit',
        width: 72,
        render: (_: unknown, record: PatternMaterialRow) => resolvePatternUnit(record.bom) || '-',
      },
      {
        title: '规格/幅宽',
        key: 'specification',
        width: 120,
        render: (_: unknown, record: PatternMaterialRow) => record.bom.specification || record.bom.fabricWeight || '—',
      },
      {
        title: (
          <span>
            平均值
            <br />
            <Text type="secondary" style={{ fontSize: 14 }}>(按码均值)</Text>
          </span>
        ),
        key: 'avgUsage',
        width: 90,
        render: (_: unknown, record: PatternMaterialRow) => {
          const edits = usageEdits[record.bomId] ?? {};
          const vals = Object.values(edits).filter((v): v is number => v !== null && v !== undefined && (v as number) > 0);
          if (vals.length === 0) {
            return record.bom.usageAmount != null ? <Text type="secondary">{record.bom.usageAmount}</Text> : '—';
          }
          const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          return <Text strong>{avg}</Text>;
        },
      },
      {
        title: '损耗率(%)',
        key: 'lossRate',
        width: 100,
        render: (_: unknown, record: PatternMaterialRow) => {
          const val = lossEdits[record.bomId] ?? Number(record.bom.lossRate ?? 0);
          return (
            <InputNumber
              min={0}
              max={100}
              step={1}
              precision={1}
              controls={false}
              value={val}
              onChange={(v) => handleLossChange(record.bomId, v)}
              disabled={childReadOnly}
              style={{ width: '100%' }}
            />
          );
        },
      },
    ];
    // 为每个有效码数添加一列输入
    for (const size of allSizes) {
      cols.push({
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--primary-color, var(--color-primary))' }}>{size}</span>
            {!childReadOnly && extraSizes.includes(size) && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                title={`删除尺码 ${size}`}
                onClick={() => {
                  confirmDelete(`尺码"${size}"`, async () => {
                    setExtraSizes(prev => prev.filter(s => s !== size));
                    setUsageEdits(prev => {
                      const next = { ...prev };
                      for (const bomId of Object.keys(next)) {
                        if (next[bomId] && size in next[bomId]) {
                          const { [size]: _, ...rest } = next[bomId];
                          next[bomId] = rest;
                        }
                      }
                      return next;
                    });
                  });
                }}
              />
            )}
          </span>
        ),
        key: `size_${size}`,
        width: 80,
        render: (_: unknown, record: PatternMaterialRow) => {
          const val = (usageEdits[record.bomId] ?? {})[size] ?? null;
          return (
            <InputNumber
              min={0}
              max={99}
              step={0.05}
              precision={2}
              controls={false}
              value={val ?? undefined}
              onChange={(v) => handleUsageChange(record.bomId, size, v)}
              disabled={childReadOnly}
              style={{ width: '100%' }}
            />
          );
        },
      });
    }
    return cols;
  }, [allSizes, extraSizes, usageEdits, lossEdits, handleUsageChange, handleLossChange, childReadOnly, setExtraSizes, setUsageEdits]);
};
