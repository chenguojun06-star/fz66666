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
  orderNoParam: string,
  sampleMode?: boolean,
  styleIdParam?: string | number,
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

  // 样衣场景下 supplierName 不必填（样衣采购可无供应商），大货场景全部必填
  const requiredFields = useMemo(() => {
    if (sampleMode) {
      return REQUIRED_FIELDS.filter((f) => f !== 'supplierName');
    }
    return REQUIRED_FIELDS;
  }, [sampleMode]);

  const bomIncomplete = useMemo(() => {
    if (purchaseList.length === 0) return true;
    return purchaseList.some((item) => {
      return requiredFields.some((field) => {
        const val = item[field];
        return val === undefined || val === null || String(val).trim() === '';
      });
    });
  }, [purchaseList, requiredFields]);

  const loadData = useCallback(async () => {
    if (!styleNoParam) return;
    setLoading(true);
    let orderRecord: ProductionOrder | null = null;
    try {
      // 样衣采购场景：跳过订单查询，避免无谓的 HTTP 请求与"订单不存在"警告
      if (!sampleMode) {
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
      } else {
        setOrder(null);
      }

      // 样衣场景：自动从BOM同步物料到采购表（静默，不需用户手动触发）
      // 首次打开：从BOM自动生成采购记录；后续打开：已有记录则跳过，BOM新增物料时增量补充
      if (sampleMode && styleIdParam) {
        try {
          await api.post('/style/bom/generate-purchase', { styleId: styleIdParam, force: false });
        } catch {
          // 已有采购记录时会报错"已生成过"，这是正常情况，静默忽略，继续查询已有记录
        }
      }

      // 样衣场景直接按 sourceType='sample' + styleNo 过滤，避免拉到订单采购数据
      const params: PurchaseListParams = sampleMode
        ? { styleNo: styleNoParam, sourceType: 'sample' as any, page: 1, pageSize: 1000 }
        : orderNoParam
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

      if (!sampleMode && records.length === 0 && orderRecord?.id) {
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

      if (!sampleMode && records.length === 0 && orderNoParam && orderRecord) {
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
  }, [styleNoParam, orderNoParam, sampleMode, styleIdParam, message]);

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
