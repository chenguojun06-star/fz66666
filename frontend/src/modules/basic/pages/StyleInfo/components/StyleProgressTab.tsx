import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Spin, Tag } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/utils/api';

interface Props {
  styleId: string;
  styleNo: string;
  onRefresh?: () => void;
}

interface DevStage {
  key: string;
  name: string;
  startTime: string | null;
  completeTime: string | null;
  assignee: string | null;
}

interface ProdStage {
  operationType: string;
  processName: string;
  scanTime: string | null;
  operatorName: string | null;
}

const DEV_STAGES_CONFIG = [
  { key: 'bom', name: 'BOM清单', startField: 'bomStartTime', completeField: 'bomCompletedTime', assigneeField: 'bomAssignee' },
  { key: 'pattern', name: '纸样开发', startField: 'patternStartTime', completeField: 'patternCompletedTime', assigneeField: 'patternAssignee' },
  { key: 'process', name: '工序单价', startField: 'processStartTime', completeField: 'processCompletedTime', assigneeField: 'processAssignee' },
  { key: 'secondary', name: '二次工艺', startField: 'secondaryStartTime', completeField: 'secondaryCompletedTime', assigneeField: 'secondaryAssignee' },
  { key: 'production', name: '生产制单', startField: 'productionStartTime', completeField: 'productionCompletedTime', assigneeField: 'productionAssignee' },
];

const PROD_STAGES_CONFIG = [
  { operationType: 'RECEIVE', processName: '领取样衣' },
  { operationType: 'PLATE', processName: '车板' },
  { operationType: 'FOLLOW_UP', processName: '跟单确认' },
  { operationType: 'COMPLETE', processName: '完成确认' },
  { operationType: 'WAREHOUSE_IN', processName: '样衣入库' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待领取',
  IN_PROGRESS: '制作中',
  PRODUCTION_COMPLETED: '生产完成',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
  WAREHOUSE_OUT: '已出库',
  WAREHOUSE_RETURN: '已归还',
  SCRAPPED: '已报废',
  RECEIVED: '已领取',
  REWORK: '返工中',
};

const fmt = (v: string | null | undefined) => {
  if (!v) return null;
  const d = dayjs(String(v));
  return d.isValid() ? d.format('MM-DD HH:mm') : null;
};

const StageNode: React.FC<{
  name: string;
  startTime: string | null;
  completeTime: string | null;
  assignee: string | null;
  isCompleted: boolean;
  isActive: boolean;
  isLast: boolean;
}> = ({ name, startTime, completeTime, assignee, isCompleted, isActive, isLast }) => {
  let icon = <ClockCircleOutlined />;
  let color = 'var(--color-text-quaternary, var(--color-text-quaternary))';
  let bgColor = 'var(--color-bg-subtle, var(--color-bg-subtle))';
  if (isCompleted) {
    icon = <CheckCircleOutlined />;
    color = 'var(--color-bg-base)';
    bgColor = 'var(--color-success)';
  } else if (isActive) {
    icon = <PlayCircleOutlined />;
    color = 'var(--color-bg-base)';
    bgColor = 'var(--color-primary)';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: 100, gap: 4, padding: '8px 0',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: bgColor, color, fontSize: 20,
          transition: 'all 0.3s',
        }}>
          {icon}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)',
          textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        {startTime && (
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
            领取：{fmt(startTime)}
          </div>
        )}
        {completeTime && (
          <div style={{ fontSize: 10, color: 'var(--color-success)', textAlign: 'center' }}>
            完成：{fmt(completeTime)}
          </div>
        )}
        {assignee && (
          <div style={{
            fontSize: 10, color: 'var(--color-text-quaternary)',
            textAlign: 'center', maxWidth: 80,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {String(assignee)}
          </div>
        )}
      </div>
      {!isLast && (
        <div style={{
          width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          alignSelf: 'center', marginTop: -20,
        }}>
          <div style={{
            width: '100%', height: 2,
            background: isCompleted ? 'var(--color-success)' : 'var(--color-border, #e8e8e8)',
            borderRadius: 1,
          }} />
        </div>
      )}
    </div>
  );
};

