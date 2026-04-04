import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Spin, Tag, Button } from 'antd';
import { ThunderboltOutlined, WarningOutlined, CheckCircleOutlined, BulbOutlined } from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { useNavigate } from 'react-router-dom';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import './InsightCard.css';

interface InsightItem {
  level: string;
  title: string;
  summary: string;
  painPoint?: string;
  confidence?: string;
  source?: string;
  evidence?: string[];
  note?: string;
  execute?: string;
  actionLabel?: string;
  actionPath?: string;
}

interface AiBrainData {
  summary: {
    healthGrade: string;
    healthIndex: number;
    todayScanQty: number;
    anomalyCount: number;
    highRiskOrders: number;
    topRisk?: string;
  };
  modelGateway: {
    status: string;
    provider: string;
    activeModel: string;
    fallbackEnabled: boolean;
  };
  signals: Array<{
    level: string;
    title: string;
    relatedOrderNo?: string;
  }>;
}

interface ActionTask {
  taskCode: string;
  title: string;
  priority: string;
  escalationLevel: number;
  relatedOrderNo?: string;
  dueHint?: string;
  autoExecutable?: boolean;
  routePath?: string;
}

interface InsightCardProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

const levelColor = (level: string): string => {
  switch (level?.toUpperCase()) {
    case 'CRITICAL': return '#ff4136';
    case 'WARNING': return '#f7a600';
    case 'INFO': return '#00e5ff';
    case 'SUCCESS': return '#39ff14';
    default: return '#64748b';
  }
};

