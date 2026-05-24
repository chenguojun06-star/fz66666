import React, { useState, useEffect, useRef } from 'react';
import { InputNumber } from 'antd';
import type { StyleProcess } from '@/types/style';
import { toNumberSafe } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';

interface Props {
  processList: StyleProcess[];
  onRateChange?: (rate: number) => void;
  isLocked?: boolean;
}

const QuotationProcessSection: React.FC<Props> = ({ processList, onRateChange, isLocked }) => {
  const [rowRates, setRowRates] = useState<Record<string, number>>({});
  const isFirstRender = useRef(true);

  const displayTotal = processList.reduce(
    (s, i) => s + (Number((i as any).price) || 0) * (Number((i as any).rateMultiplier) || 1) * (rowRates[(i as any).id] ?? 1),
    0,
  );

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    onRateChange?.(displayTotal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowRates]);

  if (processList.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 15, fontWeight: 600, padding: '8px 0 6px',
        borderBottom: '1px solid var(--color-border-light, #f0f0f0)', marginBottom: 12, color: 'var(--color-text-primary, #1a1a1a)',
      }}>
        工序明细
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8, fontWeight: 400 }}>
          共 {processList.length} 项
        </span>
      </div>

      <ResizableTable
        rowKey={(record: any) => record.id || String(Math.random())}
        pagination={false}
        size="small"
        dataSource={processList}
        columns={[
          { title: '序号', width: 60, align: 'center' as const, render: (_: any, __: any, idx: number) => idx + 1 },
          { title: '进度阶段', dataIndex: 'progressStage', width: 180, render: (v: string) => String(v || '').trim() || '-' },
          {
            title: '倍率', width: 120, align: 'center' as const,
            render: (_: any, r: any) => (
              <InputNumber
                value={rowRates[r.id] ?? 1}
                min={0.01} max={99} step={0.1}
                controls={false}
                style={{ width: 75 }}
                disabled={isLocked}
                onChange={(v) => setRowRates(prev => ({ ...prev, [r.id]: v ?? 1 }))}
              />
            ),
          },
          {
            title: '工序合计', width: 140, align: 'right' as const,
            render: (_: any, r: any) => {
              const rate = rowRates[r.id] ?? 1;
              const price = toNumberSafe(r.price) * rate;
              return <strong>{formatMoney(price)}</strong>;
            },
          },
        ]}
      />

      <div style={{
        display: 'flex', justifyContent: 'flex-end', padding: '6px 10px',
        border: '1px solid var(--color-border, #e8e8e8)', borderTop: '1px solid var(--color-border, #e8e8e8)',
        background: 'var(--color-bg-container)', fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)',
      }}>
        工序小计：¥{displayTotal.toFixed(2)}
      </div>
    </div>
  );
};

export default QuotationProcessSection;