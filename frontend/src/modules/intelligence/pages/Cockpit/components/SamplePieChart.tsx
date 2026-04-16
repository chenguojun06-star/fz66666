import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Empty, Popover } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import api from '@/utils/api';
import type { StyleInfo } from '@/types/style';
import './SamplePieChart.css';

const STAGES = [
  { key: 'pattern', label: '纸样' },
  { key: 'sample', label: '样衣' },
  { key: 'bom', label: 'BOM' },
  { key: 'process', label: '工序' },
  { key: 'size', label: '码数' },
];

const isCompleted = (stage: string, style: StyleInfo): boolean => {
  const status = String(style[`${stage}Status` as keyof StyleInfo] || '').toUpperCase();
  const completedTime = style[`${stage}CompletedTime` as keyof StyleInfo];
  return status === 'COMPLETED' || !!completedTime;
};

const formatDays = (days: number): string => {
  if (days < 1) return '<1天';
  if (days < 30) return `${Math.round(days)}天`;
  const months = Math.floor(days / 30);
  const remainDays = Math.round(days % 30);
  return remainDays > 0 ? `${months}月${remainDays}天` : `${months}月`;
};

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const SamplePieChart: React.FC = () => {
  const { getDateRange } = useTimeDimension();
  const [loading, setLoading] = useState(true);
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const res = await api.get<{ code: number; data: { records?: StyleInfo[] } }>('/style/info/list', {
        params: { page: 1, pageSize: 500, startDate: start.toISOString(), endDate: end.toISOString() },
      });
      setStyles(res?.data?.records || []);
    } catch (e) {
      console.error('Load styles failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const total = styles.length;
    const completed = styles.filter(s => isCompleted('sample', s)).length;
    const inDev = total - completed;

    const stageCounts = STAGES.map(stage => ({
      key: stage.key,
      label: stage.label,
      count: styles.filter(s => !isCompleted(stage.key, s)).length,
    }));

    const completedStyles = styles.filter(s => s.sampleCompletedTime && s.createTime);
    let avgDays = 0;
    if (completedStyles.length > 0) {
      const totalDays = completedStyles.reduce((sum, s) => {
        const start = new Date(s.createTime!).getTime();
        const end = new Date(s.sampleCompletedTime!).getTime();
        return sum + (end - start) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDays = totalDays / completedStyles.length;
    }

    const todayNewStyles = styles.filter(s => isToday(s.createTime));
    const todayCompletedStyles = styles.filter(s => isToday(s.sampleCompletedTime));

    return { total, inDev, completed, stageCounts, avgDays, todayNewCount: todayNewStyles.length, todayCompletedCount: todayCompletedStyles.length };
  }, [styles]);

  const overdueStyles = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return styles.filter(s =>
      !s.sampleCompletedTime && s.deliveryDate && new Date(s.deliveryDate) < today
    );
  }, [styles]);

  const overduePopover = (
    <div style={{ maxHeight: 200, overflowY: 'auto', minWidth: 180 }}>
      {overdueStyles.slice(0, 10).map((s, i) => {
        const days = Math.floor((Date.now() - new Date(s.deliveryDate!).getTime()) / 86400000);
        return (
          <div key={s.styleNo || i} onClick={() => navigate('/style-info')} style={{ padding: '4px 0', cursor: 'pointer', fontSize: 12, borderBottom: i < overdueStyles.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.styleNo}</span>
            <span style={{ color: '#ef4444', flexShrink: 0 }}>逾期{days}天</span>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  if (stats.total === 0) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;
  }

  return (
    <div className="sample-card-wrapper">
      {/* 核心指标 */}
      <div className="sample-metrics">
        <div className="sample-metric">
          <div className="sample-metric-value">{stats.total}</div>
          <div className="sample-metric-label">总款数</div>
        </div>
        <div className="sample-metric">
          <div className="sample-metric-value sample-metric-value--primary">{stats.inDev}</div>
          <div className="sample-metric-label">开发中</div>
        </div>
        <div className="sample-metric">
          <div className="sample-metric-value sample-metric-value--success">{stats.completed}</div>
          <div className="sample-metric-label">已完成</div>
        </div>
        <div className="sample-metric">
          <div className="sample-metric-value">{formatDays(stats.avgDays)}</div>
          <div className="sample-metric-label">平均周期</div>
        </div>
      </div>

      {/* 开发阶段 */}
      <div className="sample-stages">
        {stats.stageCounts.map((stage) => (
          <div key={stage.key} className="sample-stage-item">
            <span className="sample-stage-label">{stage.label}</span>
            <span className="sample-stage-count">{stage.count}款</span>
          </div>
        ))}
      </div>

      {/* 今日数据 */}
      <div className="sample-today-row">
        <div className="sample-today-stat">
          <span className="sample-today-label">今日下样</span>
          <span className="sample-today-value">{stats.todayNewCount}款</span>
        </div>
        <div className="sample-today-stat">
          <span className="sample-today-label">今日完成</span>
          <span className="sample-today-value sample-today-value--success">{stats.todayCompletedCount}款</span>
        </div>
      </div>

      {/* 逾期预警 */}
      {overdueStyles.length > 0 && (
        <Popover content={overduePopover} trigger="hover" placement="bottomLeft">
          <div className="sample-warning-row" style={{ cursor: 'pointer' }}>
            <span className="sample-warning-label">⚠ 逾期款式</span>
            <span className="sample-warning-value">{overdueStyles.length}款</span>
          </div>
        </Popover>
      )}
    </div>
  );
};

export default React.memo(SamplePieChart);
