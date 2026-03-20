import { useState, useEffect, useCallback } from 'react';

export interface CardGridLayout {
  /** 每行显示的卡片数量（由视口宽度决定） */
  columns: number;
  /** 建议的分页数量，= columns × 行数，最多 maxCards 张 */
  pageSize: number;
}

/**
 * 根据视口尺寸动态计算卡片布局。
 *
 * 列数：视口宽度分档决定（2-8列）
 * 行数：可用高度 / 估算单张卡片高度（正方形封面 + 内容区 + 间距）
 * pageSize = min(columns × rows, maxCards)
 *
 * 监听 window resize，视口变化时自动更新。
 */
export function useCardGridLayout(maxCards = 10): CardGridLayout {
  const compute = useCallback((): CardGridLayout => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 列数分档（视口宽度 → 每行列数）
    const columns =
      w < 768  ? 2 :
      w < 1024 ? 3 :
      w < 1280 ? 4 :
      w < 1440 ? 5 :
      w < 1600 ? 6 :
      w < 1920 ? 7 : 8;

    // 可用高度 = 总高 - UI 固定区（导航 + 筛选栏 + 操作栏 + 分页 + 内边距，约 280px）
    const availH = Math.max(200, h - 280);

    // 估算单张卡片高度：正方形封面宽度 + 内容区(110px) + 行间距(16px)
    // 卡片宽度 = (可用宽度 - 左侧导航约240px) / 列数
    const cardW = Math.max(80, (w - 240) / columns);
    const cardH = cardW + 110 + 16;

    const rows = Math.max(1, Math.floor(availH / cardH));
    const pageSize = Math.min(columns * rows, maxCards);

    return { columns, pageSize };
  }, [maxCards]);

  const [layout, setLayout] = useState<CardGridLayout>(compute);

  useEffect(() => {
    const handler = () => setLayout(compute());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [compute]);

  return layout;
}
