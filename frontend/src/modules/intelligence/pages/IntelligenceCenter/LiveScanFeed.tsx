import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WsMessage } from '@/hooks/useWebSocket';

interface ScanEvent {
  id: string;
  orderNo?: string;
  styleNo?: string;
  stageName?: string;
  quantity?: number;
  operatorName?: string;
  at: number;
}

const MAX_EVENTS = 7;

/**
 * 实时扫码事件流（WebSocket 驱动）
 *
 * 订阅后端 scan:realtime 广播，最新 N 条扫码动态逐条滑入。
 * 仅在有事件时渲染，空闲时隐藏，不占用空间。
 *
 * 使用方式：直接放置在"实时生产脉搏"卡片内，无需传入任何 prop。
 */
const LiveScanFeed: React.FC = () => {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const counterRef = useRef(0);
  const { user, isAuthenticated } = useAuth();

  const { subscribe } = useWebSocket({
    userId: user?.id,
    enabled: isAuthenticated && !!user?.id,
  });

  const handleScanRealtime = useCallback(
    (msg: WsMessage) => {
      const p = msg.payload as Partial<ScanEvent & { timestamp?: number }>;
      const evt: ScanEvent = {
        id: `${Date.now()}-${++counterRef.current}`,
        orderNo: p.orderNo,
        styleNo: p.styleNo,
        stageName: p.stageName,
        quantity: p.quantity,
        operatorName: p.operatorName,
        at: p.timestamp ?? Date.now(),
      };
      setEvents((prev) => [evt, ...prev].slice(0, MAX_EVENTS));
    },
    [],
  );

  useEffect(() => {
    return subscribe('scan:realtime', handleScanRealtime);
  }, [subscribe, handleScanRealtime]);

  if (events.length === 0) return null;

  return (
    <div className="lsf-root">
      {/* 标题行 */}
      <div className="lsf-header">
        <span className="lsf-live-dot" />
        <span className="lsf-live-label">LIVE</span>
        <span className="lsf-title">扫码动态</span>
      </div>

      {/* 事件列表 */}
      <div className="lsf-list">
        {events.map((e, idx) => (
          <div
            key={e.id}
            className="lsf-item"
            style={{ opacity: 1 - idx * 0.12 }}
          >
            {/* 数量气泡 */}
            <span className="lsf-qty">+{e.quantity ?? 0}</span>

            {/* 工序 & 员工 */}
            <span className="lsf-stage">{e.stageName ?? ''}</span>
            <span className="lsf-worker">{e.operatorName ?? '工人'}</span>

            {/* 款号 / 订单号 */}
            <span className="lsf-order">
              {e.styleNo ? `${e.styleNo} ` : ''}
              <em>{e.orderNo ?? ''}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveScanFeed;
