import { useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { CuttingBundle, CuttingTask, ProductionOrder, ProductWarehousing } from '@/types/production';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { message } from '@/utils/antdStatic';
import { useFlowQuery } from './hooks/useFlowQuery';
import { useStyleProcessDescriptions } from './hooks/useStyleProcessDescriptions';
import {
  orderStatusTag,
  buildStageColumns,
  enrichStagesWithPurchase,
  computeOrderLines,
  buildOrderLineColumns,
  computeWarehousingTotal,
  computeWarehousingQualified,
  computeWarehousingUnqualified,
  computeCuttingSizeItems,
} from './utils';

export type FlowStage = {
  processName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  totalQuantity?: number;
  startTime?: string;
  startOperatorId?: string;
  startOperatorName?: string;
  completeTime?: string;
  completeOperatorId?: string;
  completeOperatorName?: string;
  lastTime?: string;
  lastOperatorId?: string;
  lastOperatorName?: string;
};

export type OrderFlowResponse = {
  order: ProductionOrder;
  stages: FlowStage[];
  warehousings?: ProductWarehousing[];
  cuttingBundles?: CuttingBundle[];
  cuttingTasks?: CuttingTask[];
  materialPurchases?: any[];
};

import type { OrderLine } from '@/types/production';

export { orderStatusTag };

export function useOrderFlowData() {
  const query = useFlowQuery();
  const { user } = useUser();
  const isFactoryUser = !!(user as any)?.factoryId;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OrderFlowResponse | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const fetchFlow = async () => {
    if (!query.orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any }>(`/production/order/flow/${query.orderId}`);
      if (res.code === 200) {
        const flowData = res.data as OrderFlowResponse;
        setData(flowData || null);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('订单全流程加载失败', res.message || '服务返回异常，请稍后重试', 'ORDER_FLOW_LOAD_FAILED');
        message.error(res.message || '获取订单全流程失败');
        setData(null);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('订单全流程加载失败', errMsg, 'ORDER_FLOW_LOAD_EXCEPTION');
      message.error(e instanceof Error ? e.message : '获取订单全流程失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.orderId]);

  const styleId = String(data?.order?.styleId || '').trim();
  const { styleProcessDescriptionMap, secondaryProcessDescriptionMap } = useStyleProcessDescriptions(styleId);

  const enrichedStages = useMemo(() => enrichStagesWithPurchase(data), [data]);

  const stageColumns = useMemo(() => buildStageColumns(), []);

  const order = data?.order;

  const orderLines = useMemo(() => {
    const warehousings = (data?.warehousings || []) as ProductWarehousing[];
    const cuttingBundles = (data?.cuttingBundles || []) as CuttingBundle[];
    const styleQuotationTotalPrice = Number((data as any)?.styleQuotation?.totalPrice) || 0;
    return computeOrderLines(order, warehousings, cuttingBundles, styleQuotationTotalPrice);
  }, [order, data?.warehousings, data?.cuttingBundles, (data as any)?.styleQuotation]);

  const orderLineColumns = useMemo(() => buildOrderLineColumns(), []);

  const warehousingTotal = useMemo(
    () => computeWarehousingTotal(data?.warehousings || []),
    [data?.warehousings],
  );
  const warehousingQualified = useMemo(
    () => computeWarehousingQualified(data?.warehousings || []),
    [data?.warehousings],
  );
  const warehousingUnqualified = useMemo(
    () => computeWarehousingUnqualified(data?.warehousings || []),
    [data?.warehousings],
  );

  const cuttingSizeItems = useMemo(() => {
    const bundles = (data?.cuttingBundles || []) as CuttingBundle[];
    return computeCuttingSizeItems(bundles);
  }, [data?.cuttingBundles]);

  const cuttingBundles = useMemo(() => (data?.cuttingBundles || []) as CuttingBundle[], [data?.cuttingBundles]);
  const cuttingTasks = useMemo(() => (data?.cuttingTasks || []) as CuttingTask[], [data?.cuttingTasks]);

  return {
    query,
    loading,
    data,
    order,
    isFactoryUser,
    smartError,
    showSmartErrorNotice,
    fetchFlow,
    enrichedStages,
    stageColumns,
    orderLines,
    orderLineColumns,
    warehousingTotal,
    warehousingQualified,
    warehousingUnqualified,
    cuttingSizeItems,
    cuttingBundles,
    cuttingTasks,
    styleProcessDescriptionMap,
    secondaryProcessDescriptionMap,
  };
}
