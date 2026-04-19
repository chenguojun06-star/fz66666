import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Select, Empty, Tooltip } from 'antd';
import { getGraphAbStats, type ABSceneStat } from '@/services/intelligenceApi';

const SCENE_LABELS: Record<string, string> = {
  full: '综合分析',
  delivery_risk: '交期风险',
  sourcing: '采购供应',
  compliance: '合规审计',
  logistics: '仓储物流',
};

/** 场景之间的胜负标签 */
function winner(rows: ABSceneStat[], key: keyof ABSceneStat, higher = true): string | undefined {
  if (rows.length < 2) return undefined;
  let best = rows[0];
  for (const r of rows) {
    const v = Number(r[key]) || 0;
    const bv = Number(best[key]) || 0;
    if (higher ? v > bv : v < bv) best = r;
  }
  return best.scene;
}

const ABTestStatsPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ABSceneStat[]>([]);
  const [days, setDays] = useState(30);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGraphAbStats(days);
      setRows(data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetch(); }, [fetch]);

  const bestLatency = winner(rows, 'avgLatencyMs', false);
  const bestFeedback = winner(rows, 'avgFeedback', true);

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#888' }}>按场景对比近 {days} 天数据</span>
        <Select id="abTestDays" size="small" value={days} onChange={setDays} style={{ width: 100 }}
                options={[{ value: 7, label: '7 天' }, { value: 14, label: '14 天' }, { value: 30, label: '30 天' }]} />
      </div>

      {rows.length === 0 ? (
        <Empty description="暂无执行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(rows.length, 5)}, 1fr)`, gap: 10 }}>
          {rows.map(r => {
            const successRate = r.totalRuns > 0 ? Math.round(r.successCount / r.totalRuns * 100) : 0;
            const isBestLatency = r.scene === bestLatency;
            const isBestFeedback = r.scene === bestFeedback;
            return (
              <div key={r.scene} style={{
                background: '#1a1a2e', borderRadius: 8, padding: '12px 14px',
                border: (isBestLatency || isBestFeedback) ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#e0e0e0' }}>
                  {SCENE_LABELS[r.scene] || r.scene}
                  {isBestLatency && <Tooltip title="最低延迟"><span style={{ marginLeft: 4, fontSize: 11, color: '#4ade80' }}></span></Tooltip>}
                  {isBestFeedback && <Tooltip title="最高评分"><span style={{ marginLeft: 4, fontSize: 11, color: '#facc15' }}></span></Tooltip>}
                </div>
                <Metric label="执行次数" value={r.totalRuns} />
                <Metric label="成功率" value={`${successRate}%`} color={successRate >= 90 ? '#4ade80' : successRate >= 70 ? '#facc15' : '#f87171'} />
                <Metric label="平均延迟" value={`${r.avgLatencyMs ?? 0}ms`} />
                <Metric label="置信度" value={r.avgConfidence ?? '-'} />
                <Metric label="反馈评分" value={r.feedbackCount > 0 ? `${r.avgFeedback}/5 (${r.feedbackCount})` : '-'} />
              </div>
            );
          })}
        </div>
      )}
    </Spin>
  );
};

function Metric({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '22px' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: color ?? '#d4d4d8', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default ABTestStatsPanel;
