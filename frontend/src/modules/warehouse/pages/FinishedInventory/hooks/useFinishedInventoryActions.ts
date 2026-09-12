import { useState, useCallback, useRef } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { useModal } from '@/hooks';
import type { FinishedInventory, SKUDetail } from '../finishedInventoryColumns';

export type OutboundType = 'sales' | 'free' | 'transfer' | 'scrap';

export const useFinishedInventoryActions = (
  rawDataSource: FinishedInventory[],
  loadData: () => Promise<void>,
  options?: { directShip?: boolean },
) => {
  const directShipMode = Boolean(options?.directShip);
  const { message } = App.useApp();
  const outboundModal = useModal<FinishedInventory>();
  const inboundHistoryModal = useModal<FinishedInventory>();
  const [skuDetails, setSkuDetails] = useState<SKUDetail[]>([]);
  const [inboundHistory, setInboundHistory] = useState<any[]>([]);
  const [outstockTotal, setOutstockTotal] = useState(0);
  const [outboundType, setOutboundType] = useState<OutboundType>('sales');
  const [outboundReason, setOutboundReason] = useState('');
  const [outboundProductionOrderNo, setOutboundProductionOrderNo] = useState('');
  const [outboundTrackingNo, setOutboundTrackingNo] = useState('');
  const [outboundExpressCompany, setOutboundExpressCompany] = useState('');
  const [outboundCustomerName, setOutboundCustomerName] = useState('');
  const [outboundCustomerPhone, setOutboundCustomerPhone] = useState('');
  const [outboundShippingAddress, setOutboundShippingAddress] = useState('');
  const [outboundSubmitting, setOutboundSubmitting] = useState(false);
  const outboundSubmittingRef = useRef(false);

  const handleOutbound = useCallback((record: FinishedInventory) => {
    // D-226：直接用后端返回的真实 SKU 行（每行 sku 即完整商品编码，库存/价格也是该编码自己的），
    // 不再用颜色×尺码笛卡尔积拼假编码（旧逻辑把整款总量错标到每个码上，且编码格式与真实编码不一致）
    const styleSKUs: SKUDetail[] = rawDataSource
      .filter(item => item.styleNo === record.styleNo && (item.sku || item.id))
      .map(item => ({
        color: item.color || '',
        size: item.size || '',
        sku: item.sku || item.id || '',
        styleNo: item.styleNo || record.styleNo || '',
        styleName: item.styleName || record.styleName || '',
        availableQty: item.availableQty ?? 0,
        lockedQty: item.lockedQty ?? 0,
        defectQty: item.defectQty ?? 0,
        warehouseLocation: item.warehouseLocation || '-',
        costPrice: item.costPrice,
        salesPrice: item.salesPrice,
        inProductionQty: item.inProductionQty,
        pendingSalesQty: item.pendingSalesQty,
      }));
    setSkuDetails(styleSKUs.length > 0 ? styleSKUs : [{ color: record.color || '', size: record.size || '', sku: record.sku || record.id || '', styleNo: record.styleNo || '', styleName: record.styleName || '', availableQty: record.availableQty ?? 0, lockedQty: record.lockedQty ?? 0, defectQty: record.defectQty ?? 0, warehouseLocation: record.warehouseLocation || '-', costPrice: record.costPrice, salesPrice: record.salesPrice }]);
    setOutboundType('sales'); setOutboundReason('');
    setOutboundProductionOrderNo(''); setOutboundTrackingNo(''); setOutboundExpressCompany('');
    setOutboundCustomerName(''); setOutboundCustomerPhone(''); setOutboundShippingAddress('');
    outboundModal.open(record);
  }, [rawDataSource, outboundModal]);

  // D-363i：多款混出购物车——加款不限当前页，直接吃远程搜索返回的该款 SKU 行
  //（添加后可继续搜索加下一个款；表格只显示已添加进清单的款）
  const handleAddStyleRows = useCallback((rows: FinishedInventory[]) => {
    if (directShipMode) {
      message.warning('直发模式仅支持单款出库');
      return;
    }
    if (!rows || rows.length === 0) {
      message.warning('该款没有可出库的商品编码');
      return;
    }
    const target = String(rows[0].styleNo || '');
    setSkuDetails(prev => {
      if (prev.some(item => item.styleNo === target)) {
        message.warning(`款 ${target} 已在出库清单里`);
        return prev;
      }
      const styleSKUs: SKUDetail[] = rows
        .filter(item => (item.sku || item.id))
        .map(item => ({
          color: item.color || '',
          size: item.size || '',
          sku: item.sku || item.id || '',
          styleNo: item.styleNo || target,
          styleName: item.styleName || rows[0].styleName || '',
          availableQty: item.availableQty ?? 0,
          lockedQty: item.lockedQty ?? 0,
          defectQty: item.defectQty ?? 0,
          warehouseLocation: item.warehouseLocation || '-',
          costPrice: item.costPrice,
          salesPrice: item.salesPrice,
          inProductionQty: item.inProductionQty,
          pendingSalesQty: item.pendingSalesQty,
        }));
      if (styleSKUs.length === 0) {
        message.warning(`款 ${target} 没有可出库的商品编码`);
        return prev;
      }
      message.success(`已添加款 ${target}（${styleSKUs.length} 个商品编码），可继续搜索添加下一个款`);
      return [...prev, ...styleSKUs];
    });
  }, [directShipMode, message]);

  const handleRemoveStyleFromCart = useCallback((styleNo: string) => {
    setSkuDetails(prev => prev.filter(item => item.styleNo !== styleNo));
  }, []);

  const handleSKUQtyChange = useCallback((index: number, value: number | null) => {
    setSkuDetails(prev => { const newDetails = [...prev]; newDetails[index].outboundQty = value || 0; return newDetails; });
  }, []);

  const handleSKUSalesPriceChange = useCallback((index: number, value: number | null) => {
    setSkuDetails(prev => {
      const newDetails = [...prev];
      const item = { ...newDetails[index] };
      // 记录原始价格（仅第一次修改时）
      if (item.originalSalesPrice == null && item.salesPrice != null) {
        item.originalSalesPrice = item.salesPrice;
      }
      item.salesPrice = value ?? 0;
      newDetails[index] = item;
      return newDetails;
    });
  }, []);

  const handleSKUPriceReasonChange = useCallback((index: number, value: string) => {
    setSkuDetails(prev => { const newDetails = [...prev]; newDetails[index] = { ...newDetails[index], priceAdjustmentReason: value }; return newDetails; });
  }, []);

  const handleOutboundConfirm = useCallback(async () => {
    if (outboundSubmittingRef.current) return;
    if (outboundType === 'sales' && !outboundCustomerName.trim()) { message.warning('销售出库请填写客户名称'); return; }
    if (outboundType === 'scrap' && !outboundReason.trim()) { message.warning('请填写报废原因'); return; }
    const selectedItems = skuDetails.filter(item => (item.outboundQty || 0) > 0);
    if (selectedItems.length === 0) { message.warning('请至少输入一个商品编码的出库数量'); return; }
    // D-360k：质检直发模式不校验可用库存（不落成品库存直接发客户）
    if (!directShipMode) {
      const invalidItems = selectedItems.filter(item => (item.outboundQty || 0) > item.availableQty);
      if (invalidItems.length > 0) { message.error(`${invalidItems[0].sku} 的出库数量超过可用库存`); return; }
    }
    outboundSubmittingRef.current = true;
    setOutboundSubmitting(true);
    try {
      const outboundItems = skuDetails.filter(item => (item.outboundQty ?? 0) > 0).map(item => {
        const result: Record<string, unknown> = { sku: item.sku, quantity: item.outboundQty };
        if (item.originalSalesPrice != null && item.salesPrice !== item.originalSalesPrice) {
          result.salesPrice = item.salesPrice;
          result.priceAdjustmentReason = item.priceAdjustmentReason || '';
        }
        return result;
      });
      if (outboundItems.length === 0) { message.warning('请至少填写一个商品编码的出库数量'); return; }
      const multiStyle = new Set(skuDetails.map(item => item.styleNo).filter(Boolean)).size > 1;
      await api.post('/warehouse/finished-inventory/outbound', {
        outboundType,
        ...(directShipMode ? { directShip: true } : {}),
        ...(outboundReason.trim() ? { outboundReason: outboundReason.trim() } : {}),
        items: outboundItems,
        // D-363i：多款混单不挂单一订单/款（订单字段只在单款出库时随单）
        ...(!multiStyle && outboundModal.data?.orderId ? { orderId: outboundModal.data.orderId } : {}),
        ...(!multiStyle && outboundModal.data?.orderNo ? { orderNo: outboundModal.data.orderNo } : {}),
        ...(!multiStyle && outboundModal.data?.styleId ? { styleId: outboundModal.data.styleId } : {}),
        ...(!multiStyle && outboundModal.data?.styleNo ? { styleNo: outboundModal.data.styleNo } : {}),
        ...(outboundModal.data?.styleName ? { styleName: outboundModal.data.styleName } : {}),
        ...(outboundModal.data?.warehouseLocation ? { warehouseLocation: outboundModal.data.warehouseLocation } : {}),
        ...(outboundProductionOrderNo ? { productionOrderNo: outboundProductionOrderNo } : {}),
        ...(outboundTrackingNo ? { trackingNo: outboundTrackingNo } : {}),
        ...(outboundExpressCompany ? { expressCompany: outboundExpressCompany } : {}),
        ...(outboundType === 'sales' ? { customerName: outboundCustomerName.trim() } : {}),
        ...(outboundCustomerPhone ? { customerPhone: outboundCustomerPhone } : {}),
        ...(outboundShippingAddress ? { shippingAddress: outboundShippingAddress } : {}),
      });
      message.success(`出库成功，共 ${outboundItems.length} 个商品编码已出库`);
      try {
        window.dispatchEvent(new Event('data:changed'));
      } catch (_e) {
        // 事件派发失败不影响业务
      }
      outboundModal.close();
      setOutboundProductionOrderNo(''); setOutboundTrackingNo(''); setOutboundExpressCompany('');
      setOutboundCustomerName(''); setOutboundCustomerPhone(''); setOutboundShippingAddress('');
      setSkuDetails([]);
      loadData();
    } catch (error: unknown) { message.error(error instanceof Error ? error.message : '出库失败，请重试'); }
    finally {
      setOutboundSubmitting(false);
      outboundSubmittingRef.current = false;
    }
  }, [skuDetails, outboundModal, outboundType, outboundReason, outboundProductionOrderNo, outboundTrackingNo, outboundExpressCompany, outboundCustomerName, outboundCustomerPhone, outboundShippingAddress, message, loadData, directShipMode]);

  const handleViewInboundHistory = useCallback(async (record: FinishedInventory) => {
    try {
      const params = new URLSearchParams();
      if (record.styleNo) params.append('styleNo', record.styleNo);
      params.append('page', '1'); params.append('pageSize', '500');
      const res = await api.get(`/production/warehousing/list?${params.toString()}`);
      if (res.code === 200 && res.data?.records?.length > 0) {
        const fallbackOperator = record.lastInboundBy || '-';
        const fallbackWarehouse = record.warehouseLocation || '-';
        const rows = (res.data.records as Record<string, unknown>[]).map(item => ({
          id: String(item.id), styleNo: String((item.styleNo as string) || record.styleNo || '-'), orderNo: String(item.orderNo || '-'),
          factoryName: String(item.factoryName || '-'),
          inboundDate: String(item.warehousingEndTime || item.createTime || '-'), qualityInspectionNo: String(item.warehousingNo || '-'),
          cuttingBundleNo: String(item.cuttingBundleNo || '-'), color: String(item.color || '-'), size: String(item.size || '-'),
          skuCode: String(item.skuCode || '-'),
          quantity: Number((item.warehousingQuantity as number) ?? (item.qualifiedQuantity as number) ?? 0),
          operator: String(item.warehousingOperatorName || item.qualityOperatorName || item.receiverName || fallbackOperator),
          warehouseLocation: String(item.warehouse || item.warehouseLocation || fallbackWarehouse),
        }));
        setInboundHistory(rows);
      } else { setInboundHistory([]); }
    } catch { message.error('加载入库记录失败'); setInboundHistory([]); }
    try {
      const outstockRes = await api.post('/warehouse/finished-inventory/outstock-records', { page: 1, pageSize: 500, keyword: record.styleNo || undefined });
      const outstockData = outstockRes.data || outstockRes;
      const rows: Array<{ outstockQuantity?: number; styleNo?: string }> = outstockData.records || [];
      const total = rows.filter(r => !record.styleNo || r.styleNo === record.styleNo).reduce((s, r) => s + (r.outstockQuantity || 0), 0);
      setOutstockTotal(total);
    } catch (err) { console.error('加载出库总数失败:', err); setOutstockTotal(0); }
    inboundHistoryModal.open(record);
  }, [message, inboundHistoryModal]);

  return {
    outboundModal, inboundHistoryModal, skuDetails, inboundHistory, outstockTotal,
    outboundType, setOutboundType, outboundReason, setOutboundReason,
    outboundProductionOrderNo, setOutboundProductionOrderNo, outboundTrackingNo, setOutboundTrackingNo,
    outboundExpressCompany, setOutboundExpressCompany, outboundCustomerName, setOutboundCustomerName,
    outboundCustomerPhone, setOutboundCustomerPhone, outboundShippingAddress, setOutboundShippingAddress,
    outboundSubmitting,
    handleOutbound, handleSKUQtyChange, handleSKUSalesPriceChange, handleSKUPriceReasonChange, handleOutboundConfirm, handleViewInboundHistory,
    handleAddStyleRows, handleRemoveStyleFromCart,
  };
};
