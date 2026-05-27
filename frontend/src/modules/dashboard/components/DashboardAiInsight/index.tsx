import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { RobotOutlined, BulbOutlined, AlertOutlined, SafetyOutlined, RightOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { PatrolSummary } from '@/services/intelligence/intelligenceApi';
import './DashboardAiInsight.css';

interface InsightItem {
  type: 'risk' | 'suggestion' | 'info' | 'patrol';
  icon: React.ReactNode;
  title: string;
  description: string;
  descriptionExtra?: string;
  action?: string;
  onClick?: () => void;
}

const severityColors: Record<string, string> = { HIGH: '#ff4d4f', MEDIUM: '#faad14', LOW: '#52c41a' };

const DashboardAiInsight: React.FC = () => {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [patrolSummary, setPatrolSummary] = useState<PatrolSummary | null>(null);

  const buildInsights = useCallback(async () => {
    setLoading(true);
    try {
      const [brainRes, actionRes, patrolRes] = await Promise.allSettled([
        intelligenceApi.getBrainSnapshot(),
        intelligenceApi.getActionCenter(),
        intelligenceApi.getPatrolSummary(),
      ]);

      const items: InsightItem[] = [];

      if (patrolRes.status === 'fulfilled' && patrolRes.value) {
        const patrol = patrolRes.value;
        if (patrol) {
          setPatrolSummary(patrol);
          if (patrol.highRiskPending > 0) {
            items.push({
              type: 'patrol',
              icon: <ThunderboltOutlined />,
              title: `AI巡检风险 (${patrol.highRiskPending}个高危)`,
              description: `${patrol.pendingCount}项待处理`,
              descriptionExtra: patrol.autoExecutedToday > 0 ? `今日AI自动处理${patrol.autoExecutedToday}项` : undefined,
              action: '查看详情',
              onClick: () => navigate('/intelligence/patrol'),
            });
          } else if (patrol.pendingCount > 0) {
            items.push({
              type: 'patrol',
              icon: <SafetyOutlined />,
              title: `AI巡检 (${patrol.pendingCount}项待处理)`,
              description: patrol.autoExecutedToday > 0 ? `今日AI自动处理${patrol.autoExecutedToday}项` : '暂无高危风险',
              action: '查看详情',
              onClick: () => navigate('/intelligence/patrol'),
            });
          }
        }
      }

      if (brainRes.status === 'fulfilled' && brainRes.value?.data) {
        const brain = brainRes.value.data;
        const s = brain.summary;
        if (s) {
          const parts: string[] = [];
          if (s.highRiskOrders > 0) parts.push(`${s.highRiskOrders}个高风险订单`);
          if (s.anomalyCount > 0) parts.push(`${s.anomalyCount}个异常`);
          if (s.stagnantFactories > 0) parts.push(`${s.stagnantFactories}家沉默工厂`);
          if (parts.length > 0) {
            items.push({
              type: 'info',
              icon: <BulbOutlined />,
              title: '运营感知',
              description: `健康度 ${s.healthGrade} — ${parts.join('，')}`,
            });
          }
          if (parts.length === 0 || s.activeFactories > 0) {
            const details: string[] = [];
            if (s.activeFactories > 0) details.push(`${s.activeFactories}家活跃工厂`);
            if (s.todayScanQty > 0) details.push(`今日扫码${s.todayScanQty}次`);
            if (details.length > 0) {
              items.push({
                type: 'info',
                icon: <BulbOutlined />,
                title: '运营感知',
                description: `健康度 ${s.healthGrade}，${details.join('，')}`,
              });
            }
          }
        }
      }

      if (actionRes.status === 'fulfilled' && actionRes.value?.data) {
        const action = actionRes.value.data;
        const highPriorityTasks = action.tasks?.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL') || [];
        if (highPriorityTasks.length > 0) {
          items.push({
            type: 'risk',
            icon: <AlertOutlined />,
            title: `高优先级任务 (${highPriorityTasks.length})`,
            description: highPriorityTasks.slice(0, 2).map(t => t.title).join('、'),
            action: '查看详情',
            onClick: () => {
              window.dispatchEvent(new CustomEvent('openAiChat', {
                detail: { query: '帮我查看当前待处理的风险任务' },
              }));
            },
          });
        }
      }

      const hasOnlySuggestion = items.length === 0;
      if (!hasOnlySuggestion && patrolSummary?.pendingCount === 0 && items.filter(i => i.type !== 'info').length === 0) {
        items.push({
          type: 'suggestion',
          icon: <RobotOutlined />,
          title: '一切正常',
          description: '系统运行平稳，暂无风险预警',
          action: '和小云聊聊',
          onClick: () => window.dispatchEvent(new CustomEvent('openAiChat')),
        });
      }

      if (items.length === 0) {
        items.push({
          type: 'suggestion',
          icon: <RobotOutlined />,
          title: '小云AI助手',
          description: '随时问我任何业务问题，如订单进度、物料状态、风险预警等',
          action: '开始对话',
          onClick: () => window.dispatchEvent(new CustomEvent('openAiChat')),
        });
      }

      setInsights(items);
    } catch {
      setInsights([{
        type: 'suggestion',
        icon: <RobotOutlined />,
        title: '小云AI助手',
        description: '随时问我任何业务问题',
        action: '开始对话',
        onClick: () => window.dispatchEvent(new CustomEvent('openAiChat')),
      }]);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    buildInsights();
  }, [buildInsights]);

  if (loading) {
    return (
      <div className="dai-bar dai-bar--loading">
        <div className="dai-shimmer" />
        <span className="dai-loading-text">AI 正在分析运营数据...</span>
      </div>
    );
  }

  if (insights.length === 0) return null;

  return (
    <div className="dai-bar">
      <div className="dai-icon-badge">
        <RobotOutlined />
      </div>
      <div className="dai-insights-scroll">
        {insights.map((item, idx) => (
          <div key={idx} className={`dai-item dai-item--${item.type}`}>
            <span className="dai-item-icon">{item.icon}</span>
            <div className="dai-item-body">
              <span className="dai-item-title">{item.title}</span>
              <span className="dai-item-desc">{item.description}</span>
              {item.descriptionExtra && (
                <span className="dai-item-desc-extra">{item.descriptionExtra}</span>
              )}
            </div>
            {item.action && (
              <button type="button" className="dai-item-action" onClick={item.onClick}>
                {item.action} <RightOutlined />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardAiInsight;
