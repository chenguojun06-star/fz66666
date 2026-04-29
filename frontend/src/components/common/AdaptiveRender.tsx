import React, { Suspense, useMemo } from 'react';
import { useDeviceCapability, type DeviceTier } from '@/hooks/useDeviceCapability';

interface AdaptiveRenderProps {
  high: React.ReactNode;
  medium?: React.ReactNode;
  low?: React.ReactNode;
  fallback?: React.ReactNode;
}

export const AdaptiveRender: React.FC<AdaptiveRenderProps> = ({ high, medium, low, fallback }) => {
  const { tier } = useDeviceCapability();

  const content = useMemo(() => {
    switch (tier) {
      case 'low': return low ?? medium ?? high;
      case 'medium': return medium ?? high;
      case 'high': return high;
      default: return high;
    }
  }, [tier, high, medium, low]);

  return <>{content}</>;
};

interface ConditionalRenderProps {
  minTier?: DeviceTier;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const TIER_PRIORITY: Record<DeviceTier, number> = { low: 0, medium: 1, high: 2 };

export const ConditionalRender: React.FC<ConditionalRenderProps> = ({ minTier = 'medium', children, fallback = null }) => {
  const { tier } = useDeviceCapability();

  if (TIER_PRIORITY[tier] >= TIER_PRIORITY[minTier]) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
};

interface LazyHeavyProps {
  loader: () => Promise<{ default: React.ComponentType<any> }>;
  props?: Record<string, any>;
  fallback?: React.ReactNode;
  minTier?: DeviceTier;
}

export const LazyHeavy: React.FC<LazyHeavyProps> = ({ loader, props = {}, fallback, minTier = 'low' }) => {
  const { tier } = useDeviceCapability();
  const LazyComponent = useMemo(() => React.lazy(loader), [loader]);

  if (TIER_PRIORITY[tier] < TIER_PRIORITY[minTier]) {
    return <>{fallback ?? <div style={{ padding: 16, color: '#888', fontSize: 13 }}>该功能需要更高性能的设备支持</div>}</>;
  }

  return (
    <Suspense fallback={fallback ?? <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>加载中…</div>}>
      <LazyComponent {...props} />
    </Suspense>
  );
};
