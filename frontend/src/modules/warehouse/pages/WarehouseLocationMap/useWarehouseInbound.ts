import { useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';

interface UseWarehouseInboundOptions {
  selectedLocation: { locationCode: string } | null;
  handleLocationClick: (loc: any) => void;
  selectedAreaId: string;
  loadLocations: (areaId: string) => void;
  loadOverview: () => void;
}

export const useWarehouseInbound = (options: UseWarehouseInboundOptions) => {
  const { message } = App.useApp();
  const { user } = useUser();
  const { selectedLocation, handleLocationClick, selectedAreaId, loadLocations, loadOverview } = options;

  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [inboundForm] = Form.useForm();
  const [inboundLoading, setInboundLoading] = useState(false);

  const handleOpenInbound = () => {
    inboundForm.resetFields();
    inboundForm.setFieldsValue({ warehouseLocation: selectedLocation?.locationCode || '' });
    setInboundModalOpen(true);
  };

  const handleDoInbound = async () => {
    try {
      const values = await inboundForm.validateFields();
      setInboundLoading(true);
      const operatorId = String(user?.id || '').trim();
      const operatorName = String(user?.name || user?.username || '').trim();
      const res = await api.post('/production/material/inbound/manual', {
        materialCode: values.materialCode,
        materialName: values.materialName,
        materialType: values.materialType || 'fabricA',
        color: values.color || '',
        size: values.size || '',
        quantity: values.quantity,
        warehouseLocation: values.warehouseLocation || selectedLocation?.locationCode || '',
        supplierName: values.supplierName || '',
        operatorId,
        operatorName,
        remark: values.remark || '',
      });
      if ((res as any)?.code === 200) {
        message.success('入库成功');
        setInboundModalOpen(false);
        inboundForm.resetFields();
        if (selectedLocation) handleLocationClick(selectedLocation);
        loadLocations(selectedAreaId);
        loadOverview();
      } else {
        message.error((res as any)?.message || '入库失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '入库失败');
    } finally {
      setInboundLoading(false);
    }
  };

  return {
    inboundModalOpen,
    inboundForm,
    inboundLoading,
    setInboundModalOpen,
    handleOpenInbound,
    handleDoInbound,
  };
};
