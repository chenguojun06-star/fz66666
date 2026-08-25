import React, { useMemo, useState } from 'react';
import { Segmented, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useDelayedStageBreakdown } from '../DelayedStageBreakdown/useDelayedStageBreakdown';
import type { TabKey } from '../DelayedStageBreakdown/useDelayedStageBreakdown';
import './styles.css';

const TAB_OPTIONS = [
  { label: '大货', value: 'bulk' as TabKey },
  { label: '样衣', value: 'sample' as TabKey },
];

const MAX_BARS = 6;

/**
 * 生产瓶颈卡 — 延期订单按环节分布（后端 /dashboard/delayed-stage-breakdown）
 * 点击某环节跳转主列表并带精确 IDs 筛选
 */
const ProductionBottleneckCard: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('bulk');
  const { stageHints, total, loading } = useDelayedStageBreakdown({ forceTab: tab });

  const bars = useMemo(() => {
    const sorted = [...stageHints].sort((a, b) => b.count - a.count).slice(0, MAX_BARS);
    const max = sorted.reduce((m, b) => Math.max(m, b.count), 1);
    return { sorted, max };
  }, [stageHints]);

  const unit = tab === 'bulk' ? '单' : '款';

  return (
    <div className="dashboard-card bn-card">
      <div className="card-header">
        <h3 className="card-title">生产瓶颈</h3>
        <div className="bn-header-right">
          {total > 0 && <span className="bn-total">{total} {unit}延期</span>}
          <Segmented
            size="small"
            options={TAB_OPTIONS}
            value={tab}
            onChange={v => setTab(v as TabKey)}
          />
        </div>
      </div>
      <div className="card-content">
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} title={false} />
        ) : bars.sorted.length === 0 ? (
          <div className="bn-empty">
            <span className="bn-empty-icon">✓</span>
            <span className="bn-empty-text">{tab === 'bulk' ? '大货' : '样衣'}各环节无延期</span>
          </div>
        ) : (
          <div className="bn-bars">
            {bars.sorted.map(stage => (
              <button
                key={stage.key}
                type="button"
                className="bn-bar-row"
                onClick={() => navigate(stage.buildNavigateUrl())}
                title={`查看${stage.stageName}延期的${unit}`}
              >
                <span className="bn-bar-name">{stage.stageName}</span>
                <span className="bn-bar-track">
                  <span
                    className="bn-bar-fill"
                    style={{ width: `${Math.max((stage.count / bars.max) * 100, 6)}%` }}
                  />
                </span>
                <span className="bn-bar-count">{stage.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductionBottleneckCard;
