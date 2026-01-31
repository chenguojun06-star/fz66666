import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface VirtualListOptions<T> {
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

interface VirtualListResult<T> {
  virtualItems: T[];
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
  onScroll: (scrollTop: number) => void;
}

/**
 * 虚拟列表Hook
 * 用于优化大数据量列表的渲染性能
 * 
 * @example
 * const { virtualItems, totalHeight, offsetY, onScroll } = useVirtualList(
 *   largeDataArray,
 *   { itemHeight: 50, overscan: 5, containerHeight: 400 }
 * );
 */
export function useVirtualList<T>(
  items: T[],
  options: VirtualListOptions<T>
): VirtualListResult<T> {
  const { itemHeight, overscan = 5, containerHeight } = options;
  
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(scrollTop);
  scrollTopRef.current = scrollTop;
  
  // 计算总高度
  const totalHeight = useMemo(() => {
    return items.length * itemHeight;
  }, [items.length, itemHeight]);
  
  // 计算可见范围
  const { virtualItems, startIndex, endIndex, offsetY } = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    
    // 添加overscan缓冲
    const startIndex = Math.max(0, start - overscan);
    const endIndex = Math.min(
      items.length - 1,
      start + visibleCount + overscan
    );
    
    const virtualItems = items.slice(startIndex, endIndex + 1);
    const offsetY = startIndex * itemHeight;
    
    return {
      virtualItems,
      startIndex,
      endIndex,
      offsetY
    };
  }, [items, scrollTop, itemHeight, containerHeight, overscan]);
  
  // 滚动处理
  const onScroll = useCallback((newScrollTop: number) => {
    setScrollTop(newScrollTop);
  }, []);
  
  return {
    virtualItems,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    onScroll
  };
}

/**
 * 分页虚拟列表Hook
 * 结合分页加载的虚拟列表
 */
export function usePagedVirtualList<T>(
  options: VirtualListOptions<T> & {
    pageSize: number;
    loadMore: (page: number) => Promise<T[]>;
  }
) {
  const { pageSize, loadMore, ...virtualOptions } = options;
  
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  
  const virtualList = useVirtualList(items, virtualOptions);
  
  // 加载数据
  const loadData = useCallback(async (targetPage: number) => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const newItems = await loadMore(targetPage);
      if (newItems.length < pageSize) {
        setHasMore(false);
      }
      setItems(prev => targetPage === 1 ? newItems : [...prev, ...newItems]);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, loadMore, pageSize]);
  
  // 初始加载
  useEffect(() => {
    loadData(1);
  }, []);
  
  // 检查是否需要加载更多
  useEffect(() => {
    const { endIndex } = virtualList;
    if (endIndex >= items.length - pageSize / 2 && hasMore && !loading) {
      loadData(page + 1);
    }
  }, [virtualList.endIndex, items.length, hasMore, loading, page, loadData]);
  
  return {
    ...virtualList,
    items,
    loading,
    hasMore,
    reload: () => {
      setItems([]);
      setHasMore(true);
      setPage(1);
      loadData(1);
    }
  };
}
