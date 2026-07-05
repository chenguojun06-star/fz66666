import React, { useEffect, useState, useCallback } from 'react';
import { Progress, Tag, Button, Empty, Spin, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { intelligenceApi, type AgentBackgroundTaskDTO } from '@/services/intelligence/intelligenceApi';
import { useAuthState } from '@/utils/AuthContext';
import './BackgroundTaskPanel.css';

interface BackgroundTaskPanelProps {
  maxItems?: number;
  pollInterval?: number;
  onViewAll?: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
  PENDING: { color: 'default', icon: <ClockCircleOutlined />, text: '等待中' },
  RUNNING: { color: 'processing', icon: <SyncOutlined spin />, text: '执行中' },
  COMPLETED: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
  FAILED: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
  CANCELLED: { color: 'default', icon: <StopOutlined />, text: '已取消' },
};

const PRIORITY_CONFIG: Record<string, string> = {
  HIGH: 'red',
  MEDIUM: 'orange',
  LOW: 'blue',
};

const BackgroundTaskPanel: React.FC<BackgroundTaskPanelProps> = ({
  maxItems = 10,
  pollInterval = 10000,
  onViewAll,
}) => {
  const [tasks, setTasks] = useState<AgentBackgroundTaskDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuthState();

  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const data = await intelligenceApi.getBackgroundActiveTasks(maxItems);
      setTasks(data);
    } catch (e) {
      console.warn('[BackgroundTask] 获取任务列表失败:', e);
    } finally {
      setLoading(false);
    }
  }, [maxItems, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchTasks();
    const timer = setInterval(fetchTasks, pollInterval);
    return () => clearInterval(timer);
  }, [fetchTasks, pollInterval, isAuthenticated]);

  const handleCancel = async (taskId: string) => {
    try {
      await intelligenceApi.cancelBackgroundTask(taskId);
      fetchTasks();
    } catch (e) {
      console.warn('[BackgroundTask] 取消任务失败:', e);
    }
  };

  const runningCount = tasks.filter(t => t.status === 'RUNNING' || t.status === 'PENDING').length;

  if (loading && tasks.length === 0) {
    return (
      <div className="bg-task-panel-loading">
        <Spin size="small" />
        <span>加载中...</span>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无后台任务"
        className="bg-task-panel-empty"
      />
    );
  }

  return (
    <div className="bg-task-panel">
      <div className="bg-task-panel-header">
        <span className="bg-task-panel-title">
          后台任务
          {runningCount > 0 && (
            <Tag color="processing" className="bg-task-panel-count">
              {runningCount} 个进行中
            </Tag>
          )}
        </span>
        {onViewAll && (
          <Button type="link" size="small" onClick={onViewAll}>
            查看全部
          </Button>
        )}
      </div>

      <div className="bg-task-panel-list">
        {tasks.map((task) => {
          const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.PENDING;
          return (
            <div key={task.taskId} className="bg-task-item">
              <div className="bg-task-item-top">
                <div className="bg-task-item-name" title={task.taskName}>
                  {task.taskName}
                </div>
                <Tag
                  color={statusCfg.color}
                  icon={statusCfg.icon}
                  className="bg-task-item-status"
                >
                  {statusCfg.text}
                </Tag>
              </div>

              <div className="bg-task-item-meta">
                <Tag color={PRIORITY_CONFIG[task.priority] || 'default'} className="bg-task-priority">
                  {task.priority === 'HIGH' ? '高' : task.priority === 'MEDIUM' ? '中' : '低'}优先级
                </Tag>
                <span className="bg-task-item-type">{task.taskType}</span>
              </div>

              {(task.status === 'RUNNING' || task.status === 'PENDING') && (
                <div className="bg-task-item-progress">
                  <Progress
                    percent={task.progress || 0}
                    size="small"
                    status={task.status === 'RUNNING' ? 'active' : 'normal'}
                  />
                  {task.currentStep && (
                    <Tooltip title={task.currentStep}>
                      <span className="bg-task-step">{task.currentStep}</span>
                    </Tooltip>
                  )}
                </div>
              )}

              {task.status === 'FAILED' && task.errorMessage && (
                <div className="bg-task-item-error" title={task.errorMessage}>
                  {task.errorMessage}
                </div>
              )}

              <div className="bg-task-item-footer">
                <span className="bg-task-item-time">
                  {task.createTime?.slice(0, 19).replace('T', ' ')}
                </span>
                {(task.status === 'PENDING' || task.status === 'RUNNING') && (
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => handleCancel(task.taskId)}
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BackgroundTaskPanel;
