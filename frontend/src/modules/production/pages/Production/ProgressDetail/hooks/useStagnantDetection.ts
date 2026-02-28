import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';

/** 无新扫码超过多少天判定为停滞 */
const STAGNANT_DAYS = 3;

/**
 * 停滞订单检测
 * - 使用已在全局 store 中缓存的 boardTimesByOrder，无需额外 API 调用
 * - 只判断进行中（非 completed）且有过扫码记录的订单
 * - 返回停滞的订单 ID Set，供列表列显示徽标
 */
export function useStagnantDetection(
  orders: ProductionOrder[],
  boardTimesByOrder: Record<string, Record<string, string>>,
): Set<string> {
  return useMemo(() => {
    const stagnant = new Set<string>();
    const now = dayjs();

    for (const order of orders) {
      if (order.status === 'completed' || !order.id) continue;

      const timeMap = boardTimesByOrder[String(order.id)];
      // 数据尚未加载 → 不判断（避免误报）
      if (!timeMap) continue;

      const times = Object.values(timeMap).filter(Boolean);
      // 从未有扫码记录 → 是"未开工"，不是"停滞"
      if (times.length === 0) continue;

      const lastScan = times.reduce((max, t) => (t > max ? t : max));
      if (now.diff(dayjs(lastScan), 'day') >= STAGNANT_DAYS) {
        stagnant.add(String(order.id));
      }
    }
    return stagnant;
  }, [orders, boardTimesByOrder]);
}
