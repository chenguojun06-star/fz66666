import React, { useEffect, useState, useMemo, useRef } from 'react';
import PieChartCard, { PieSegment } from '@/components/PieChartCard';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { StyleInfo } from '@/types/style';

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
  { key: 'size', label: '码数', color: '#ec4899' },
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

    const stageCounts = STAGES.map((stage, index) => {
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

    return { total, inDev, completed, stageCounts, avgDays };
  }, [styles]);

  const segments: PieSegment[] = stats.stageCounts;

  return (
    <PieChartCard
      mode={mode}
      title="样衣开发"
      total={stats.total}
      inProgress={stats.inDev}
      completed={stats.completed}
      avgTime={formatDays(stats.avgDays)}
      segments={segments}
      loading={loading}
    />
  );
};

export default React.memo(SamplePieChart);
