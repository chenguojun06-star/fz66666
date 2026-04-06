import React, { useState, useEffect, useRef } from 'react';
import { Card, InputNumber } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { StyleProcess } from '@/types/style';
import { toNumberSafe } from '@/utils/api';

interface Props {
  processList: StyleProcess[];
  onRateChange?: (rate: number) => void;
  isLocked?: boolean;
}

const QuotationProcessSection: React.FC<Props> = ({ processList, onRateChange, isLocked }) => {
  const [globalRate, setGlobalRate] = useState<number>(1);
  const isFirstRender = useRef(true);

  // 基础小计：含各行自身的 rateMultiplier（保留旧数据兼容）
  const baseTotal = processList.reduce(
    (s, i) => s + (Number((i as any).price) || 0) * (Number((i as any).rateMultiplier) || 1),
    0,
  );
  // 展示小计 = 基础小计 × 全局倍率
  const displayTotal = baseTotal * globalRate;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onRateChange?.(globalRate);
  }, [globalRate]);

  const processColumns: ColumnsType<StyleProcess> = [
    {
      title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 70, align: 'center',
      render: (v: unknown) => toNumberSafe(v) || '-',
    },
    {
      title: '工序名称', dataIndex: 'processName', key: 'processName', width: 140,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '工序描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '单价', dataIndex: 'price', key: 'price', width: 180, align: 'right',
      render: (v: unknown, record: StyleProcess) => {
        const base = toNumberSafe(v);
        const mult = toNumberSafe((record as any).rateMultiplier) || 1;
        const actual = base * mult;
        if (mult !== 1) {
          return (
            <span>
              <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>¥{base.toFixed(2)}</span>
              <span style={{ color: 'var(--neutral-text-secondary)', margin: '0 3px', fontSize: 12 }}>×{mult}</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>=¥{actual.toFixed(2)}</span>
            </span>
          );
        }
        return (
          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
            ¥{base.toFixed(2)}
          </span>
        );
      },
    },
  ];

  return (
    <Card
      title={
        <span style={{ fontSize: '15px', fontWeight: 600 }}>
          工序明细
          <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginLeft: 8 }}>
            共 {processList.length} 项
          </span>
        </span>
      }

      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '8px' } }}
    >
      <ResizableTable
        storageKey="style-quotation-process"
        size="middle"
        columns={processColumns}
        dataSource={processList}
        rowKey={(r) => String((r as any)?.id || Math.random())}
        pagination={false}
        scroll={{ x: 700 }}
      />
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--color-border-secondary)' }}>
        {globalRate !== 1 && (
          <div style={{ textAlign: 'right', marginBottom: 4, fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
            <span style={{ marginRight: 16 }}>基础小计：¥{baseTotal.toFixed(2)}</span>
            <span>×{globalRate} 倍率调整：+¥{(displayTotal - baseTotal).toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>倍率：</span>
          <InputNumber
            value={globalRate}
            min={0.01}
            max={99}
            step={0.1}
            style={{ width: 80 }}
            placeholder="1"
            disabled={isLocked}
            onChange={(v) => setGlobalRate(v ?? 1)}
          />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-success)' }}>
            工序小计：¥{displayTotal.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
};

export default QuotationProcessSection;
