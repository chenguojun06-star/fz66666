import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Popover } from 'antd';
import { useNavigate } from 'react-router-dom';
import PieChartCard, { PieSegment, TodayStat } from '@/components/PieChartCard';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { StyleInfo } from '@/types/style';
import './SamplePieChart.css';

interface StageConfig {
  key: string;
  label: string;
  color: string;
}

const STAGES: StageConfig[] = [
  { key: 'pattern', label: '纸样', color: '#3b82f6' },
  { key: 'sample', label: '样衣', color: '#10b981' },
  { key: 'bom', label: 'BOM', color: '#f59e0b' },
  { key: 'process', label: '工序', color: '#8b5cf6' },
  { key: 'size', label: '码数', color: '#06b6d4' },
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

interface SamplePieChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

const SamplePieChart: React.FC<SamplePieChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [styles, setStyles] = useState<StyleInfo[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange();
        const res = await api.get<{ code: number; data: { records?: StyleInfo[] } }>('/style/info/list', {
          params: {
            page: 1,
            pageSize: 500,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        });
        setStyles(res?.data?.records || []);
      } catch (e) {
        console.error('Load styles failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [dimension, getDateRange]);

  const styleList = useMemo(() => {
    return styles
      .filter(s => s.styleNo)
      .map(s => ({ styleNo: s.styleNo, styleName: s.styleName }));
  }, [styles]);

  const prevStyleListRef = useRef<string>('');
  const prevPositionRef = useRef<string>('');

  useEffect(() => {
    if (mode !== 'stage' || !styleLink || !moduleKey || !position || styleList.length === 0) return;

    const styleListKey = styleList.map(s => s.styleNo).sort().join(',');
    const positionKey = `${position.x},${position.y},${position.width},${position.height}`;

    if (prevStyleListRef.current === styleListKey && prevPositionRef.current === positionKey) {
      return;
    }

    prevStyleListRef.current = styleListKey;
    prevPositionRef.current = positionKey;

    styleLink.registerStyle(moduleKey, styleList, position);
  }, [mode, styleLink, moduleKey, position, styleList]);

  useEffect(() => {
    return () => {
      if (styleLink && moduleKey) {
        styleLink.unregisterModule(moduleKey);
      }
    };
  }, [styleLink, moduleKey]);

  const stats = useMemo(() => {
    const total = styles.length;
    const inDev = styles.filter(s => {
      const patternOk = isCompleted('pattern', s);
      const sampleOk = isCompleted('sample', s);
      return (patternOk || String(s.patternStatus).toUpperCase() === 'IN_PROGRESS') && !sampleOk;
    }).length;
    const completed = styles.filter(s => isCompleted('sample', s)).length;

    const stageCounts: PieSegment[] = STAGES.map((stage, index) => {
      const prevStage = index > 0 ? STAGES[index - 1] : null;

      const matchedStyles = styles.filter(s => {
        const currentCompleted = isCompleted(stage.key, s);
        const prevCompleted = prevStage ? isCompleted(prevStage.key, s) : true;

        const isInCurrentStage = !currentCompleted;
        const prevStageDone = prevCompleted || index === 0;

        return isInCurrentStage && prevStageDone;
      });

      return {
        key: stage.key,
        label: stage.label,
        color: stage.color,
        count: matchedStyles.length,
      };
    });

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

    const todayStats: TodayStat[] = [
      { label: '今日下样', value: todayNewStyles.length },
      { label: '今日完成', value: todayCompletedStyles.length, type: 'success' },
    ];

    return {
      total,
      inDev,
      completed,
      stageCounts,
      avgDays,
      todayStats,
    };
  }, [styles]);

  const todayCompletedCount = styles.filter(s => isToday(s.sampleCompletedTime)).length;

  const overdueStyles = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return styles.filter(s =>
      !s.sampleCompletedTime && s.deliveryDate && new Date(s.deliveryDate) < today
    );
  }, [styles]);

  const navigate = useNavigate();
  const hasOverdue = overdueStyles.length > 0;

  const overduePopover = (
    <div style={{ maxHeight: 240, overflowY: 'auto', minWidth: 200 }}>
      {overdueStyles.slice(0, 15).map((s, i) => {
        const days = Math.floor((Date.now() - new Date(s.deliveryDate!).getTime()) / 86400000);
        return (
          <div
            key={s.styleNo || i}
            onClick={() => navigate('/style-info')}
            style={{
              padding: '4px 0',
              cursor: 'pointer',
              fontSize: 12,
              color: '#374151',
              borderBottom: i < overdueStyles.length - 1 ? '1px solid #f3f4f6' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.styleNo}{s.styleName ? ` ${s.styleName}` : ''}
            </span>
            <span style={{ color: '#ef4444', flexShrink: 0 }}>逾期{days}天</span>
          </div>
        );
      })}
      {overdueStyles.length > 15 && (
        <div style={{ paddingTop: 4, fontSize: 11, color: '#9ca3af' }}>还有{overdueStyles.length - 15}条…</div>
      )}
      {overdueStyles.length === 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>暂无逾期款式</div>
      )}
    </div>
  );

  const statusDot = (
    <Popover content={overduePopover} trigger="hover" placement="bottomLeft">
      <span className={`status-dot ${hasOverdue ? 'status-dot--red' : 'status-dot--green'}`} />
    </Popover>
  );

  if (mode === 'stage') {
    return (
      <>
        <div className="sample-stage-header">
          <span className="sample-stage-title">样衣开发</span>
          {statusDot}
        </div>
        <PieChartCard
          mode={mode}
          title="样衣开发"
          total={stats.total}
          inProgress={stats.inDev}
          completed={stats.completed}
          todayCompleted={todayCompletedCount}
          todayCompletedUnit="款"
          avgTime={formatDays(stats.avgDays)}
          inProgressLabel="开发中"
          segments={stats.stageCounts}
          loading={loading}
          todayStats={stats.todayStats}
        />
      </>
    );
  }

  return (
    <PieChartCard
      mode={mode}
      title="样衣开发"
      total={stats.total}
      inProgress={stats.inDev}
      completed={stats.completed}
      todayCompleted={todayCompletedCount}
      todayCompletedUnit="款"
      avgTime={formatDays(stats.avgDays)}
      inProgressLabel="开发中"
      segments={stats.stageCounts}
      loading={loading}
      todayStats={stats.todayStats}
    />
  );
};

export default React.memo(SamplePieChart);
