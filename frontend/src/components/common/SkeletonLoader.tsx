import React from 'react';
import { Skeleton } from 'antd';

interface SkeletonLoaderProps {
  type?: 'table' | 'card' | 'list' | 'text' | 'image';
  rows?: number;
  loading?: boolean;
  children?: React.ReactNode;
  avatar?: boolean;
  active?: boolean;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'list',
  rows = 5,
  loading = true,
  children,
  avatar = false,
  active = true,
}) => {
  if (!loading) {
    return <>{children}</>;
  }

  switch (type) {
    case 'table':
      return (
        <div style={{ padding: 16 }}>
          <Skeleton active={active} paragraph={{ rows: 1 }} title={{ width: '30%' }} />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} active={active} paragraph={{ rows: 1 }} title={false} style={{ marginTop: 16 }} />
          ))}
        </div>
      );

    case 'card':
      return (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ background: 'var(--color-bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--color-border-light)' }}>
              <Skeleton.Image active={active} style={{ width: '100%', height: 120, borderRadius: 6 }} />
              <Skeleton active={active} paragraph={{ rows: 2 }} style={{ marginTop: 12 }} />
            </div>
          ))}
        </div>
      );

    case 'image':
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton.Image key={i} active={active} style={{ width: 80, height: 80, borderRadius: 6 }} />
          ))}
        </div>
      );

    case 'text':
      return <Skeleton active={active} paragraph={{ rows }} />;

    case 'list':
    default:
      return (
        <div>
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton
              key={i}
              avatar={avatar}
              active={active}
              paragraph={{ rows: 1 }}
              style={{ marginBottom: 16 }}
            />
          ))}
        </div>
      );
  }
};

export default SkeletonLoader;
