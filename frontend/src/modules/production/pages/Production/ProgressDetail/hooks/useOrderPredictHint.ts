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

const cache    = new Map<string, PredictHint | null>();
const pending  = new Set<string>();

export function useOrderPredictHint(
  orderId: string | undefined,
  orderNo: string | undefined,
  stageName: string | undefined,
  currentProgress: number,
  skip?: boolean,
) {
  const [hint, setHint] = useState<PredictHint | null>(null);
  const key = String(orderId || '');

  useEffect(() => {
    if (!key || skip || currentProgress >= 100 || !stageName) return;
    if (cache.has(key)) { setHint(cache.get(key)!); return; }
    if (pending.has(key)) return;

    pending.add(key);
    intelligenceApi.predictFinishTime({
      orderId: key,
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
        cache.set(key, h);
        setHint(h);
      } else {
        cache.set(key, null);
      }
    }).catch(() => { cache.set(key, null); })
      .finally(() => pending.delete(key));
  }, [key, skip, stageName, currentProgress, orderNo]);

  return hint;
}
