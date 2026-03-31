import React from 'react';
import { toNumberSafe } from '@/utils/api';

interface ProcessRow {
  price?: number | string;
  progressStage?: string;
}

interface Props {
  data: ProcessRow[];
}

const ProcessStageSummary: React.FC<Props> = ({ data }) => {
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

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    background: '#fafafa',
    borderRadius: 4,
    marginBottom: 6,
    border: '1px solid #e8e8e8',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#595959',
    fontWeight: 500,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#262626',
  };

  const countStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#8c8c8c',
    marginLeft: 8,
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>工序单价拆解</div>
      <div style={rowStyle}>
        <span style={labelStyle}>裁剪</span>
        <span>
          <span style={valueStyle}>¥{stageSummary['裁剪'].total.toFixed(2)}</span>
          <span style={countStyle}>{stageSummary['裁剪'].count} 道</span>
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>车缝</span>
        <span>
          <span style={valueStyle}>¥{stageSummary['车缝'].total.toFixed(2)}</span>
          <span style={countStyle}>{stageSummary['车缝'].count} 道</span>
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>尾部</span>
        <span>
          <span style={valueStyle}>¥{stageSummary['尾部'].total.toFixed(2)}</span>
          <span style={countStyle}>{stageSummary['尾部'].count} 道</span>
        </span>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        background: '#e6f4ff',
        borderRadius: 4,
        border: '1px solid #91caff',
        marginBottom: 0,
      }}>
        <span style={{ fontSize: 12, color: '#1677ff', fontWeight: 600 }}>单价汇总</span>
        <span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1677ff' }}>
            ¥{(stageSummary['裁剪'].total + stageSummary['车缝'].total + stageSummary['尾部'].total).toFixed(2)}
          </span>
          <span style={{ fontSize: 11, color: '#4096ff', marginLeft: 8 }}>
            {stageSummary['裁剪'].count + stageSummary['车缝'].count + stageSummary['尾部'].count} 道
          </span>
        </span>
      </div>
    </div>
  );
};

export default ProcessStageSummary;
