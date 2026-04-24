import React, { useCallback, useEffect, useState } from 'react';
import { Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api, { type ApiResult } from '@/utils/api';
import './styles.css';

interface TaskItem {
  orderNo: string;
  styleNo: string;
  company: string;
  factoryName: string;
  progress: number;
  status: string;
  urgencyLevel: string;
  materialArrivalRate: number;
  daysLeft: number;
  plannedEndDate: string;
  priority: string;
  priorityLabel: string;
}

interface WorkPlanData {
  userName: string;
  date: string;
  totalActiveOrders: number;
  tasks: TaskItem[];
  aiPlan: string | null;
  source: string;
  greeting: string | null;
}

/** 根据时间段返回问候语 */
function getTimeGreeting(): { emoji: string; text: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { emoji: '🌙', text: '夜深了' };
  if (hour < 9) return { emoji: '🌅', text: '早上好' };
  if (hour < 12) return { emoji: '☀️', text: '上午好' };
  if (hour < 14) return { emoji: '🌤', text: '中午好' };
  if (hour < 18) return { emoji: '🌇', text: '下午好' };
  return { emoji: '🌆', text: '傍晚好' };
}

/** 格式化剩余天数 */
function formatDaysLeft(days: number): { text: string; className: string } {
  if (days < 0) return { text: `逾期${Math.abs(days)}天`, className: 'pwp-task-days-left--overdue' };
  if (days === 0) return { text: '今天到期', className: 'pwp-task-days-left--overdue' };
  if (days <= 3) return { text: `剩${days}天`, className: 'pwp-task-days-left--urgent' };
  return { text: `剩${days}天`, className: 'pwp-task-days-left--normal' };
}

/** 进度条颜色 */
function getProgressColor(percent: number): string {
  if (percent >= 80) return '#52c41a';
  if (percent >= 50) return '#faad14';
  return '#ff7875';
}

const PersonalWorkPlan: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkPlanData | null>(null);

  const fetchPlan = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<ApiResult<WorkPlanData>>('/intelligence/personal-work-plan');
      const payload = res?.data ?? res;
      setData(payload as WorkPlanData);
    } catch {
      // 静默失败，组件不影响仪表盘
      console.warn('[PersonalWorkPlan] 加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const greeting = getTimeGreeting();

  // 加载态
  if (loading) {
    return (
      <div className="personal-work-plan">
        <div className="pwp-loading">
          <Spin size="small" tip="正在为你生成今日工作计划…" />
        </div>
      </div>
    );
  }

  // 无数据 / 无任务
  if (!data || data.tasks.length === 0) {
    return (
      <div className="personal-work-plan">
        <div className="pwp-header">
          <div className="pwp-greeting">
            <span className="pwp-greeting-emoji">{greeting.emoji}</span>
            <div>
              <div className="pwp-greeting-text">{greeting.text}{data?.userName ? `，${data.userName}` : ''}！</div>
              <div className="pwp-greeting-sub">今日工作计划</div>
            </div>
          </div>
        </div>
        <div className="pwp-empty">
          <div className="pwp-empty-emoji">🎉</div>
          <div className="pwp-empty-text">
            {data?.greeting || '目前没有需要跟进的订单，享受轻松的一天吧！'}
          </div>
        </div>
      </div>
    );
  }

  // 只显示前 8 条任务
  const visibleTasks = data.tasks.slice(0, 8);

  return (
    <div className="personal-work-plan">
      {/* 头部 */}
      <div className="pwp-header">
        <div className="pwp-greeting">
          <span className="pwp-greeting-emoji">{greeting.emoji}</span>
          <div>
            <div className="pwp-greeting-text">
              {greeting.text}，{data.userName}！
            </div>
            <div className="pwp-greeting-sub">
              你有 {data.totalActiveOrders} 个进行中的订单，以下是今日建议
            </div>
          </div>
        </div>
        <button
          className="pwp-refresh-btn"
          onClick={() => fetchPlan(true)}
          title="刷新计划"
        >
          <ReloadOutlined />
        </button>
      </div>

      {/* AI 生成的计划文案 */}
      {data.aiPlan && (
        <div className="pwp-ai-section">
          <div className="pwp-ai-card">{data.aiPlan}</div>
        </div>
      )}

      {/* 任务列表 */}
      <div className="pwp-tasks">
        {visibleTasks.map((task) => {
          const days = formatDaysLeft(task.daysLeft);
          return (
            <div className="pwp-task-item" key={task.orderNo}>
              <span className={`pwp-task-badge pwp-task-badge--${task.priority}`}>
                {task.priority}
              </span>
              <div className="pwp-task-content">
                <div className="pwp-task-title">
                  <span
                    className="pwp-task-order-no"
                    onClick={() => navigate(`/production?orderNo=${encodeURIComponent(task.orderNo)}`)}
                  >
                    {task.orderNo}
                  </span>
                  <span>{task.styleNo}</span>
                  {task.company && <span style={{ opacity: 0.6 }}>· {task.company}</span>}
                </div>
                <div className="pwp-task-meta">
                  <span className={`pwp-task-days-left ${days.className}`}>{days.text}</span>
                  <span>
                    进度
                    <span className="pwp-task-progress-bar" style={{ marginLeft: 4 }}>
                      <span
                        className="pwp-task-progress-fill"
                        style={{
                          width: `${Math.min(100, task.progress)}%`,
                          background: getProgressColor(task.progress),
                        }}
                      />
                    </span>
                    {' '}{task.progress}%
                  </span>
                  {task.materialArrivalRate > 0 && task.materialArrivalRate < 100 && (
                    <span>面料到位 {task.materialArrivalRate}%</span>
                  )}
                  {task.factoryName && <span>{task.factoryName}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部 */}
      <div className="pwp-footer">
        <span className="pwp-footer-stats">
          共 {data.totalActiveOrders} 个跟进订单
          {data.tasks.filter(t => t.priority === 'P0').length > 0 &&
            `，其中 ${data.tasks.filter(t => t.priority === 'P0').length} 个需紧急处理`
          }
        </span>
        <span className="pwp-footer-source">
          {data.source === 'ai' ? '✨ AI 智能排序' : '📋 规则排序'}
        </span>
      </div>
    </div>
  );
};

export default PersonalWorkPlan;
