import { useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import type { Dispatch, SetStateAction } from 'react';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import type { ProductionOrder } from '@/types/production';
import { isOrderFrozenByStatus } from '@/utils/api';

export type SmartQueueFilter = 'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue';

type SmartActionTone = 'orange' | 'red' | 'cyan' | 'green';

export type SmartActionItem = {
  key: Exclude<SmartQueueFilter, 'all'>;
  label: string;
  value: number;
  hint: string;
  tone: SmartActionTone;
  active: boolean;
  onClick: () => void;
};

type UseProductionSmartQueueParams = {
  orders: ProductionOrder[];
  deliveryRiskMap: Map<string, DeliveryRiskItem>;
  stagnantOrderIds: Map<string, number> | Set<string>;
  smartQueueFilter: SmartQueueFilter;
  setSmartQueueFilter: Dispatch<SetStateAction<SmartQueueFilter>>;
  triggerOrderFocus: (record: Partial<ProductionOrder> | null | undefined) => void;
  clearFocus: () => void;
};

const isUrgentOrder = (order: ProductionOrder) => {
  if (isOrderFrozenByStatus(order) || !order.plannedEndDate) return false;
  return dayjs(order.plannedEndDate).diff(dayjs(), 'day') <= 3;
};

const isBehindOrder = (order: ProductionOrder) => {
  if (isOrderFrozenByStatus(order) || !order.plannedEndDate) return false;
  const daysLeft = dayjs(order.plannedEndDate).diff(dayjs(), 'day');
  return daysLeft <= 7 && (Number(order.productionProgress) || 0) < 50;
};

const isOverdueRiskOrder = (order: ProductionOrder, deliveryRiskMap: Map<string, DeliveryRiskItem>) => {
  if (isOrderFrozenByStatus(order)) return false;
  return deliveryRiskMap.get(String(order.orderNo || ''))?.riskLevel === 'overdue';
};

export const useProductionSmartQueue = ({
  orders,
  deliveryRiskMap,
  stagnantOrderIds,
  smartQueueFilter,
  setSmartQueueFilter,
  triggerOrderFocus,
  clearFocus,
}: UseProductionSmartQueueParams) => {
  const urgentOrders = useMemo(() => orders.filter(isUrgentOrder), [orders]);

  const behindOrders = useMemo(() => orders.filter(isBehindOrder), [orders]);

  const stagnantOrders = useMemo(
    () => orders.filter((order) => !isOrderFrozenByStatus(order) && stagnantOrderIds.has(String(order.id || ''))),
    [orders, stagnantOrderIds]
  );

  const overdueOrders = useMemo(
    () => orders.filter((order) => isOverdueRiskOrder(order, deliveryRiskMap)),
    [deliveryRiskMap, orders]
  );

  const smartHints = useMemo(
    () => ({
      urgentCount: urgentOrders.length,
      behindCount: behindOrders.length,
    }),
    [behindOrders.length, urgentOrders.length]
  );

  const smartQueueOrders = useMemo(() => {
    if (smartQueueFilter === 'all') return orders;
    if (smartQueueFilter === 'urgent') return urgentOrders;
    if (smartQueueFilter === 'behind') return behindOrders;
    if (smartQueueFilter === 'stagnant') return stagnantOrders;
    return overdueOrders;
  }, [behindOrders, orders, overdueOrders, smartQueueFilter, stagnantOrders, urgentOrders]);

  const handleSmartFilterToggle = useCallback((targetFilter: Exclude<SmartQueueFilter, 'all'>, targetOrder?: ProductionOrder) => {
    if (smartQueueFilter === targetFilter) {
      setSmartQueueFilter('all');
      clearFocus();
      return;
    }
    setSmartQueueFilter(targetFilter);
    triggerOrderFocus(targetOrder);
  }, [clearFocus, setSmartQueueFilter, smartQueueFilter, triggerOrderFocus]);

  const smartActionItems = useMemo<SmartActionItem[]>(() => ([
    {
      key: 'urgent',
      label: '待催交付',
      value: smartHints.urgentCount,
      hint: '3天内要交货，适合先盯需要马上催推进的单。',
      tone: 'orange',
      active: smartQueueFilter === 'urgent',
      onClick: () => handleSmartFilterToggle('urgent', urgentOrders[0]),
    },
    {
      key: 'behind',
      label: '进度落后',
      value: smartHints.behindCount,
      hint: '交期临近但进度偏低，适合马上看节点卡在哪里。',
      tone: 'red',
      active: smartQueueFilter === 'behind',
      onClick: () => handleSmartFilterToggle('behind', behindOrders[0]),
    },
    {
      key: 'stagnant',
      label: '停滞订单',
      value: stagnantOrders.length,
      hint: '已扫描过但连续停住，适合先联系工厂确认原因。',
      tone: 'cyan',
      active: smartQueueFilter === 'stagnant',
      onClick: () => handleSmartFilterToggle('stagnant', stagnantOrders[0]),
    },
    {
      key: 'overdue',
      label: '预测逾期',
      value: overdueOrders.length,
      hint: '基于实时节奏预测掉期，适合优先抢救最危险的单。',
      tone: 'green',
      active: smartQueueFilter === 'overdue',
      onClick: () => handleSmartFilterToggle('overdue', overdueOrders[0]),
    },
  ]), [behindOrders, handleSmartFilterToggle, overdueOrders, smartHints.behindCount, smartHints.urgentCount, smartQueueFilter, stagnantOrders, urgentOrders]);

  return {
    smartHints,
    urgentOrders,
    behindOrders,
    stagnantOrders,
    overdueOrders,
    smartQueueOrders,
    smartActionItems,
  };
};
