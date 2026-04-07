import { useState, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { AnomalyItem } from '@/services/intelligence/intelligenceApi';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { ProductionOrder, ProductionQueryParams } from '@/types/production';

interface UseAnomalyDetectionParams {
  productionList: ProductionOrder[];
  message: MessageInstance;
  navigate: (to: string) => void;
  setActiveStatFilter: (v: 'production' | 'delayed' | 'today') => void;
  setShowDelayedOnly: (v: boolean) => void;
  setSmartQueueFilter: (v: 'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue') => void;
  setQueryParams: Dispatch<SetStateAction<ProductionQueryParams>>;
  triggerOrderFocus: (record: Partial<ProductionOrder> | null | undefined) => void;
}

export function useAnomalyDetection({
  productionList,
  message,
  navigate,
  setActiveStatFilter,
  setShowDelayedOnly,
  setSmartQueueFilter,
  setQueryParams,
  triggerOrderFocus,
}: UseAnomalyDetectionParams) {
  const [anomalyItems, setAnomalyItems] = useState<AnomalyItem[]>([]);
  const [anomalyBannerVisible, setAnomalyBannerVisible] = useState(false);
  const anomalyFetched = useRef(false);

  const fetchAnomalies = useCallback(async () => {
    if (anomalyFetched.current || !isSmartFeatureEnabled('smart.production.precheck.enabled')) return;
    anomalyFetched.current = true;
    try {
      const res = await intelligenceApi.detectAnomalies() as any;
      const items: AnomalyItem[] = res?.data?.items ?? res?.items ?? [];
      const significant = items.filter(i => i.severity === 'critical' || i.severity === 'warning');
      if (significant.length > 0) {
        setAnomalyItems(significant);
        setAnomalyBannerVisible(true);
      }
    } catch { /* silent — 不阻塞主列表 */ }
  }, []);

  const resolveAnomalyTargetOrder = useCallback((item: AnomalyItem) => {
    const targetName = String(item.targetName || '').trim();
    const description = String(item.description || '').trim();
    const candidateTexts = [targetName, description].filter(Boolean);
    const orderNoPattern = /[A-Z]{1,6}\d{6,}/g;

    for (const text of candidateTexts) {
      const matches = text.match(orderNoPattern) || [];
      for (const match of matches) {
        const order = productionList.find((record) => String(record.orderNo || '').trim() === match);
        if (order) return order;
      }
      const exactOrder = productionList.find((record) => String(record.orderNo || '').trim() === text);
      if (exactOrder) return exactOrder;
    }

    const factoryMatchedOrder = productionList.find((record) => {
      const factoryName = String(record.factoryName || '').trim();
      return !!factoryName && !!targetName && (factoryName === targetName || targetName.includes(factoryName) || factoryName.includes(targetName));
    });
    if (factoryMatchedOrder) return factoryMatchedOrder;

    return null;
  }, [productionList]);

  const handleAnomalyClick = useCallback((item: AnomalyItem) => {
    const targetOrder = resolveAnomalyTargetOrder(item);
    if (!targetOrder) {
      message.info(`暂未匹配到"${item.targetName}"对应订单`);
      return;
    }

    const targetOrderNo = String(targetOrder.orderNo || '').trim();
    if (item.type === 'quality_spike' && targetOrderNo) {
      navigate(`/production/progress-detail?orderNo=${encodeURIComponent(targetOrderNo)}&focusNode=${encodeURIComponent('质检')}`);
      return;
    }

    setActiveStatFilter('production');
    setShowDelayedOnly(false);
    setSmartQueueFilter('all');
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      status: '',
      delayedOnly: undefined,
      todayOnly: undefined,
      keyword: targetOrderNo || prev.keyword,
    }));
    triggerOrderFocus(targetOrder);
  }, [message, navigate, resolveAnomalyTargetOrder, triggerOrderFocus]);

  return {
    anomalyItems,
    anomalyBannerVisible,
    setAnomalyBannerVisible,
    fetchAnomalies,
    handleAnomalyClick,
  };
}
