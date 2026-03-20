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

    // 实际可用宽度扣掉左侧导航（约240px）和内边距（约32px）
    const availW = Math.max(300, w - 272);

    // 每张卡片最小宽度 200px，计算能塞下几列（上限 6）
    const columns = Math.min(6, Math.max(1, Math.floor(availW / 200)));

    // 可用高度 = 总高 - UI 固定区（导航 + 筛选栏 + 操作栏 + 分页 + 内边距，约 280px）
    const availH = Math.max(200, h - 280);

    // 估算单张卡片高度：正方形封面宽度 + 内容区(110px) + 行间距(16px)
    const cardW = Math.max(200, availW / columns);
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
