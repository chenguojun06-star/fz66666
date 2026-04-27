import { useState, useCallback } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { useModal } from '@/hooks';
import type { FinishedInventory, SKUDetail } from '../finishedInventoryColumns';

export const useFinishedInventoryActions = (rawDataSource: FinishedInventory[], loadData: () => Promise<void>) => {
  const { message } = App.useApp();
  const outboundModal = useModal<FinishedInventory>();
  const inboundHistoryModal = useModal<FinishedInventory>();
  const [skuDetails, setSkuDetails] = useState<SKUDetail[]>([]);
  const [inboundHistory, setInboundHistory] = useState<any[]>([]);
  const [outstockTotal, setOutstockTotal] = useState(0);
  const [outboundProductionOrderNo, setOutboundProductionOrderNo] = useState('');
  const [outboundTrackingNo, setOutboundTrackingNo] = useState('');
  const [outboundExpressCompany, setOutboundExpressCompany] = useState('');
  const [outboundCustomerName, setOutboundCustomerName] = useState('');
  const [outboundCustomerPhone, setOutboundCustomerPhone] = useState('');
  const [outboundShippingAddress, setOutboundShippingAddress] = useState('');

  const handleOutbound = useCallback((record: FinishedInventory) => {
    const styleSKUs: SKUDetail[] = rawDataSource.filter(item => item.styleNo === record.styleNo).flatMap(item => {
      const colors = (item.color || '').includes(',') ? (item.color || '').split(',').map(c => c.trim()).filter(Boolean) : [item.color || ''];
      const sizes = (item.size || '').includes(',') ? (item.size || '').split(',').map(s => s.trim()).filter(Boolean) : [item.size || ''];
      return colors.flatMap(color => sizes.map(size => ({ color, size, sku: `${item.styleNo}-${color}-${size}`, availableQty: item.availableQty ?? 0, lockedQty: item.lockedQty ?? 0, defectQty: item.defectQty ?? 0, warehouseLocation: item.warehouseLocation || '-', costPrice: item.costPrice, salesPrice: item.salesPrice })));
    });
    setSkuDetails(styleSKUs.length > 0 ? styleSKUs : [{ color: record.color || '', size: record.size || '', sku: record.sku || `${record.styleNo}-${record.color}-${record.size}`, availableQty: record.availableQty ?? 0, lockedQty: record.lockedQty ?? 0, defectQty: record.defectQty ?? 0, warehouseLocation: record.warehouseLocation || '-', costPrice: record.costPrice, salesPrice: record.salesPrice }]);
    setOutboundProductionOrderNo(''); setOutboundTrackingNo(''); setOutboundExpressCompany('');
    setOutboundCustomerName(''); setOutboundCustomerPhone(''); setOutboundShippingAddress('');
    outboundModal.open(record);
  }, [rawDataSource, outboundModal]);

  const handleSKUQtyChange = useCallback((index: number, value: number | null) => {
    setSkuDetails(prev => { const newDetails = [...prev]; newDetails[index].outboundQty = value || 0; return newDetails; });
  }, []);

  const handleOutboundConfirm = useCallback(async () => {
    if (!outboundCustomerName.trim()) { message.warning('请填写客户名称，出库必须选择客户'); return; }
    const selectedItems = skuDetails.filter(item => (item.outboundQty || 0) > 0);
    if (selectedItems.length === 0) { message.warning('请至少输入一个SKU的出库数量'); return; }
    const invalidItems = selectedItems.filter(item => (item.outboundQty || 0) > item.availableQty);
    if (invalidItems.length > 0) { message.error(`${invalidItems[0].sku} 的出库数量超过可用库存`); return; }
    try {
      const outboundItems = skuDetails.filter(item => (item.outboundQty ?? 0) > 0).map(item => ({ sku: item.sku, quantity: item.outboundQty }));
      if (outboundItems.length === 0) { message.warning('请至少填写一个SKU的出库数量'); return; }
      await api.post('/warehouse/finished-inventory/outbound', {
        items: outboundItems,
        ...(outboundModal.data?.orderId ? { orderId: outboundModal.data.orderId } : {}),
        ...(outboundModal.data?.orderNo ? { orderNo: outboundModal.data.orderNo } : {}),
        ...(outboundModal.data?.styleId ? { styleId: outboundModal.data.styleId } : {}),
        ...(outboundModal.data?.styleNo ? { styleNo: outboundModal.data.styleNo } : {}),
        ...(outboundModal.data?.styleName ? { styleName: outboundModal.data.styleName } : {}),
        ...(outboundModal.data?.warehouseLocation ? { warehouseLocation: outboundModal.data.warehouseLocation } : {}),
        ...(outboundProductionOrderNo ? { productionOrderNo: outboundProductionOrderNo } : {}),
        ...(outboundTrackingNo ? { trackingNo: outboundTrackingNo } : {}),
        ...(outboundExpressCompany ? { expressCompany: outboundExpressCompany } : {}),
        customerName: outboundCustomerName.trim(),
        ...(outboundCustomerPhone ? { customerPhone: outboundCustomerPhone } : {}),
        ...(outboundShippingAddress ? { shippingAddress: outboundShippingAddress } : {}),
      });
      message.success(`出库成功，共 ${outboundItems.length} 个SKU已出库`);
      outboundModal.close();
      setOutboundProductionOrderNo(''); setOutboundTrackingNo(''); setOutboundExpressCompany('');
      setOutboundCustomerName(''); setOutboundCustomerPhone(''); setOutboundShippingAddress('');
      setSkuDetails([]);
      loadData();
    } catch (error: unknown) { message.error(error instanceof Error ? error.message : '出库失败，请重试'); }
  }, [skuDetails, outboundModal, outboundProductionOrderNo, outboundTrackingNo, outboundExpressCompany, outboundCustomerName, outboundCustomerPhone, outboundShippingAddress, message, loadData]);

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
          inboundDate: String(item.warehousingEndTime || item.createTime || '-'), qualityInspectionNo: String(item.warehousingNo || '-'),
          cuttingBundleNo: String(item.cuttingBundleNo || '-'), color: String(item.color || '-'), size: String(item.size || '-'),
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
    } catch { setOutstockTotal(0); }
    inboundHistoryModal.open(record);
  }, [message, inboundHistoryModal]);

  return {
    outboundModal, inboundHistoryModal, skuDetails, inboundHistory, outstockTotal,
    outboundProductionOrderNo, setOutboundProductionOrderNo, outboundTrackingNo, setOutboundTrackingNo,
    outboundExpressCompany, setOutboundExpressCompany, outboundCustomerName, setOutboundCustomerName,
    outboundCustomerPhone, setOutboundCustomerPhone, outboundShippingAddress, setOutboundShippingAddress,
    handleOutbound, handleSKUQtyChange, handleOutboundConfirm, handleViewInboundHistory,
  };
};
