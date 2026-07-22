import { useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import type { LocationSkuItem, OutboundItem } from './types';
import {
  buildOutboundItems,
  generateOutboundTraceId,
  validateOutboundSelection,
  getSelectedOutboundItems,
} from './warehouseLocationHelpers';

interface UseWarehouseOutboundOptions {
  locationItems: LocationSkuItem[];
  selectedLocation: { locationCode: string; areaId: string } | null;
  handleLocationClick: (loc: any) => void;
  selectedAreaId: string;
  loadLocations: (areaId: string) => void;
  loadOverview: () => void;
}

export const useWarehouseOutbound = (options: UseWarehouseOutboundOptions) => {
  const { message } = App.useApp();
  const {
    locationItems,
    selectedLocation,
    handleLocationClick,
    selectedAreaId,
    loadLocations,
    loadOverview,
  } = options;

  const [outboundModalOpen, setOutboundModalOpen] = useState(false);
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [outboundItems, setOutboundItems] = useState<OutboundItem[]>([]);
  const [outboundCustomerName, setOutboundCustomerName] = useState('');
  const [outboundCustomerPhone, setOutboundCustomerPhone] = useState('');
  const [outboundShippingAddress, setOutboundShippingAddress] = useState('');
  const [outstockType, setOutstockType] = useState<string>('sales');
  const [outboundRemark, setOutboundRemark] = useState('');

  const handleOpenOutbound = () => {
    setOutboundItems(buildOutboundItems(locationItems));
    setOutboundCustomerName('');
    setOutboundCustomerPhone('');
    setOutboundShippingAddress('');
    setOutstockType('sales');
    setOutboundRemark('');
    setOutboundModalOpen(true);
  };

  const handleDoOutbound = async () => {
    const error = validateOutboundSelection(outboundItems);
    if (error) {
      message.warning(error);
      return;
    }
    const selectedItems = getSelectedOutboundItems(outboundItems);
    setOutboundLoading(true);
    try {
      const traceId = generateOutboundTraceId();
      for (const item of selectedItems) {
        const finalPrice = item.adjustedPrice ?? item.salesPrice;
        await api.post('/warehouse/finished-inventory/free-outbound', {
          skuCode: item.skuCode,
          quantity: item.outboundQty,
          warehouseLocation: selectedLocation?.locationCode,
          warehouseAreaId: selectedLocation?.areaId,
          outstockType: outstockType || 'sales',
          customerName: outboundCustomerName || undefined,
          customerPhone: outboundCustomerPhone || undefined,
          shippingAddress: outboundShippingAddress || undefined,
          salesPrice: finalPrice,
          originalSalesPrice: item.salesPrice,
          priceAdjustmentReason: finalPrice !== item.salesPrice ? '手动调整' : undefined,
          traceId,
          remark: outboundRemark || undefined,
        });
      }
      message.success(`出库成功，共 ${selectedItems.length} 项`);
      setOutboundModalOpen(false);
      if (selectedLocation) handleLocationClick(selectedLocation);
      loadLocations(selectedAreaId);
      loadOverview();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '出库失败');
    } finally {
      setOutboundLoading(false);
    }
  };

  return {
    outboundModalOpen,
    outboundLoading,
    outboundItems,
    outboundCustomerName,
    outboundCustomerPhone,
    outboundShippingAddress,
    outstockType,
    outboundRemark,
    setOutboundModalOpen,
    setOutboundItems,
    setOutboundCustomerName,
    setOutboundCustomerPhone,
    setOutboundShippingAddress,
    setOutstockType,
    setOutboundRemark,
    handleOpenOutbound,
    handleDoOutbound,
  };
};
