import React, { useEffect, useState, useCallback } from 'react';
import { RobotOutlined, BulbOutlined, AlertOutlined, RightOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import './DashboardAiInsight.css';

interface InsightItem {
  type: 'risk' | 'suggestion' | 'info';
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}

const DashboardAiInsight: React.FC = () => {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);

  const buildInsights = useCallback(async () => {
    setLoading(true);
    try {
      const [brainRes, actionRes] = await Promise.allSettled([
        intelligenceApi.getBrainSnapshot(),
        intelligenceApi.getActionCenter(),
      ]);

      const items: InsightItem[] = [];

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
          } else {
            items.push({
              type: 'info',
              icon: <BulbOutlined />,
              title: '运营感知',
              description: `健康度 ${s.healthGrade}，${s.activeFactories}家活跃工厂，今日扫码 ${s.todayScanQty} 次`,
            });
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

      if (items.length === 0) {
        items.push({
          type: 'suggestion',
          icon: <RobotOutlined />,
          title: '小云AI助手',
          description: '随时问我任何业务问题，如订单进度、物料状态、风险预警等',
          action: '开始对话',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('openAiChat'));
          },
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
        onClick: () => {
          window.dispatchEvent(new CustomEvent('openAiChat'));
        },
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

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
