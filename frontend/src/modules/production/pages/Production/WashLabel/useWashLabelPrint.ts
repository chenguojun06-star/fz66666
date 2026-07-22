import { useCallback, useState } from 'react';
import { App } from 'antd';
import type { ProductionOrder } from '@/types/production';
import type { WashLabelItem } from './components/WashLabelBatchPrintModal';
import { getOrderLines, genUCode, type StyleLabelCache } from './utils';

interface UseWashLabelPrintOptions {
  orders: ProductionOrder[];
  styleCache: React.MutableRefObject<StyleLabelCache>;
  fetchStyleInfoForOrders: (list: ProductionOrder[]) => Promise<void>;
  getUCode: (order: ProductionOrder) => string;
}

export function useWashLabelPrint({
  orders,
  styleCache,
  fetchStyleInfoForOrders,
  getUCode,
}: UseWashLabelPrintOptions) {
  const { message } = App.useApp();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [batchPrintItems, setBatchPrintItems] = useState<WashLabelItem[]>([]);
  const [batchPrintLoading, setBatchPrintLoading] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

  const buildPrintItems = useCallback(async (targetOrders: ProductionOrder[]): Promise<WashLabelItem[]> => {
    await fetchStyleInfoForOrders(targetOrders);
    return targetOrders.flatMap(o => {
      const cached = styleCache.current[o.styleId] ?? {};
      const lines = getOrderLines(o);
      const fallbackLine = lines.length ? lines : [{ color: o.color, size: o.size, quantity: o.orderQuantity }];
      return fallbackLine.map((line) => ({
        orderNo: o.orderNo,
        styleNo: o.styleNo,
        styleName: o.styleName,
        color: String(line?.color || o.color || '').trim(),
        size: String(line?.size || o.size || '').trim(),
        fabricComposition: cached.fabricComposition,
        fabricCompositionParts: cached.fabricCompositionParts,
        washInstructions: cached.washInstructions,
        uCode: cached.uCode || (lines.length <= 1 ? getUCode(o) : genUCode(o, line)),
        washTempCode: cached.washTempCode,
        bleachCode: cached.bleachCode,
        tumbleDryCode: cached.tumbleDryCode,
        ironCode: cached.ironCode,
        dryCleanCode: cached.dryCleanCode,
      }));
    });
  }, [fetchStyleInfoForOrders, getUCode, styleCache]);

  const openBatchPrint = useCallback(async (targetOrders: ProductionOrder[]) => {
    setBatchPrintLoading(true);
    if (targetOrders.length === 1 && targetOrders[0].id) setPrintingOrderId(targetOrders[0].id);
    setBatchPrintOpen(true);
    try {
      const items = await buildPrintItems(targetOrders);
      setBatchPrintItems(items);
    } finally {
      setBatchPrintLoading(false);
      setPrintingOrderId(null);
    }
  }, [buildPrintItems]);

  const handleBatchPrint = useCallback(async () => {
    const selected = orders.filter(o => o.id && selectedRowKeys.includes(o.id));
    if (!selected.length) { message.warning('请先勾选要打印的订单'); return; }
    await openBatchPrint(selected);
  }, [orders, selectedRowKeys, openBatchPrint, message]);

  const closeBatchPrint = useCallback(() => {
    setBatchPrintOpen(false);
    setBatchPrintItems([]);
  }, []);

  return {
    selectedRowKeys,
    setSelectedRowKeys,
    batchPrintOpen,
    batchPrintItems,
    batchPrintLoading,
    printingOrderId,
    openBatchPrint,
    handleBatchPrint,
    closeBatchPrint,
  };
}