const InsightCard: React.FC<InsightCardProps> = ({ mode = 'sidebar', moduleKey: _moduleKey, position: _position }) => {
  const { dimension, getDateRange: _getDateRange } = useTimeDimension();
  const _styleLink = useStyleLink();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [brainData, setBrainData] = useState<AiBrainData | null>(null);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [actionTasks, setActionTasks] = useState<ActionTask[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [brainRes, actionRes] = await Promise.all([
          api.get<{ code: number; data: AiBrainData }>('/intelligence/brain/unified-snapshot'),
          api.get<{ code: number; data: { tasks: ActionTask[] } }>('/intelligence/action-center'),
        ]);
        setBrainData(brainRes?.data || null);
        setActionTasks(actionRes?.data?.tasks || []);

        // 从真实 brain signals 生成洞察
        const realInsights: InsightItem[] = (brainRes?.data?.signals || []).map((sig) => ({
          level: sig.level || 'INFO',
          title: sig.title || '系统信号',
          summary: sig.relatedOrderNo ? `关联订单 ${sig.relatedOrderNo}` : sig.title || '',
        }));
        setInsights(realInsights);
      } catch (e) {
        console.error('Load insight data failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [dimension]);

  useEffect(() => {
    if (mode !== 'stage' || !containerRef.current) return;
    const el = containerRef.current;
    const parentEl = el.parentElement;
    const targetEl = parentEl || el;

    const update = () => {
      const w = targetEl.getBoundingClientRect().width;
      const h = targetEl.getBoundingClientRect().height;
      const minDim = Math.min(w, h);
      setScale(Math.max(0.5, Math.min(2.5, minDim / 400)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => ro.disconnect();
  }, [mode]);

  const stats = useMemo(() => {
    const criticalCount = actionTasks.filter(t => t.priority === 'CRITICAL').length;
    const highCount = actionTasks.filter(t => t.priority === 'HIGH').length;
    const warningSignals = brainData?.signals?.filter(s => s.level === 'WARNING' || s.level === 'CRITICAL').length || 0;

    return {
      criticalCount,
      highCount,
      warningSignals,
      healthGrade: brainData?.summary?.healthGrade || '—',
      healthIndex: brainData?.summary?.healthIndex || 0,
    };
  }, [actionTasks, brainData]);

  if (loading) return <div className="insight-card-loading"><Spin /></div>;
  if (mode === 'sidebar') {
    return (
      <div className="insight-sidebar">
        <div className="insight-sidebar-title">AI 智能洞察</div>
        <div className="insight-sidebar-stats">
          <div className="insight-stat-item">
            <span className="insight-stat-value" style={{ color: stats.healthGrade === 'A' ? '#39ff14' : '#f7a600' }}>
              {stats.healthGrade}
            </span>
            <span className="insight-stat-label">健康等级</span>
          </div>
          <div className="insight-stat-item">
            <span className="insight-stat-value" style={{ color: stats.criticalCount > 0 ? '#ff4136' : '#39ff14' }}>
              {stats.criticalCount}
            </span>
            <span className="insight-stat-label">紧急任务</span>
          </div>
        </div>
        <div className="insight-sidebar-rows">
          {insights.slice(0, 3).map((item, idx) => (
            <div key={idx} className="insight-sidebar-row">
              <span className="insight-sidebar-dot" style={{ background: levelColor(item.level) }} />
              <span className="insight-sidebar-text">{item.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="insight-stage-wrapper" style={{ '--insight-scale': scale } as React.CSSProperties}>
      <div className="insight-stage-header">
        <div className="insight-stage-title">
          <XiaoyunCloudAvatar size={20} active />
          小云智能洞察
        </div>
        <div className="insight-stage-summary">
          <span className="insight-summary-item">
            <span className="insight-summary-value" style={{ color: stats.healthGrade === 'A' ? '#39ff14' : '#f7a600' }}>
              {stats.healthGrade}
            </span>
            <span className="insight-summary-label">健康</span>
          </span>
          <span className="insight-summary-item">
            <span className="insight-summary-value">{stats.healthIndex}</span>
            <span className="insight-summary-label">分数</span>
          </span>
          <span className="insight-summary-item">
            <span className="insight-summary-value" style={{ color: stats.criticalCount > 0 ? '#ff4136' : '#39ff14' }}>
              {stats.criticalCount}
            </span>
            <span className="insight-summary-label">紧急</span>
          </span>
        </div>
      </div>

      <div className="insight-stage-content">
        <div className="insight-brain-section">
          <div className="insight-section-title">
            <ThunderboltOutlined style={{ color: '#ffd700', marginRight: 6 }} />
            AI 大脑状态
          </div>
          <div className="insight-brain-grid">
            <div className="insight-brain-item">
              <span className="brain-label">模型状态</span>
              <span className="brain-value" style={{ color: brainData?.modelGateway?.status === 'CONNECTED' ? '#39ff14' : '#ff4136' }}>
                {brainData?.modelGateway?.status || '—'}
              </span>
            </div>
            <div className="insight-brain-item">
              <span className="brain-label">今日扫码</span>
              <span className="brain-value">{brainData?.summary?.todayScanQty?.toLocaleString() || 0}</span>
            </div>
            <div className="insight-brain-item">
              <span className="brain-label">异常项</span>
              <span className="brain-value" style={{ color: (brainData?.summary?.anomalyCount || 0) > 0 ? '#f7a600' : '#39ff14' }}>
                {brainData?.summary?.anomalyCount || 0}
              </span>
            </div>
            <div className="insight-brain-item">
              <span className="brain-label">高风险</span>
              <span className="brain-value" style={{ color: (brainData?.summary?.highRiskOrders || 0) > 0 ? '#ff4136' : '#39ff14' }}>
                {brainData?.summary?.highRiskOrders || 0}
              </span>
            </div>
          </div>
          {brainData?.summary?.topRisk && (
            <div className="insight-top-risk">
              <WarningOutlined style={{ color: '#f7a600', marginRight: 6 }} />
              {brainData.summary.topRisk}
            </div>
          )}
        </div>

        <div className="insight-cards-section">
          <div className="insight-section-title">
            <BulbOutlined style={{ color: '#00e5ff', marginRight: 6 }} />
            智能洞察卡片
          </div>
          <div className="insight-cards-list">
            {insights.length === 0 ? (
              <div className="insight-empty">
                <CheckCircleOutlined style={{ color: '#39ff14', marginRight: 6 }} />
                暂无预警，系统运行正常
              </div>
            ) : (
              insights.map((item, idx) => (
                <div
                  key={idx}
                  className={`insight-card-item insight-card-${item.level?.toLowerCase()} ${item.actionPath ? 'insight-card-clickable' : ''}`}
                  onClick={() => item.actionPath && navigate(item.actionPath)}
                  style={{ cursor: item.actionPath ? 'pointer' : 'default' }}
                >
                  <div className="insight-card-header">
                    <Tag style={{ background: `${levelColor(item.level)}22`, color: levelColor(item.level), border: 'none' }}>
                      {item.level}
                    </Tag>
                    <span className="insight-card-title">{item.title}</span>
                    {item.confidence && (
                      <span className="insight-card-confidence">置信度 {item.confidence}</span>
                    )}
                  </div>
                  <div className="insight-card-summary">{item.summary}</div>
                  {item.painPoint && (
                    <div className="insight-card-pain">
                      <span className="pain-label">痛点：</span>
                      {item.painPoint}
                    </div>
                  )}
                  {item.evidence && item.evidence.length > 0 && (
                    <div className="insight-card-evidence">
                      {item.evidence.map((e, i) => (
                        <span key={i} className="evidence-item">• {e}</span>
                      ))}
                    </div>
                  )}
                  {item.actionLabel && (
                    <Button size="small" type="link" className="insight-card-action">
                      {item.actionLabel} →
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {actionTasks.length > 0 && (
          <div className="insight-actions-section">
            <div className="insight-section-title">
              <ThunderboltOutlined style={{ color: '#ff4136', marginRight: 6 }} />
              待处理任务
            </div>
            <div className="insight-actions-list">
              {actionTasks.slice(0, 5).map((task, idx) => (
                <div key={`${task.taskCode}-${idx}`} className="insight-action-item">
                  <span
                    className="action-priority"
                    style={{
                      background: task.priority === 'CRITICAL' ? '#ff413622' : task.priority === 'HIGH' ? '#f7a60022' : '#00e5ff22',
                      color: task.priority === 'CRITICAL' ? '#ff4136' : task.priority === 'HIGH' ? '#f7a600' : '#00e5ff',
                    }}
                  >
                    L{task.escalationLevel}
                  </span>
                  <span className="action-title">{task.title}</span>
                  {task.dueHint && <span className="action-due">{task.dueHint}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(InsightCard);
