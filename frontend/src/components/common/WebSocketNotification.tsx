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
 * - app:order:pending — 应用商店新购买订单（仅超管可见）
 */
const WebSocketNotification: React.FC = () => {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const { subscribe } = useWebSocket({
    userId: user?.id,
    tenantId: user?.tenantId,
    enabled: isAuthenticated && !!user?.id,
  });

  // 工厂入驻申请通知（超管专属）
  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    return subscribe('tenant:application:pending', (msg) => {
      const payload = msg.payload as { tenantName?: string; message?: string };
      notification.info({
        message: ' 新工厂入驻申请',
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
        message: ' 新员工注册申请',
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

  // 应用商店新购买订单通知（超管专属）
  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    return subscribe('app:order:pending', (msg) => {
      const payload = msg.payload as { tenantName?: string; appName?: string; orderNo?: string; message?: string };
      notification.warning({
        message: ' 新应用购买订单',
        description: payload?.message || `${payload?.tenantName || '客户'} 购买了 ${payload?.appName || '应用'}，订单号：${payload?.orderNo || '-'}`,
        placement: 'topRight',
        duration: 0,
        onClick: () => {
          navigate(paths.customerManagement + '?tab=app-orders');
          notification.destroy();
        },
        style: { cursor: 'pointer' },
      });
    });
  }, [subscribe, user?.isSuperAdmin, notification, navigate]);

  //  AI质检异常预警（所有已登录用户）
  useEffect(() => {
    return subscribe('quality:anomaly', (msg) => {
      const p = msg.payload as {
        orderNo?: string;
        stageName?: string;
        defectRate?: number;
        suggestion?: string;
      };
      const rateStr = p.defectRate != null ? `${(p.defectRate * 100).toFixed(1)}%` : '-';
      notification.warning({
        message: ' 质检异常预警',
        description: `订单 ${p.orderNo ?? '-'} · ${p.stageName ?? ''} · 次品率 ${rateStr}${p.suggestion ? ` · ${p.suggestion}` : ''}`,
        placement: 'topRight',
        duration: 0,
        style: { borderLeft: '4px solid #f97316' },
      });
    });
  }, [subscribe, notification]);

  //  AI小云决策卡片 (TraceableAdvice) 推送处理
  useEffect(() => {
    return subscribe('ai:traceable_advice', (msg) => {
      // 通过自定义事件广播给 GlobalAiAssistant 组件去渲染 UI
      const event = new CustomEvent('ai:traceable_advice', { detail: msg.payload });
      window.dispatchEvent(event);
    });
  }, [subscribe]);

  //  订单进度变更通知：扫码/入库/状态变更后触发前端刷新
  useEffect(() => {
    return subscribe('order:progress:changed', (msg) => {
      const p = msg.payload as { orderNo?: string; progress?: number; currentStage?: string };
      const event = new CustomEvent('order:progress:changed', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe]);

  //  入库操作通知：入库完成后触发前端刷新
  useEffect(() => {
    return subscribe('warehouse:in', (msg) => {
      const p = msg.payload as { orderNo?: string; quantity?: number; warehouseLocation?: string };
      const event = new CustomEvent('warehouse:in', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe]);

  // 工序领取通知
  useEffect(() => {
    return subscribe('process:stage:received', (msg) => {
      const p = msg.payload as { orderNo?: string; processName?: string; operatorName?: string; bundleNo?: string; color?: string; size?: string };
      const bundleInfo = p.bundleNo ? `菲号${p.bundleNo}` : '';
      const colorSize = [p.color, p.size].filter(Boolean).join('/');
      const detail = [bundleInfo, colorSize].filter(Boolean).join(' · ');
      notification.info({
        message: `${p.operatorName || '有人'}领取了${p.processName || '工序'}`,
        description: `订单 ${p.orderNo || '-'}${detail ? ' · ' + detail : ''}`,
        placement: 'topRight',
        duration: 5,
      });
      const event = new CustomEvent('order:progress:changed', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe, notification]);

  // 工序完成通知
  useEffect(() => {
    return subscribe('process:stage:completed', (msg) => {
      const p = msg.payload as { orderNo?: string; processName?: string; operatorName?: string; bundleNo?: string; color?: string; size?: string; quantity?: number };
      const bundleInfo = p.bundleNo ? `菲号${p.bundleNo}` : '';
      const colorSize = [p.color, p.size].filter(Boolean).join('/');
      const qtyInfo = p.quantity ? `${p.quantity}件` : '';
      const detail = [bundleInfo, colorSize, qtyInfo].filter(Boolean).join(' · ');
      const isWarehouse = p.processName === '入库' || p.processName === '质检入库';
      notification.success({
        message: `${p.operatorName || '有人'}完成了${p.processName || '工序'}`,
        description: `订单 ${p.orderNo || '-'}${detail ? ' · ' + detail : ''}`,
        placement: 'topRight',
        duration: isWarehouse ? 8 : 5,
        style: isWarehouse ? { borderLeft: '4px solid #10b981' } : undefined,
      });
      const event = new CustomEvent('order:progress:changed', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe, notification]);

  // 通用数据变更通知
  useEffect(() => {
    return subscribe('data:changed', (msg) => {
      const p = msg.payload as { entityType?: string; entityId?: string; action?: string };
      const event = new CustomEvent('data:changed', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe]);

  // 扫码成功通知：手机端扫码后PC端感知
  useEffect(() => {
    return subscribe('scan:success', (msg) => {
      const p = msg.payload as { orderNo?: string; processName?: string; operatorName?: string; bundleNo?: string; quantity?: number };
      if (!p.operatorName && !p.processName) return;
      const qtyInfo = p.quantity ? `${p.quantity}件` : '';
      const bundleInfo = p.bundleNo ? `菲号${p.bundleNo}` : '';
      const detail = [bundleInfo, qtyInfo].filter(Boolean).join(' · ');
      notification.info({
        message: `${p.operatorName || '有人'}扫码了${p.processName || '工序'}`,
        description: `订单 ${p.orderNo || '-'}${detail ? ' · ' + detail : ''}`,
        placement: 'topRight',
        duration: 4,
      });
      const event = new CustomEvent('order:progress:changed', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe, notification]);

  // 撤销扫码通知
  useEffect(() => {
    return subscribe('scan:undo', (msg) => {
      const p = msg.payload as { orderNo?: string; processName?: string; operatorName?: string };
      const event = new CustomEvent('order:progress:changed', { detail: p });
      window.dispatchEvent(event);
    });
  }, [subscribe]);

  // 不渲染任何 DOM
  return null;
};

export default WebSocketNotification;
