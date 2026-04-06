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
  const [rowRates, setRowRates] = useState<Record<string, number>>({});
  const isFirstRender = useRef(true);

  const getRowRate = (record: any): number => rowRates[record.id] ?? 1;

  // 展示小计 = 各行 price × 行倍率 之和
  const displayTotal = processList.reduce(
    (s, i) => s + (Number((i as any).price) || 0) * (Number((i as any).rateMultiplier) || 1) * (rowRates[(i as any).id] ?? 1),
    0,
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onRateChange?.(displayTotal);
  }, [rowRates]);

  const handleRowRateChange = (id: string, rate: number) => {
    setRowRates(prev => ({ ...prev, [id]: rate }));
  };

  const processColumns: ColumnsType<StyleProcess> = [
    {
      title: '序号', key: 'sortOrder', width: 70, align: 'center',
      render: (_: unknown, __: StyleProcess, index: number) => index + 1,
    },
    {
      title: '进度阶段', dataIndex: 'progressStage', key: 'progressStage', width: 140,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '倍率', key: 'rowRate', width: 100, align: 'center',
      render: (_: unknown, record: StyleProcess) => (
        <InputNumber
          value={getRowRate(record)}
          min={0.01}
          max={99}
          step={0.1}
          size="small"
          style={{ width: 75 }}
          disabled={isLocked}
          onChange={(v) => handleRowRateChange(String((record as any).id), v ?? 1)}
        />
      ),
    },
    {
      title: '工序合计', dataIndex: 'price', key: 'price', width: 180, align: 'right',
      render: (v: unknown, record: StyleProcess) => {
        const price = toNumberSafe(v);
        const rate = getRowRate(record);
        return <span style={{ fontWeight: 600 }}>¥{(price * rate).toFixed(2)}</span>;
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
      <div style={{ textAlign: 'right', padding: '6px 12px', borderTop: '1px solid var(--color-border-secondary)' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--primary-color)' }}>
          工序小计：¥{displayTotal.toFixed(2)}
        </span>
      </div>
    </Card>
  );
};

export default QuotationProcessSection;