const StyleProgressTab: React.FC<Props> = ({ styleId, styleNo }) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [pattern, setPattern] = useState<Record<string, any> | null>(null);
  const [scanRecords, setScanRecords] = useState<Record<string, any>[]>([]);

  const loadData = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const detailRes = await api.get(`/style/info/${styleId}`);
      const d = (detailRes as any)?.data;
      if (d) setDetail(d);

      const patternRes = await api.get(`/production/pattern/by-style/${styleId}`);
      const pData = (patternRes as any)?.data;
      if (pData) {
        setPattern(pData);
        const scanRes = await api.get(`/production/pattern/${pData.id}/scan-records`);
        setScanRecords(Array.isArray((scanRes as any)?.data) ? (scanRes as any).data : []);
      } else {
        setPattern(null);
        setScanRecords([]);
      }
    } catch {
      setDetail(null);
      setPattern(null);
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const devStages = useMemo<DevStage[]>(() => {
    if (!detail) return [];
    return DEV_STAGES_CONFIG.map((cfg) => ({
      key: cfg.key,
      name: cfg.name,
      startTime: (detail as any)[cfg.startField] || null,
      completeTime: (detail as any)[cfg.completeField] || null,
      assignee: (detail as any)[cfg.assigneeField] || null,
    }));
  }, [detail]);

  const prodStages = useMemo<ProdStage[]>(() => {
    return PROD_STAGES_CONFIG.map((cfg) => {
      const matched = scanRecords.filter(
        (r) => String(r.operationType || '').toUpperCase() === cfg.operationType
      );
      const firstScan = matched.find((r) => r.scanTime);
      const lastScan = matched.length > 0 ? matched[matched.length - 1] : null;
      return {
        operationType: cfg.operationType,
        processName: cfg.processName,
        scanTime: firstScan?.scanTime || null,
        operatorName: lastScan?.operatorName || firstScan?.operatorName || null,
      };
    });
  }, [scanRecords]);

  const allStages = useMemo(() => {
    const result: Array<DevStage | ProdStage> = [];
    devStages.forEach((s) => result.push(s));
    prodStages.forEach((s) => result.push(s));
    return result;
  }, [devStages, prodStages]);

  const currentStageIndex = useMemo(() => {
    for (let i = allStages.length - 1; i >= 0; i--) {
      const s = allStages[i];
      const done = 'completeTime' in s ? !!s.completeTime : false;
      if (done) return i + 1;
    }
    return 0;
  }, [allStages]);

  const overdueDays = useMemo(() => {
    const delivery = pattern?.deliveryTime;
    if (!delivery) return 0;
    const d = dayjs(String(delivery));
    if (d.isBefore(dayjs(), 'day')) return dayjs().diff(d, 'day');
    return 0;
  }, [pattern]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载中..." /></div>;
  }

  if (!detail) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Empty description="暂无样衣开发记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const statusStr = pattern ? String(pattern.status || '').toUpperCase() : '';

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 16px', marginBottom: 16,
        background: 'var(--color-bg-subtle, var(--color-bg-container))',
        borderRadius: 8, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          款号：{styleNo}
        </div>
        {pattern && (
          <Tag color={statusStr === 'PENDING' ? 'default' : statusStr === 'IN_PROGRESS' ? 'processing' : 'success'}>
            {STATUS_LABELS[statusStr] ?? '未知'}
          </Tag>
        )}
        {pattern?.quantity && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            数量：{pattern.quantity} 件
          </div>
        )}
        {pattern?.deliveryTime && (
          <div style={{ fontSize: 13, color: overdueDays > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
            交期：{dayjs(String(pattern.deliveryTime)).format('YYYY-MM-DD')}
            {overdueDays > 0 && <span style={{ marginLeft: 4, color: 'var(--color-danger)', fontWeight: 600 }}>逾{overdueDays}天</span>}
          </div>
        )}
        {pattern?.patternMaker && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            纸样师傅：{String(pattern.patternMaker)}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 0,
        overflowX: 'auto', padding: '8px 0',
      }}>
        {allStages.map((stage, idx) => {
          const isDev = 'key' in stage;
          const isCompleted = isDev ? !!stage.completeTime : false;
          const isActive = !isCompleted && idx === currentStageIndex;
          const isLast = idx === allStages.length - 1;

          if (isDev) {
            const ds = stage as DevStage;
            return (
              <StageNode
                key={ds.key}
                name={ds.name}
                startTime={ds.startTime}
                completeTime={ds.completeTime}
                assignee={ds.assignee}
                isCompleted={isCompleted}
                isActive={isActive}
                isLast={isLast}
              />
            );
          }

          const ps = stage as ProdStage;
          return (
            <StageNode
              key={ps.operationType}
              name={ps.processName}
              startTime={ps.scanTime}
              completeTime={ps.scanTime}
              assignee={ps.operatorName}
              isCompleted={!!ps.scanTime}
              isActive={!ps.scanTime && idx === currentStageIndex}
              isLast={isLast}
            />
          );
        })}
      </div>
    </div>
  );
};

export default StyleProgressTab;
