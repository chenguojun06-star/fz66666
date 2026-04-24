import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WsMessage } from '@/hooks/useWebSocket';
import { useNavigate } from 'react-router-dom';
import { STAGE_ACCENT } from '@/utils/stageStyles';

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
const PULSE_WINDOW_MS = 60 * 1000;
const PULSE_BUCKETS = 12;

const getStageColor = (_stageName?: string) => STAGE_ACCENT;

const normalizeFocusNode = (stageName?: string) => {
  const safeStage = String(stageName || '').trim();
  if (!safeStage) return '';
  if (safeStage.includes('质检') || safeStage.includes('品检') || safeStage.includes('验货')) return '质检';
  if (safeStage.includes('入库') || safeStage.includes('入仓')) return '入库';
  if (safeStage.includes('包装') || safeStage.includes('打包') || safeStage.includes('后整')) return '包装';
  if (safeStage.includes('车缝') || safeStage.includes('车间')) return '车缝';
  if (safeStage.includes('裁剪') || safeStage.includes('裁床')) return '裁剪';
  return safeStage;
};

/**
 * 实时扫码事件流（WebSocket 驱动）
 *
 * 订阅后端 scan:realtime 广播，最新 N 条扫码动态逐条滑入。
 * 仅在有事件时渲染，空闲时隐藏，不占用空间。
 *
 * 使用方式：直接放置在"实时生产脉搏"卡片内，无需传入任何 prop。
 */
type LiveScanFeedProps = {
  minMinutesSinceLastScan?: number | null;
  currentScanRatePerHour?: number;
};

