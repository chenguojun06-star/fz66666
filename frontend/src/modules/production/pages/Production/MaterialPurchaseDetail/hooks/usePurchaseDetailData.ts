import { useState, useEffect, useCallback, useMemo } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { splitStyleOptions } from '@/utils/styleOptions';
import { productionPatternApi } from '@/services/production/productionApi';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import { normalizeMaterialQuantity } from '../../MaterialPurchase/utils';
import type { ApiResult, PageResult, MaterialPurchaseListResponse, PurchaseListParams } from './types';
import { REQUIRED_FIELDS, isPurchaseRowComplete } from './types';

/**
 * 将款式/样衣生产的 sizeColorConfig/sizeColorMatrix（{sizes, matrixRows:[{color, quantities}]}）
 * 解析为 {color,size,quantity} 行数组，用于样衣打印采购单的"下单明细"矩阵与数量兜底。
 */
const parseSizeColorMatrix = (matrix: unknown): Array<{ color: string; size: string; quantity: number }> => {
  const lines: Array<{ color: string; size: string; quantity: number }> = [];
  let parsedMatrix: { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> } | null = null;
  if (matrix && typeof matrix === 'string') {
    try { parsedMatrix = JSON.parse(matrix); } catch { /* ignore */ }
  } else if (matrix && typeof matrix === 'object') {
    parsedMatrix = matrix as { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> };
  }
  const sizes = Array.isArray(parsedMatrix?.sizes) ? (parsedMatrix!.sizes as string[]) : [];
  const rows = Array.isArray(parsedMatrix?.matrixRows) ? (parsedMatrix!.matrixRows as Array<Record<string, unknown>>) : [];
  rows.forEach((row) => {
    const rowColor = String(row?.color || '').trim();
    const quantities = Array.isArray(row?.quantities) ? (row.quantities as number[]) : [];
    sizes.forEach((sz, idx) => {
      const q = Number(quantities[idx] || 0);
      if (q > 0) {
        lines.push({ color: rowColor, size: String(sz || '').trim(), quantity: q });
      }
    });
  });
  return lines;
};

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
  /** 样衣采购场景：BOM 阶段已完成，编辑/删除需先在样衣详情退回 */
  sampleBomLocked: boolean;
  sampleBomCompletedTime: string;
  /** D-360：样衣模式颜色×码数矩阵行（打印采购单"下单明细"矩阵与数量兜底） */
  sampleOrderLines: Array<{ color: string; size: string; quantity: number }>;
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
  const [sampleBomCompletedTime, setSampleBomCompletedTime] = useState('');
  // 样衣采购场景：订单为空，抬头(款名/图片/颜色)由款式信息回填，避免打印/显示为"-"
  const [sampleStyle, setSampleStyle] = useState<{ styleName?: string; styleCover?: string | null; color?: string }>({});
  // D-360：样衣模式颜色×码数矩阵行（打印采购单"下单明细"矩阵与数量兜底）
  const [sampleOrderLines, setSampleOrderLines] = useState<Array<{ color: string; size: string; quantity: number }>>([]);

  const colorList = useMemo(() => {
    const raw = order?.color || '';
    if (!raw) return [];
    // 统一使用智能切分：避免把含 "/" 的颜色名（如"黑/白拼色"）或码数切碎
    return splitStyleOptions(raw);
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

      // 样衣场景直接按 sourceType='sample' + styleNo 过滤，避免拉到订单采购数据
      const params: PurchaseListParams = sampleMode
        ? { styleNo: styleNoParam, sourceType: 'sample' as any, page: 1, pageSize: 1000 }
        : orderNoParam
          ? { orderNo: orderNoParam, page: 1, pageSize: 1000 }
          : { styleNo: styleNoParam, page: 1, pageSize: 1000 };

      const fetchRecords = async (): Promise<MaterialPurchase[]> => {
        const purchaseRes = await api.get<MaterialPurchaseListResponse>('/production/purchase/list', { params });
        const result = purchaseRes;
        if (result?.code === 200) {
          return result?.data?.records || [];
        }
        return result?.data?.records || result?.records || [];
      };

      let records: MaterialPurchase[] = [];

      // 样衣场景：自动从BOM同步物料到采购表（静默，不需用户手动触发）
      // D-104 优化：先查已有记录，为空才调 generate-purchase 生成后重查，
      // 避免每次打开页面都触发一次"已生成过"的 400 业务拦截
      if (sampleMode && styleIdParam) {
        records = await fetchRecords();
        if (records.length === 0) {
          try {
            await api.post('/style/bom/generate-purchase', { styleId: styleIdParam, force: false });
            records = await fetchRecords();
          } catch {
            // 生成失败（如"尚未配置BOM"）时保持空列表，不打断页面
          }
        }
      } else {
        records = await fetchRecords();
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

      // 注意：不再降级拉取样衣采购（sourceType=sample）作为订单采购数据展示。
      // 样衣采购数量按样衣件数计算（如1件=1米），与大货订单需求（如6件=6米）口径不同，
      // 混用会导致"面料6米/辅料1米"这类数据不吻合（D-106）。

      // 样衣采购场景：查询款式BOM阶段状态 + 用款式的 sizeColorConfig 构造颜色×码数矩阵（打印"下单明细"数量兜底）
      if (sampleMode && styleIdParam) {
        try {
          const styleRes = await api.get<{ code: number; data: any }>(
            `/style/info/${encodeURIComponent(String(styleIdParam))}`,
          );
          if (styleRes?.code === 200) {
            const styleData = styleRes.data as any;
            setSampleBomCompletedTime(String(styleData?.bomCompletedTime || ''));
            setSampleStyle({
              styleName: String(styleData?.styleName || ''),
              styleCover: (styleData?.styleCover || null) as string | null,
              color: String(styleData?.color || ''),
            });
            // D-360：优先用款式自身 sizeColorConfig；为空再兜底样衣生产详情的 sizeColorMatrix
            const styleLines = parseSizeColorMatrix(styleData?.sizeColorConfig || styleData?.sizeColorMatrix);
            if (styleLines.length) {
              setSampleOrderLines(styleLines);
            } else if (records[0]?.patternProductionId) {
              try {
                const patternRes = await productionPatternApi.getPatternDetail(String(records[0].patternProductionId));
                const p = patternRes?.data as any;
                if (patternRes?.code === 200 && p) {
                  const patternLines = parseSizeColorMatrix(p?.sizeColorMatrix || p?.sizeColorConfig);
                  if (patternLines.length) setSampleOrderLines(patternLines);
                  if (!styleData?.styleCover && p?.coverImage) {
                    setSampleStyle((prev) => ({ ...prev, styleCover: String(p.coverImage || '') || prev.styleCover }));
                  }
                }
              } catch { /* 样衣生产详情不可用时忽略 */ }
            }
          } else {
            setSampleBomCompletedTime('');
          }
        } catch {
          setSampleBomCompletedTime('');
        }
      }

      // D-364：样衣模式未传 styleId（部分入口只有款号）时按款号兜底查款式，
      // 否则款名/款式图/颜色/码数矩阵全空——表现为弹窗和打印单"没有款式信息、没有图片"
      if (sampleMode && !styleIdParam && styleNoParam) {
        try {
          const listRes = await api.get<any>('/style/info/list', {
            params: { styleNo: styleNoParam, page: 1, pageSize: 5 },
          });
          const rows: any[] = (listRes as any)?.data?.records || [];
          const hit = rows.find((s: any) => String(s?.styleNo || '').trim() === String(styleNoParam).trim()) || rows[0];
          if (hit) {
            setSampleBomCompletedTime(String(hit?.bomCompletedTime || ''));
            setSampleStyle({
              styleName: String(hit?.styleName || ''),
              styleCover: (hit?.cover || hit?.styleCover || null) as string | null,
              color: String(hit?.color || ''),
            });
            const lines = parseSizeColorMatrix(hit?.sizeColorConfig || hit?.sizeColorMatrix);
            if (lines.length) setSampleOrderLines(lines);
          }
        } catch { /* 按款号兜底失败忽略，不影响主流程 */ }
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

  // 修复：整单禁采改为"存在至少一行本体信息完整即可采购"。
  // 旧逻辑 = !bomIncomplete（任一行缺供应商即全单禁采，一行有缺惩罚全部）
  const canProcure = purchaseList.length > 0 && purchaseList.some((p) => isPurchaseRowComplete(p));

  /** 样衣BOM已完成 → 采购数据锁定，编辑/删除需先退回 */
  const sampleBomLocked = useMemo(
    () => !!sampleMode && !!sampleBomCompletedTime,
    [sampleMode, sampleBomCompletedTime],
  );

  const headerOrderNo = order?.orderNo || orderNoParam || '';
  const headerStyleNo = order?.styleNo || styleNoParam || '';
  const headerStyleName = order?.styleName || sampleStyle.styleName || '';
  const headerStyleId = order?.styleId;
  const headerStyleCover = order?.styleCover || sampleStyle.styleCover || null;
  const headerColor = order?.color || sampleStyle.color || '';

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
    sampleBomLocked,
    sampleBomCompletedTime,
    sampleOrderLines,
  };
}
