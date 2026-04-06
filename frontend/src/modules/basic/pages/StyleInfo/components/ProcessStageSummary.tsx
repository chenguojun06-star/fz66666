import React from 'react';
import { toNumberSafe } from '@/utils/api';

interface ProcessRow {
  price?: number | string;
  progressStage?: string;
  processName?: string;
  rateMultiplier?: number | null;
}

interface Props {
  data: ProcessRow[];
}

const STAGES = ['裁剪', '二次工艺', '车缝', '尾部'] as const;

const ProcessStageSummary: React.FC<Props> = ({ data }) => {
  const stageSummary = React.useMemo(() => {
    const stages: Record<string, {
      count: number;
      total: number;
      multiplierDetails: { name: string; base: number; multiplier: number; effective: number }[];
    }> = {};
    STAGES.forEach((s) => { stages[s] = { count: 0, total: 0, multiplierDetails: [] }; });

    data.forEach((row) => {
      const stage = String(row.progressStage || '车缝').trim();
      const base = toNumberSafe(row.price);
      const multiplier = (row.rateMultiplier != null && row.rateMultiplier !== 1)
        ? toNumberSafe(row.rateMultiplier)
        : 1;
      const effective = base * multiplier;

      if (!stages[stage]) return;
      stages[stage].count += 1;
      stages[stage].total += effective;

      if (multiplier !== 1) {
        stages[stage].multiplierDetails.push({
          name: row.processName || stage,
          base,
          multiplier,
          effective,
        });
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
    marginBottom: 4,
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

  const grandTotal = STAGES.reduce((sum, s) => sum + (stageSummary[s]?.total ?? 0), 0);
  const grandCount = STAGES.reduce((sum, s) => sum + (stageSummary[s]?.count ?? 0), 0);

  return (
    <div style={{ padding: '8px 0' }}>
      {STAGES.map((stage) => {
        const info = stageSummary[stage];
        if (info.count === 0) return null;
        return (
          <React.Fragment key={stage}>
            <div style={rowStyle}>
              <span style={labelStyle}>{stage}</span>
              <span>
                <span style={valueStyle}>¥{info.total.toFixed(2)}</span>
                <span style={countStyle}>{info.count} 道</span>
              </span>
            </div>
            {info.multiplierDetails.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                {/* 列标题 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 60px 52px 72px',
                  padding: '2px 10px 2px 22px',
                  fontSize: 10,
                  color: '#8c8c8c',
                  letterSpacing: '0.2px',
                }}>
                  <span>工序</span>
                  <span style={{ textAlign: 'right' }}>单价</span>
                  <span style={{ textAlign: 'center' }}>倍率</span>
                  <span style={{ textAlign: 'right' }}>汇总</span>
                </div>
                {info.multiplierDetails.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 52px 72px',
                      alignItems: 'center',
                      padding: '4px 10px 4px 22px',
                      background: '#fffbe6',
                      borderRadius: 3,
                      marginBottom: 3,
                      border: '1px solid #ffe58f',
                      fontSize: 11,
                      color: '#ad6800',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{d.name}</span>
                    <span style={{ textAlign: 'right' }}>¥{d.base.toFixed(2)}</span>
                    <span style={{ textAlign: 'center', color: '#d48800', fontWeight: 600 }}>×{d.multiplier}</span>
                    <span style={{ textAlign: 'right', fontWeight: 700 }}>¥{d.effective.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        background: '#e6f4ff',
        borderRadius: 4,
        border: '1px solid #91caff',
        marginTop: 2,
      }}>
        <span style={{ fontSize: 12, color: '#1677ff', fontWeight: 600 }}>单价汇总</span>
        <span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1677ff' }}>
            ¥{grandTotal.toFixed(2)}
          </span>
          <span style={{ fontSize: 11, color: '#4096ff', marginLeft: 8 }}>
            {grandCount} 道
          </span>
        </span>
      </div>
    </div>
  );
};

export default ProcessStageSummary;

