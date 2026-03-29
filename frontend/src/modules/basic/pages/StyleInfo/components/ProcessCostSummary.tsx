import React from 'react';
import { toNumberSafe } from '@/utils/api';

interface ProcessRow {
  price?: number | string;
  progressStage?: string;
}

interface Props {
  data: ProcessRow[];
}

const ProcessCostSummary: React.FC<Props> = ({ data }) => {
  const stageSummary = React.useMemo(() => {
    const stages: Record<string, { count: number; total: number }> = {
      '裁剪': { count: 0, total: 0 },
      '车缝': { count: 0, total: 0 },
      '尾部': { count: 0, total: 0 },
    };
    data.forEach((row) => {
      const stage = String(row.progressStage || '车缝').trim();
      const price = toNumberSafe(row.price);
      if (stages[stage]) {
        stages[stage].count += 1;
        stages[stage].total += price;
      }
    });
    return stages;
  }, [data]);

  const totalProcessCost = React.useMemo(() => {
    return data.reduce((sum, row) => sum + toNumberSafe(row.price), 0);
  }, [data]);

  const cardStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: '#fafafa',
    borderRadius: 6,
    border: '1px solid #e8e8e8',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#8c8c8c',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#262626',
  };

  const subStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#bfbfbf',
    marginLeft: 'auto',
  };

  return (
    <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
      <div style={cardStyle}>
        <span style={labelStyle}>工序单价（总计）</span>
        <span style={valueStyle}>¥{totalProcessCost.toFixed(2)}</span>
        <span style={subStyle}>{data.length} 道工序</span>
      </div>
      <div style={cardStyle}>
        <span style={labelStyle}>裁剪</span>
        <span style={valueStyle}>¥{stageSummary['裁剪'].total.toFixed(2)}</span>
        <span style={subStyle}>{stageSummary['裁剪'].count} 道工序</span>
      </div>
      <div style={cardStyle}>
        <span style={labelStyle}>车缝</span>
        <span style={valueStyle}>¥{stageSummary['车缝'].total.toFixed(2)}</span>
        <span style={subStyle}>{stageSummary['车缝'].count} 道工序</span>
      </div>
      <div style={cardStyle}>
        <span style={labelStyle}>尾部</span>
        <span style={valueStyle}>¥{stageSummary['尾部'].total.toFixed(2)}</span>
        <span style={subStyle}>{stageSummary['尾部'].count} 道工序</span>
      </div>
    </div>
  );
};

export default ProcessCostSummary;
