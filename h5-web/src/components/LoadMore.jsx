import { useState, useEffect, useCallback, useRef } from 'react';

export default function LoadMore({ onLoadMore, hasMore, loading, children }) {
  const sentinelRef = useRef(null);
  const [observer, setObserver] = useState(null);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) onLoadMore();
  }, [hasMore, loading, onLoadMore]);

  useEffect(() => {
    if (observer) observer.disconnect();
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    obs.observe(sentinelRef.current);
    setObserver(obs);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  return (
    <>
      {children}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          加载中...
        </div>
      )}
      {!hasMore && children && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-disabled)', fontSize: 'var(--font-size-xs)' }}>
          没有更多了
        </div>
      )}
    </>
  );
}
