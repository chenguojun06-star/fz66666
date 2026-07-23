import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormInstance } from 'antd';
import api, { isApiSuccess } from '@/utils/api';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { DeliveryDateSuggestionResponse, SchedulingSuggestionResponse } from '@/services/intelligence/intelligenceApi';
import { orderLearningApi } from '@/services/intelligence/orderLearningApi';
import type { OrderLearningRecommendationResponse } from '@/services/intelligence/orderLearningApi';
import type { StyleInfo } from '@/types/style';
import type { OrderLine, ProgressNode } from '../types';
import type { SizePriceRecord } from '../utils/orderIntelligence';

interface UseOrderIntelligenceParams {
  visible: boolean;
  selectedStyle: StyleInfo | null;
  totalOrderQuantity: number;
  form: FormInstance;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  watchedPricingMode: 'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL';
  watchedManualOrderUnitPrice: number;
  selectedFactoryStat: FactoryCapacityItem | null;
  orderLines: OrderLine[];
  sizePriceRows: SizePriceRecord[];
  progressNodes: ProgressNode[];
  pricingModeTouched: boolean;
  normalizeSizeKey: (v: unknown) => string;
}

export function useOrderIntelligence(params: UseOrderIntelligenceParams) {
  const {
    visible, selectedStyle, totalOrderQuantity, form, factoryMode,
    watchedPricingMode, watchedManualOrderUnitPrice, selectedFactoryStat,
    orderLines, sizePriceRows, progressNodes, pricingModeTouched, normalizeSizeKey,
  } = params;

  // 交货期智能建议
  const [deliverySuggestion, setDeliverySuggestion] = useState<DeliveryDateSuggestionResponse | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [quoteReference, setQuoteReference] = useState<{ currentQuotation: number; totalCost: number; suggestedPrice: number } | null>(null);
  const quotationUnitPrice = Number(quoteReference?.currentQuotation || 0);
  const totalCostUnitPrice = Number(quoteReference?.totalCost || 0);
  const suggestedQuotationUnitPrice = Number(quoteReference?.suggestedPrice || 0);
  const [orderLearningLoading, setOrderLearningLoading] = useState(false);
  const [orderLearningRecommendation, setOrderLearningRecommendation] = useState<OrderLearningRecommendationResponse | null>(null);

  // AI 排产建议状态
  const [schedulingResult, setSchedulingResult] = useState<SchedulingSuggestionResponse | null>(null);
  const [schedulingLoading, setSchedulingLoading] = useState(false);

  // 竞态保护：每次发起请求自增 requestId，响应回来后比对，不匹配则丢弃
  const deliveryRequestIdRef = useRef(0);
  const schedulingRequestIdRef = useRef(0);

  const fetchDeliverySuggestion = useCallback(async (factoryName?: string, qty?: number) => {
    if (!factoryName && !qty) return;
    const requestId = ++deliveryRequestIdRef.current;
    setSuggestionLoading(true);
    try {
      const res = await intelligenceApi.getDeliveryDateSuggestion(factoryName, qty);
      if (deliveryRequestIdRef.current !== requestId) return; // 旧请求丢弃
      if (isApiSuccess(res) && res?.data) {
        setDeliverySuggestion(res.data as DeliveryDateSuggestionResponse);
      }
    } catch { /* 静默失败 */ } finally {
      if (deliveryRequestIdRef.current === requestId) {
        setSuggestionLoading(false);
      }
    }
  }, []);

  const fetchSchedulingSuggestion = useCallback(async () => {
    const styleNo = selectedStyle?.styleNo || '';
    const qty = totalOrderQuantity;
    const deadline = form.getFieldValue('plannedEndDate');
    if (!qty || qty <= 0) {
      return;
    }
    const deadlineStr = deadline ? (deadline.format?.('YYYY-MM-DD') ?? String(deadline)) : '';
    const productCategory = form.getFieldValue('productCategory') || selectedStyle?.category || '';
    const requestId = ++schedulingRequestIdRef.current;
    setSchedulingLoading(true);
    try {
      const res = await intelligenceApi.suggestScheduling({ styleNo, quantity: qty, deadline: deadlineStr, productCategory });
      if (schedulingRequestIdRef.current !== requestId) return; // 旧请求丢弃
      if (isApiSuccess(res) && res?.data) {
        setSchedulingResult(res.data as SchedulingSuggestionResponse);
      }
    } catch { /* 静默失败 */ } finally {
      if (schedulingRequestIdRef.current === requestId) {
        setSchedulingLoading(false);
      }
    }
  }, [selectedStyle, totalOrderQuantity, form]);

  // 排产建议自动触发（防抖 500ms，避免连续修改数量时雪崩）
  const schedulingTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!visible) {
      // 弹窗关闭时清空排产建议，避免下次打开残留旧数据
      schedulingRequestIdRef.current++;
      setSchedulingResult(null);
      return;
    }
    if (!selectedStyle?.styleNo || totalOrderQuantity <= 0) {
      return;
    }
    if (schedulingTimerRef.current) {
      window.clearTimeout(schedulingTimerRef.current);
    }
    schedulingTimerRef.current = window.setTimeout(() => {
      void fetchSchedulingSuggestion();
    }, 500);
    return () => {
      if (schedulingTimerRef.current) {
        window.clearTimeout(schedulingTimerRef.current);
        schedulingTimerRef.current = null;
      }
    };
  }, [visible, selectedStyle?.styleNo, totalOrderQuantity, fetchSchedulingSuggestion]);

  // 报价参考自动获取
  useEffect(() => {
    if (!visible || !selectedStyle?.styleNo) {
      setQuoteReference(null);
      return;
    }
    // 提取原始值避免 selectedStyle 整体引用触发重复拉取
    const styleNo = selectedStyle.styleNo;
    const styleId = selectedStyle?.id;
    const styleTotalCost = Number((selectedStyle as any)?.totalCost) || 0;
    const styleTotalPrice = Number((selectedStyle as any)?.totalPrice) || 0;
    const stylePrice = Number(selectedStyle?.price) || 0;

    let cancelled = false;
    Promise.all([
      intelligenceApi.getStyleQuoteSuggestion(styleNo).catch(() => null),
      styleId ? api.get(`/style/quotation?styleId=${styleId}`).catch(() => null) : Promise.resolve(null),
    ]).then(([quoteSuggestionRes, quotationRes]: any[]) => {
      if (cancelled) return;
      const suggestion = quoteSuggestionRes?.data || {};
      const quotation = quotationRes?.data || {};
      const derivedQuotationTotalCost = Number(quotation?.totalCost)
        || (Number(quotation?.materialCost || 0) + Number(quotation?.processCost || 0) + Number(quotation?.otherCost || 0))
        || 0;
      const fallbackTotalCost = Number(suggestion?.totalCost)
        || derivedQuotationTotalCost
        || styleTotalCost
        || 0;
      const fallbackQuotationPrice = Number(quotation?.totalPrice)
        || Number(suggestion?.currentQuotation)
        || styleTotalPrice
        || stylePrice
        || 0;
      setQuoteReference({
        currentQuotation: fallbackQuotationPrice,
        totalCost: fallbackTotalCost,
        suggestedPrice: Number(suggestion?.suggestedPrice) || 0,
      });
    }).catch(() => {
      if (!cancelled) setQuoteReference(null);
    });
    return () => {
      cancelled = true;
    };
  // 依赖 styleNo/id 而非 selectedStyle 整体引用，避免 setState 创建新引用导致重复拉取
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedStyle?.id, selectedStyle?.styleNo]);

  // 定价相关计算
  const processBasedUnitPrice = useMemo(() => {
    const total = progressNodes.reduce((sum, node) => {
      const nodeTotal = (Array.isArray(node.processes) ? node.processes : []).reduce((nodeSum, process) => {
        return nodeSum + (Number(process?.unitPrice) || 0);
      }, 0);
      return sum + nodeTotal;
    }, 0);
    return Number(total.toFixed(2));
  }, [progressNodes]);

  const sizePriceBySize = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of sizePriceRows) {
      const sizeKey = normalizeSizeKey(row.size);
      if (!sizeKey) continue;
      grouped.set(sizeKey, (grouped.get(sizeKey) || 0) + (Number(row.price) || 0));
    }
    return grouped;
  }, [normalizeSizeKey, sizePriceRows]);

  const sizeBasedUnitPrice = useMemo(() => {
    const effectiveLines = orderLines.filter((line) => (Number(line.quantity) || 0) > 0);
    const totalQty = effectiveLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    if (!totalQty) return 0;
    const totalAmount = effectiveLines.reduce((sum, line) => {
      const lineQty = Number(line.quantity) || 0;
      const linePrice = sizePriceBySize.get(normalizeSizeKey(line.size)) || 0;
      return sum + (linePrice * lineQty);
    }, 0);
    return Number((totalAmount / totalQty).toFixed(2));
  }, [normalizeSizeKey, orderLines, sizePriceBySize]);

  const resolvedOrderUnitPrice = useMemo(() => {
    if (watchedPricingMode === 'MANUAL') {
      return Number(watchedManualOrderUnitPrice.toFixed(2));
    }
    if (watchedPricingMode === 'COST') {
      return Number(totalCostUnitPrice.toFixed(2));
    }
    if (watchedPricingMode === 'QUOTE') {
      return Number(quotationUnitPrice.toFixed(2));
    }
    if (watchedPricingMode === 'SIZE') {
      return Number(sizeBasedUnitPrice.toFixed(2));
    }
    return Number(processBasedUnitPrice.toFixed(2));
  }, [processBasedUnitPrice, quotationUnitPrice, sizeBasedUnitPrice, totalCostUnitPrice, watchedManualOrderUnitPrice, watchedPricingMode]);

  // 订单学习推荐（防抖250ms）
  const lastOrderLearningRequestKeyRef = useRef('');

  useEffect(() => {
    if (!visible || !selectedStyle?.styleNo) {
      lastOrderLearningRequestKeyRef.current = '';
      setOrderLearningRecommendation(null);
      return;
    }
    const requestKey = JSON.stringify({
      styleNo: selectedStyle.styleNo,
      orderQuantity: totalOrderQuantity || null,
      factoryMode: factoryMode || null,
      pricingMode: watchedPricingMode || null,
      currentUnitPrice: resolvedOrderUnitPrice || null,
    });
    if (lastOrderLearningRequestKeyRef.current === requestKey) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      lastOrderLearningRequestKeyRef.current = requestKey;
      setOrderLearningLoading(true);
      orderLearningApi.getRecommendation({
        styleNo: selectedStyle.styleNo,
        orderQuantity: totalOrderQuantity || undefined,
        factoryMode,
        pricingMode: watchedPricingMode,
        currentUnitPrice: resolvedOrderUnitPrice || undefined,
      }).then((res: any) => {
        if (!cancelled) {
          setOrderLearningRecommendation(res?.data || null);
        }
      }).catch(() => {
        if (!cancelled) {
          setOrderLearningRecommendation(null);
        }
      }).finally(() => {
        if (!cancelled) {
          setOrderLearningLoading(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [visible, selectedStyle?.styleNo, totalOrderQuantity, factoryMode, watchedPricingMode, resolvedOrderUnitPrice]);

  const preferredPricingMode = useMemo<'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL'>(() => {
    if (factoryMode === 'EXTERNAL' && totalCostUnitPrice > 0) {
      return 'COST';
    }
    if (processBasedUnitPrice > 0) {
      return 'PROCESS';
    }
    if (quotationUnitPrice > 0) {
      return 'QUOTE';
    }
    if (totalCostUnitPrice > 0) {
      return 'COST';
    }
    if (sizeBasedUnitPrice > 0) {
      return 'SIZE';
    }
    return 'MANUAL';
  }, [factoryMode, processBasedUnitPrice, quotationUnitPrice, sizeBasedUnitPrice, totalCostUnitPrice]);

  // 自动设置定价模式
  useEffect(() => {
    if (!visible || pricingModeTouched) {
      return;
    }
    form.setFieldValue('pricingMode', preferredPricingMode);
  }, [form, preferredPricingMode, pricingModeTouched, visible]);

  const schedulingPlans = schedulingResult?.plans || [];

  // 工厂或数量变化时自动重新计算交货期建议
  // 依赖 selectedFactoryStat 整体（对象引用变即用户切换了工厂选择）+ factoryMode（切换内外模式即使同名也刷新）
  useEffect(() => {
    if (!visible) {
      // 弹窗关闭时清空交期建议，避免下次打开残留旧数据
      deliveryRequestIdRef.current++;
      setDeliverySuggestion(null);
      return;
    }
    if (!selectedFactoryStat || !totalOrderQuantity) {
      setDeliverySuggestion(null);
      return;
    }
    fetchDeliverySuggestion(selectedFactoryStat.factoryName, totalOrderQuantity);
  }, [visible, selectedFactoryStat, totalOrderQuantity, factoryMode, fetchDeliverySuggestion]);

  const resetIntelligence = useCallback(() => {
    setSchedulingResult(null);
    setDeliverySuggestion(null);
    setQuoteReference(null);
    setOrderLearningRecommendation(null);
    lastOrderLearningRequestKeyRef.current = '';
  }, []);

  return {
    deliverySuggestion, suggestionLoading,
    quoteReference, quotationUnitPrice, totalCostUnitPrice, suggestedQuotationUnitPrice,
    orderLearningLoading, orderLearningRecommendation,
    schedulingResult, schedulingLoading, setSchedulingResult,
    processBasedUnitPrice, sizePriceBySize, sizeBasedUnitPrice, resolvedOrderUnitPrice,
    preferredPricingMode, schedulingPlans,
    fetchDeliverySuggestion,
    resetIntelligence,
  };
}
