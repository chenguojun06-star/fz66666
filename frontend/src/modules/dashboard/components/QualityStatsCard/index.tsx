import React, { useCallback, useEffect, useState } from 'react';
import { Segmented, Skeleton } from 'antd';
import api from '@/utils/api';
import './styles.css';

interface QualityStats {
  totalWarehousing?: number;
  defectiveCount?: number;
  defectRate?: number;
  qualifiedRate?: number;
  repairIssues?: number;
}

type RangeKey = 'day' | 'week' | 'month';

const RANGE_OPTIONS = [
  { label: '今日', value: 'day' as RangeKey },
  { label: '本周', value: 'week' as RangeKey },
  { label: '本月', value: 'month' as RangeKey },
];

const RANGE_LABEL: Record<RangeKey, string> = { day: '今日', week: '本周', month: '本月' };

/**
 * 品质概览卡 — 质检合格率/次品率/返修统计（后端 /dashboard/quality-stats）
 */
const QualityStatsCard: React.FC = () => {
  const [range, setRange] = useState<RangeKey>('week');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QualityStats | null>(null);

  const fetchData = useCallback(async (r: RangeKey) => {
    setLoading(true);
    try {
      const result = await api.get<{ code: number; data: QualityStats }>('/dashboard/quality-stats', {
        params: { range: r },
      });
      if (result?.code === 200) {
        setData(result.data || {});
      }
    } catch {
      // 静默失败，保持空态展示
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(range);
  }, [range, fetchData]);

  const qualifiedRate = data?.qualifiedRate ?? 0;
  const total = data?.totalWarehousing ?? 0;
  // 无入库数据时合格率无意义，置灰展示
  const hasData = total > 0;
  const rateLevel = !hasData ? 'muted' : qualifiedRate >= 98 ? 'good' : qualifiedRate >= 95 ? 'fair' : 'bad';

  return (
    <div className="dashboard-card qs-card">
      <div className="card-header">
        <h3 className="card-title">品质概览</h3>
        <Segmented
          size="small"
          options={RANGE_OPTIONS}
          value={range}
          onChange={v => setRange(v as RangeKey)}
        />
      </div>
      <div className="card-content">
        {loading ? (
          <div className="qs-body">
            <Skeleton active paragraph={{ rows: 3 }} title={false} />
          </div>
        ) : (
          <div className="qs-body">
            <div className={`qs-rate-block is-${rateLevel}`}>
              <span className="qs-rate-label">{RANGE_LABEL[range]}合格率</span>
              <span className="qs-rate-value">
                {hasData ? `${qualifiedRate.toFixed(1)}%` : '--'}
              </span>
              <span className="qs-rate-sub">
                次品率 {hasData ? `${(data?.defectRate ?? 0).toFixed(1)}%` : '--'}
              </span>
            </div>
            <div className="qs-stats">
              <div className="qs-stat-row">
                <span className="qs-stat-label">入库总数</span>
                <span className="qs-stat-value">{total.toLocaleString()}</span>
              </div>
              <div className="qs-stat-row">
                <span className="qs-stat-label">次品数量</span>
                <span className={`qs-stat-value ${(data?.defectiveCount ?? 0) > 0 ? 'is-bad-text' : ''}`}>
                  {(data?.defectiveCount ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="qs-stat-row">
                <span className="qs-stat-label">返修问题</span>
                <span className={`qs-stat-value ${(data?.repairIssues ?? 0) > 0 ? 'is-warn-text' : ''}`}>
                  {(data?.repairIssues ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QualityStatsCard;
