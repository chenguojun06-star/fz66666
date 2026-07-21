import { useState, useEffect, useCallback, useMemo } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import { normalizeMaterialQuantity } from '../../MaterialPurchase/utils';
import type { ApiResult, PageResult, MaterialPurchaseListResponse, PurchaseListParams } from './types';
import { REQUIRED_FIELDS } from './types';

export interface PurchaseDetailDataState {
  loading: boolean;
  order: ProductionOrder | null;
  purchaseList: MaterialPurchase[];
  colorList: string[];
  isMultiColor: boolean;
  missingColors: string[];
  materialArrivalRate: number;
  bomIncomplete: boolean;
  canProcure: boolean;
  loadData: () => Promise<void>;
  headerOrderNo: string;
  headerStyleNo: string;
  headerStyleName: string;
  headerStyleId?: number | string;
  headerStyleCover: string | null;
  headerColor: string;
}

export function usePurchaseDetailData(
  styleNoParam: string,
  orderNoParam: string
): PurchaseDetailDataState {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [purchaseList, setPurchaseList] = useState<MaterialPurchase[]>([]);

  const colorList = useMemo(() => {
    const raw = order?.color || '';
    if (!raw) return [];
    return raw.split(/[/,，、]/).map((s: string) => s.trim()).filter(Boolean);
  }, [order?.color]);

  const isMultiColor = colorList.length > 1;

  const missingColors = useMemo(() => {
    if (!isMultiColor) return [];
    if (purchaseList.length === 0) return colorList;
    const coveredColors = new Set(
      purchaseList
        .map((item) => String(item.color || '').trim())
        .filter(Boolean)
    );
    return colorList.filter((c: string) => !coveredColors.has(c));
  }, [isMultiColor, colorList, purchaseList]);

  const materialArrivalRate = useMemo(() => {
    const totalRequired = purchaseList.reduce((sum, item) => sum + normalizeMaterialQuantity(item.purchaseQuantity), 0);
    const totalArrived = purchaseList.reduce((sum, item) => sum + normalizeMaterialQuantity(item.arrivedQuantity), 0);
    if (totalRequired === 0) return 0;
    return Math.round((totalArrived / totalRequired) * 100);
  }, [purchaseList]);

  const bomIncomplete = useMemo(() => {
    if (purchaseList.length === 0) return true;
    return purchaseList.some((item) => {
      return REQUIRED_FIELDS.some((field) => {
        const val = item[field];
        return val === undefined || val === null || String(val).trim() === '';
      });
    });
  }, [purchaseList]);

  const loadData = useCallback(async () => {
    if (!styleNoParam) return;
    setLoading(true);
    let orderRecord: ProductionOrder | null = null;
    try {
      try {
        const orderRes = await api.get<ApiResult<PageResult<ProductionOrder>>>('/production/order/list', {
          params: { styleNo: styleNoParam, page: 1, pageSize: 1 },
        });
        const orders = orderRes?.data?.records || [];
        orderRecord = orders.length > 0 ? orders[0] : null;
        setOrder(orderRecord);
      } catch {
        setOrder(null);
      }

      const params: PurchaseListParams = orderNoParam
        ? { orderNo: orderNoParam, page: 1, pageSize: 1000 }
        : { styleNo: styleNoParam, page: 1, pageSize: 1000 };
      const purchaseRes = await api.get<MaterialPurchaseListResponse>('/production/purchase/list', { params });
      const result = purchaseRes;
      let records: MaterialPurchase[] = [];
      if (result?.code === 200) {
        records = result?.data?.records || [];
      } else {
        records = result?.data?.records || result?.records || [];
      }

      if (records.length === 0 && orderRecord?.id) {
        try {
          const previewRes = await api.get<ApiResult<MaterialPurchase[]>>(
            '/production/purchase/demand/preview',
            { params: { orderId: orderRecord.id } }
          );
          if (previewRes?.code === 200 && Array.isArray(previewRes?.data)) {
            records = previewRes.data;
          }
        } catch { /* 预览不可用则用空列表 */ }
      }

      if (records.length === 0 && orderNoParam && orderRecord) {
        const styleNo = String(orderRecord?.styleNo || '').trim();
        if (styleNo) {
          try {
            const styleRes = await api.get<MaterialPurchaseListResponse>('/production/purchase/list', {
              params: { styleNo, sourceType: 'sample', page: 1, pageSize: 1000 },
            });
            if (styleRes?.code === 200) {
              const styleRecords = styleRes?.data?.records || [];
              if (styleRecords.length > 0) {
                records = styleRecords;
              }
            }
          } catch { /* 降级 */ }
        }
      }

      setPurchaseList(records);
    } catch {
      message.error('加载采购数据失败');
    } finally {
      setLoading(false);
    }
  }, [styleNoParam, orderNoParam, message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canProcure = !bomIncomplete;

  const headerOrderNo = order?.orderNo || orderNoParam || '';
  const headerStyleNo = order?.styleNo || styleNoParam || '';
  const headerStyleName = order?.styleName || '';
  const headerStyleId = order?.styleId;
  const headerStyleCover = order?.styleCover || null;
  const headerColor = order?.color || '';

  return {
    loading,
    order,
    purchaseList,
    colorList,
    isMultiColor,
    missingColors,
    materialArrivalRate,
    bomIncomplete,
    canProcure,
    loadData,
    headerOrderNo,
    headerStyleNo,
    headerStyleName,
    headerStyleId,
    headerStyleCover,
    headerColor,
  };
}
