import React, { useEffect } from 'react';
import { App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { paths } from '@/routeConfig';

/**
 * WebSocket 通知组件
 *
 * 放置于 AppRoutes 内部（需要 AntdApp 和 Router 上下文），
 * 监听后端推送的 WebSocket 消息并弹出 Ant Design notification。
 *
 * 当前支持的消息类型：
 * - tenant:application:pending — 新工厂入驻申请（仅超管可见）
 * - worker:registration:pending — 新员工注册申请
 */
const WebSocketNotification: React.FC = () => {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const { subscribe } = useWebSocket({
    userId: user?.id,
    enabled: isAuthenticated && !!user?.id,
  });

  // 工厂入驻申请通知（超管专属）
  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    return subscribe('tenant:application:pending', (msg) => {
      const payload = msg.payload as { tenantName?: string; message?: string };
      notification.info({
        message: '🏭 新工厂入驻申请',
        description: payload?.message || `${payload?.tenantName || '未知工厂'} 提交了入驻申请`,
        placement: 'topRight',
        duration: 10,
        onClick: () => {
          navigate(paths.tenantManagement + '?tab=registrations');
          notification.destroy();
        },
        style: { cursor: 'pointer' },
      });
    });
  }, [subscribe, user?.isSuperAdmin, notification, navigate]);

  // 员工注册申请通知（租户主账号）
  useEffect(() => {
    if (!user?.isTenantOwner) return;
    return subscribe('worker:registration:pending', (msg) => {
      const payload = msg.payload as { workerName?: string; message?: string };
      notification.info({
        message: '👤 新员工注册申请',
        description: payload?.message || `${payload?.workerName || '未知员工'} 提交了注册申请`,
        placement: 'topRight',
        duration: 8,
        onClick: () => {
          navigate(paths.user);
          notification.destroy();
        },
        style: { cursor: 'pointer' },
      });
    });
  }, [subscribe, user?.isTenantOwner, notification, navigate]);

  // 不渲染任何 DOM
  return null;
};

export default WebSocketNotification;
