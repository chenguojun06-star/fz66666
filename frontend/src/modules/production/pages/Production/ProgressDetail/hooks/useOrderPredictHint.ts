/**
 * useOrderPredictHint — 订单级预测完工时间（模块级缓存，跨组件共享）
 *
 * 设计：Popover 内的 SmartOrderHoverCard 会频繁挂载/卸载，
 * 因此把预测结果缓存在模块级 Map，避免重复请求。
 */
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { intelligenceApi } from '@/services/production/productionApi';

interface PredictHint {
  text: string;         // "03-15 14:00"
  confidence: string;   // "82%"
  remaining: number;    // 剩余件数
}

interface CacheEntry {
  hint: PredictHint | null;
  ts: number; // 缓存时间戳（ms）
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟 TTL
const cache    = new Map<string, CacheEntry>();
const pending  = new Set<string>();

export function useOrderPredictHint(
  orderId: string | undefined,
  orderNo: string | undefined,
  stageName: string | undefined,
  currentProgress: number,
  skip?: boolean,
) {
  const [hint, setHint] = useState<PredictHint | null>(null);
  // ★ 缓存 key 包含进度 + 当前工序，进度变化或工序推进时自动失效
  const progBucket = Math.floor(currentProgress / 5) * 5; // 每5%为一个桶，避免微小浮动
  const key = `${orderId || ''}_${stageName || ''}_${progBucket}`;

  // key 变化时清空旧结果，避免闪烁旧数据
  useEffect(() => { setHint(null); }, [key]);

  useEffect(() => {
    if (!orderId || skip || currentProgress >= 100 || !stageName) return;
    // 命中缓存且未过期
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
      setHint(entry.hint);
      return;
    }
    if (pending.has(key)) return;

    pending.add(key);
    intelligenceApi.predictFinishTime({
      orderId: orderId!,
      orderNo: orderNo || undefined,
      stageName,
      currentProgress,
    }).then((resp: any) => {
      const d = resp?.data;
      if (d?.predictedFinishTime) {
        const h: PredictHint = {
          text: dayjs(d.predictedFinishTime).format('MM-DD HH:mm'),
          confidence: d.confidence != null ? `${Math.round(d.confidence * 100)}%` : '',
          remaining: Number(d.remainingQuantity) || 0,
        };
        cache.set(key, { hint: h, ts: Date.now() });
        setHint(h);
      } else {
        cache.set(key, { hint: null, ts: Date.now() });
      }
    }).catch(() => { cache.set(key, { hint: null, ts: Date.now() }); })
      .finally(() => pending.delete(key));
  }, [key, orderId, skip, stageName, currentProgress, orderNo]);

  return hint;
}
