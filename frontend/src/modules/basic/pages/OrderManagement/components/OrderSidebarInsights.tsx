import React from 'react';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import type { SchedulePlan } from '@/services/intelligence/intelligenceApi';
import SmartStyleInsightCard from './SmartStyleInsightCard';
import OrderSchedulingInsights from './OrderSchedulingInsights';

interface OrderSidebarInsightsProps {
  styleNo?: string;
  factoryName?: string;
  capacityData?: FactoryCapacityItem | null;
  schedulingLoading: boolean;
  schedulingPlans: SchedulePlan[];
  selectedFactoryId?: string;
  factories: Array<{ id?: string | number; factoryName: string }>;
  onSelectFactory: (factoryId: string) => void;
}

const OrderSidebarInsights: React.FC<OrderSidebarInsightsProps> = ({
  styleNo,
  factoryName,
  capacityData,
  schedulingLoading,
  schedulingPlans,
  selectedFactoryId,
  factories,
  onSelectFactory,
}) => {
  if (!styleNo) {
    return null;
  }

  return (
    <>
      <SmartStyleInsightCard
        styleNo={styleNo}
        factoryName={factoryName}
        capacityData={capacityData}
      />
      <OrderSchedulingInsights
        loading={schedulingLoading}
        plans={schedulingPlans}
        selectedFactoryId={selectedFactoryId}
        factories={factories}
        onSelectFactory={onSelectFactory}
      />
    </>
  );
};

export default OrderSidebarInsights;
