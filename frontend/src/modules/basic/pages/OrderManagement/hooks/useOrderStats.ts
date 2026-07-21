import { useCallback, useState } from 'react';
import api from '@/utils/api';
import { initialOrderStats, type OrderStats, type StatFilterType } from '../helpers';

/**
 * 顶部统计卡片数据 Hook
 * 从 index.tsx 抽离：orderStats 状态 + loadOrderStats 加载 + activeStatFilter 筛选
 */
export function useOrderStats() {
  const [orderStats, setOrderStats] = useState<OrderStats>(initialOrderStats);
  const [activeStatFilter, setActiveStatFilter] = useState<StatFilterType>('completed');

  const loadOrderStats = useCallback(async () => {
    try {
      const res: any = await api.get('/style/info/stats', { params: { mode: 'order' } });
      if (res.code === 200 && res.data) {
        setOrderStats({
          totalStyles: Number(res.data.totalStyles || 0),
          developingStyles: Number(res.data.developingStyles || 0),
          completedStyles: Number(res.data.completedStyles || 0),
          delayedStyles: Number(res.data.delayedStyles || 0),
        });
      }
    } catch {
      // 静默失败，不影响列表加载
    }
  }, []);

  return { orderStats, loadOrderStats, activeStatFilter, setActiveStatFilter };
}