const LiveScanFeed: React.FC<LiveScanFeedProps> = ({ minMinutesSinceLastScan, currentScanRatePerHour }) => {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
  const counterRef = useRef(0);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const { subscribe } = useWebSocket({
    userId: user?.id,
    tenantId: user?.tenantId,
    enabled: isAuthenticated && !!user?.id,
    token: localStorage.getItem('authToken') ?? '',
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

  const now = Date.now();
  const recent30s = events.filter((event) => now - event.at <= 30_000);
  const recent60s = events.filter((event) => now - event.at <= PULSE_WINDOW_MS);
  const stageOptions = Array.from(new Set(recent60s.map((event) => normalizeFocusNode(event.stageName)).filter(Boolean))).slice(0, 5);
  const filterEventByStage = (event: ScanEvent) => stageFilter === 'all' || normalizeFocusNode(event.stageName) === stageFilter;
  const filteredRecent30s = recent30s.filter(filterEventByStage);
  const filteredRecent60s = recent60s.filter(filterEventByStage);
  const recent30Qty = filteredRecent30s.reduce((sum, event) => sum + (Number(event.quantity) || 0), 0);
  const recent60Qty = filteredRecent60s.reduce((sum, event) => sum + (Number(event.quantity) || 0), 0);
  const dominantStageMap = filteredRecent60s.reduce<Record<string, number>>((acc, event) => {
    const stageName = String(event.stageName || '未识别工序').trim();
    acc[stageName] = (acc[stageName] || 0) + (Number(event.quantity) || 0);
    return acc;
  }, {});
  const dominantStage = Object.entries(dominantStageMap).sort((left, right) => right[1] - left[1])[0]?.[0] || '';

  const bucketSize = PULSE_WINDOW_MS / PULSE_BUCKETS;
  const pulseBuckets = Array.from({ length: PULSE_BUCKETS }, (_, index) => {
    const bucketEnd = now - (PULSE_BUCKETS - 1 - index) * bucketSize;
    const bucketStart = bucketEnd - bucketSize;
    const quantity = filteredRecent60s
      .filter((event) => event.at > bucketStart && event.at <= bucketEnd)
      .reduce((sum, event) => sum + (Number(event.quantity) || 0), 0);
    return quantity;
  });
  const selectedBucketEvents = selectedBucketIndex === null
    ? []
    : filteredRecent60s
        .filter((event) => {
          const bucketEnd = now - (PULSE_BUCKETS - 1 - selectedBucketIndex) * bucketSize;
          const bucketStart = bucketEnd - bucketSize;
          return event.at > bucketStart && event.at <= bucketEnd;
        })
        .filter((event, index, list) => {
          const orderNo = String(event.orderNo || '').trim();
          if (!orderNo) return false;
          return list.findIndex((item) => String(item.orderNo || '').trim() === orderNo) === index;
        });
  const pulseMax = Math.max(...pulseBuckets, 1);
  const recentEventIdleMs = events.length === 0 ? Number.POSITIVE_INFINITY : now - events[0].at;
  const effectiveSilentMinutes = minMinutesSinceLastScan ?? (recentEventIdleMs / 60_000);
  const idleLevel = effectiveSilentMinutes >= 1.5 || (Number(currentScanRatePerHour) || 0) <= 0
    ? (effectiveSilentMinutes >= 3 ? 'danger' : 'warn')
    : 'normal';

  const handleEventClick = useCallback((event: ScanEvent) => {
    const orderNo = String(event.orderNo || '').trim();
    if (!orderNo) return;
    const focusNode = normalizeFocusNode(event.stageName);
    const query = new URLSearchParams({ orderNo });
    if (focusNode) query.set('focusNode', focusNode);
    navigate(`/production/progress-detail?${query.toString()}`);
  }, [navigate]);

  useEffect(() => {
    setSelectedBucketIndex(null);
  }, [stageFilter]);

  return (
    <div className={`lsf-root${idleLevel === 'normal' ? '' : ' idle'}${idleLevel === 'warn' ? ' warn' : ''}${idleLevel === 'danger' ? ' danger' : ''}`}>
      {/* 标题行 */}
      <div className="lsf-header">
        <span className="lsf-live-dot" />
        <span className="lsf-live-label">LIVE</span>
        <span className="lsf-title">扫码脉冲墙</span>
        <span className="lsf-summary">30秒 {recent30Qty} 件</span>
        <span className="lsf-summary alt">60秒 {recent60Qty} 件</span>
        {dominantStage && (
          <span className="lsf-summary stage" style={{ borderColor: `${getStageColor(dominantStage)}66`, color: getStageColor(dominantStage) }}>
            主脉冲 {dominantStage}
          </span>
        )}
      </div>

      {stageOptions.length > 0 && (
        <div className="lsf-filter-row">
          <button
            type="button"
            className={`lsf-filter-chip${stageFilter === 'all' ? ' active' : ''}`}
            onClick={() => setStageFilter('all')}
          >
            全部
          </button>
          {stageOptions.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`lsf-filter-chip${stageFilter === stage ? ' active' : ''}`}
              style={stageFilter === stage ? { borderColor: `${getStageColor(stage)}66`, color: getStageColor(stage) } : undefined}
              onClick={() => setStageFilter(stage)}
            >
              {stage}
            </button>
          ))}
        </div>
      )}

      <div className="lsf-pulse-wall">
        {pulseBuckets.map((quantity, index) => {
          const active = quantity > 0;
          const selected = selectedBucketIndex === index;
          const bucketEnd = now - (PULSE_BUCKETS - 1 - index) * bucketSize;
          const bucketLabel = new Date(bucketEnd).toLocaleTimeString('zh-CN', { hour12: false, minute: '2-digit', second: '2-digit' });
          return (
            <button
              key={`${index}-${quantity}`}
              type="button"
              className={`lsf-pulse-bar${active ? ' active' : ''}${selected ? ' selected' : ''}`}
              onClick={() => setSelectedBucketIndex(selected ? null : index)}
              title={`${bucketLabel} 时段 ${quantity} 件`}
            >
              <span
                className="lsf-pulse-fill"
                style={{ height: `${Math.max(10, Math.round((quantity / pulseMax) * 100))}%` }}
              />
            </button>
          );
        })}
      </div>

      {selectedBucketIndex !== null && (
        <div className="lsf-bucket-orders">
          <div className="lsf-bucket-orders-title">
            该脉冲时段命中订单
            <span>{selectedBucketEvents.length} 单</span>
          </div>
          {selectedBucketEvents.length > 0 ? (
            <div className="lsf-bucket-chip-list">
              {selectedBucketEvents.map((event) => (
                <button
                  key={`${event.id}-${event.orderNo}`}
                  type="button"
                  className="lsf-bucket-chip"
                  onClick={() => handleEventClick(event)}
                  title={`打开 ${event.orderNo}`}
                >
                  <span>{event.orderNo}</span>
                  <em>{normalizeFocusNode(event.stageName) || event.stageName || '工序'}</em>
                </button>
              ))}
            </div>
          ) : (
            <div className="lsf-bucket-empty">该时间段暂无可定位订单号</div>
          )}
        </div>
      )}

      {idleLevel !== 'normal' && (
        <div className={`lsf-idle-note ${idleLevel}`}>
          {idleLevel === 'danger'
            ? effectiveSilentMinutes === Infinity ? '静默预警：当前暂无任何活跃扫码' : `静默预警：最近 ${Math.max(1, Math.round(effectiveSilentMinutes))} 分钟未见有效扫码`
            : effectiveSilentMinutes === Infinity ? '脉冲走弱：当前扫码较少' : `脉冲走弱：最近 ${Math.max(1, Math.round(effectiveSilentMinutes))} 分钟扫码明显变少`}
        </div>
      )}

      {/* 事件列表 */}
      <div className="lsf-list">
        {events.filter(filterEventByStage).map((e, idx) => (
          <div
            key={e.id}
            className={`lsf-item${String(e.orderNo || '').trim() ? ' clickable' : ''}`}
            style={{ opacity: 1 - idx * 0.12 }}
            onClick={() => handleEventClick(e)}
            role={String(e.orderNo || '').trim() ? 'button' : undefined}
            tabIndex={String(e.orderNo || '').trim() ? 0 : -1}
            onKeyDown={(event) => {
              if (!String(e.orderNo || '').trim()) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleEventClick(e);
              }
            }}
          >
            {/* 数量气泡 */}
            <span className="lsf-qty" style={{ color: getStageColor(e.stageName) }}>+{e.quantity ?? 0}</span>

            {/* 工序 & 员工 */}
            <span className="lsf-stage" style={{ color: getStageColor(e.stageName) }}>{e.stageName ?? ''}</span>
            <span className="lsf-worker">{e.operatorName ?? '工人'}</span>

            {/* 款号 / 订单号 */}
            <span className="lsf-order">
              {e.styleNo ? `${e.styleNo} ` : ''}
              <em>{e.orderNo ?? ''}</em>
            </span>

            <span className="lsf-age">{Math.max(0, Math.floor((now - e.at) / 1000))}s前</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveScanFeed;
