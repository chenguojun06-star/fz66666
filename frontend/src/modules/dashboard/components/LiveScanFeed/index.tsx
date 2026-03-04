import React, { useEffect, useRef, useState, useCallback } from 'react';
import api from '@/utils/api';
import './styles.css';

interface ScanItem {
  id: number;
  orderNo: string;
  operatorName: string;
  progressStage: string;
  processName: string;
  quantity: number;
  scanResult: string;
  scanTime: string; // HH:mm:ss
}

interface TodayStats {
  todayCount: number;
  todayQuantity: number;
}

const POLL_INTERVAL = 20; // 秒
const MAX_ROWS = 12;

const LiveScanFeed: React.FC = () => {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [todayStats, setTodayStats] = useState<TodayStats>({ todayCount: 0, todayQuantity: 0 });
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const [statsFlash, setStatsFlash] = useState(false);

  const knownIdsRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const [feedRes, statsRes] = await Promise.all([
        api.get('/dashboard/live-scan-feed', { params: { limit: MAX_ROWS } }),
        api.get('/dashboard/today-scan-stats'),
      ]);
      const newItems: ScanItem[] = feedRes || [];
      const stats: TodayStats = statsRes || { todayCount: 0, todayQuantity: 0 };

      // 找出本轮新增的 id
      const freshIds = new Set<number>();
      newItems.forEach((item) => {
        if (!knownIdsRef.current.has(item.id)) {
          freshIds.add(item.id);
        }
      });
      // 更新已知 id 集合
      knownIdsRef.current = new Set(newItems.map((i) => i.id));

      if (freshIds.size > 0) {
        setNewIds(freshIds);
        setStatsFlash(true);
        setTimeout(() => setNewIds(new Set()), 1400);
        setTimeout(() => setStatsFlash(false), 600);
      }

      setItems(newItems);
      setTodayStats(stats);
    } catch {
      // 静默失败，保留上次数据
    }
  }, []);

  const resetCountdown = useCallback(() => {
    setCountdown(POLL_INTERVAL);
  }, []);

  useEffect(() => {
    fetchFeed();

    // 主轮询定时器
    timerRef.current = setInterval(() => {
      fetchFeed();
      resetCountdown();
    }, POLL_INTERVAL * 1000);

    // 倒计时视觉定时器（每秒 -1）
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : POLL_INTERVAL));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchFeed, resetCountdown]);

  const barWidth = `${(countdown / POLL_INTERVAL) * 100}%`;

  return (
    <div className="live-feed-container">
      {/* 标题栏 */}
      <div className="live-feed-header">
        <div className="live-feed-title">
          <span className="live-dot" />
          实时扫码动态
        </div>
        <div className="live-feed-countdown">
          <span>{countdown}s</span>
          <div className="countdown-bar-wrap">
            <div
              className="countdown-bar"
              style={{ width: barWidth, transition: countdown === POLL_INTERVAL ? 'none' : 'width 1s linear' }}
            />
          </div>
        </div>
      </div>

      {/* 今日汇总 */}
      <div className="live-today-stats">
        <div className="today-stat-item">
          <span className="today-stat-label">今日扫码次数</span>
          <span className={`today-stat-value${statsFlash ? ' flashing' : ''}`}>
            {todayStats.todayCount.toLocaleString()}
          </span>
        </div>
        <div className="today-stat-item">
          <span className="today-stat-label">今日扫码件数</span>
          <span className={`today-stat-value${statsFlash ? ' flashing' : ''}`}>
            {todayStats.todayQuantity.toLocaleString()}
          </span>
        </div>
      </div>

      {/* 扫码记录列 */}
      <div className="scan-list">
        {items.length === 0 ? (
          <div className="live-empty">暂无扫码数据</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`scan-row${newIds.has(item.id) ? ' is-new' : ''}`}
            >
              <span className={`scan-result-dot ${item.scanResult === 'success' ? 'success' : 'fail'}`} />
              <span className="scan-time">{item.scanTime}</span>
              <span className="scan-operator">{item.operatorName || '—'}</span>
              <span className="scan-stage">{item.processName || item.progressStage || '—'}</span>
              <span className="scan-orderNo">{item.orderNo}</span>
              <span className="scan-quantity">×{item.quantity}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LiveScanFeed;
