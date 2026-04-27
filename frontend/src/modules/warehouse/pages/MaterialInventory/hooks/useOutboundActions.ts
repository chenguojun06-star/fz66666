import dayjs from 'dayjs';
import { useModal } from '@/hooks';
import { useState } from 'react';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import { message } from '@/utils/antdStatic';
import type { FormInstance } from 'antd';
import type { MaterialInventory } from '../types';
import type { MaterialOutboundPrintPayload } from '../components/MaterialOutboundPrintModal';
import type { OutboundFactoryOption, OutboundOrderOption } from './outboundMatchHelper';
import { MaterialBatchDetail } from './outboundMatchHelper';

export type { MaterialBatchDetail } from './outboundMatchHelper';

interface OutboundActionsDeps {
  user?: { name?: string; username?: string; id?: string } | null;
  outboundForm: FormInstance;
  factoryOptions: OutboundFactoryOption[];
  loadFactories: () => Promise<void>;
  setOutboundOrderOptions: (opts: OutboundOrderOption[]) => void;
  autoMatchOutboundContext: (record: MaterialInventory, extra?: { receiverId?: string; receiverName?: string; factoryName?: string; factoryType?: string; }) => Promise<void>;
  fetchData: () => void;
  openPrintModal: (payload: MaterialOutboundPrintPayload) => void;
  receiverOptions: any[];
  loadReceivers: () => void;
}

export function useOutboundActions({
  user, outboundForm, factoryOptions, loadFactories, setOutboundOrderOptions,
  autoMatchOutboundContext, fetchData, openPrintModal, receiverOptions, loadReceivers,
}: OutboundActionsDeps) {
  const outboundModal = useModal<MaterialInventory>();
  const [batchDetails, setBatchDetails] = useState<MaterialBatchDetail[]>([]);

  const buildManualOutboundPrintPayload = (
    record: MaterialInventory, values: Record<string, any>, outboundNo: string,
  ): MaterialOutboundPrintPayload => ({
    outboundNo, outboundTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    materialCode: record.materialCode, materialName: record.materialName,
    materialType: record.materialType, specification: record.specification,
    color: record.color, unit: record.unit,
    supplierName: record.supplierName, fabricWidth: record.fabricWidth,
    fabricWeight: record.fabricWeight, fabricComposition: record.fabricComposition,
    orderNo: values.orderNo, styleNo: values.styleNo, factoryName: values.factoryName,
    factoryType: values.factoryType || values.pickupType, pickupType: values.pickupType,
    usageType: values.usageType, receiverName: values.receiverName,
    issuerName: user?.name || user?.username || '系统',
    warehouseLocation: record.warehouseLocation, remark: values.reason || '手动出库',
    items: batchDetails.filter((i) => (i.outboundQty || 0) > 0).map((item) => ({
      batchNo: item.batchNo, warehouseLocation: item.warehouseLocation,
      quantity: item.outboundQty || 0, unit: record.unit,
      materialName: record.materialName, specification: record.specification,
      color: record.color, unitPrice: record.unitPrice,
    })),
  });

  const handleOutbound = async (record: MaterialInventory) => {
    outboundForm.setFieldsValue({
      materialCode: record.materialCode, materialName: record.materialName,
      availableQty: record.availableQty, pickupType: 'INTERNAL', usageType: 'BULK',
      issuerName: user?.name || user?.username || '系统',
      factoryName: '', factoryId: undefined, factoryType: undefined,
      orderNo: '', styleNo: '', receiverId: undefined, receiverName: '',
    });
    outboundModal.open(record);
    if (receiverOptions.length === 0) { void loadReceivers(); }
    if (factoryOptions.length === 0) { void loadFactories(); }
    setOutboundOrderOptions([]);
    void autoMatchOutboundContext(record);
    try {
      const res = await materialInventoryApi.listBatches({
        materialCode: record.materialCode, color: record.color || undefined, size: record.size || undefined,
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        setBatchDetails(res.data.map((item) => ({
          batchNo: item.batchNo || '', warehouseLocation: item.warehouseLocation || '默认仓',
          color: item.color || '', availableQty: item.availableQty || 0, lockedQty: item.lockedQty || 0,
          inboundDate: item.inboundDate ? dayjs(item.inboundDate).format('YYYY-MM-DD') : '',
          expiryDate: item.expiryDate ? dayjs(item.expiryDate).format('YYYY-MM-DD') : undefined, outboundQty: 0,
        })));
      } else { message.warning('未找到该物料的批次记录'); setBatchDetails([]); }
    } catch { message.error('加载批次明细失败'); setBatchDetails([]); }
  };

  const handleBatchQtyChange = (index: number, value: number | null) => {
    const newDetails = [...batchDetails];
    newDetails[index].outboundQty = value || 0;
    setBatchDetails(newDetails);
  };

  const handleOutboundConfirm = async () => {
    try {
      const values: any = await outboundForm.validateFields();
      const selectedBatches = batchDetails.filter((item) => (item.outboundQty || 0) > 0);
      if (selectedBatches.length === 0) { message.warning('请至少输入一个批次的出库数量'); return; }
      const bad = selectedBatches.find((item) => (item.outboundQty || 0) > item.availableQty);
      if (bad) { message.error(`批次 ${bad.batchNo} 的出库数量超过可用库存`); return; }
      const totalQty = selectedBatches.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
      const stockId = outboundModal.data?.id;
      if (!stockId) { message.error('库存记录ID缺失，无法出库'); return; }
      const res = await materialInventoryApi.manualOutbound({
        stockId, quantity: totalQty, reason: values.reason || '手动出库',
        orderNo: values.orderNo, styleNo: values.styleNo, factoryId: values.factoryId,
        factoryName: values.factoryName, factoryType: values.factoryType || values.pickupType,
        receiverId: values.receiverId, receiverName: values.receiverName,
        pickupType: values.pickupType, usageType: values.usageType,
      });
      if (res?.code === 200 || (res as any)?.data?.code === 200) {
        const outboundNo = res?.data?.outboundNo || `MOB-${Date.now()}`;
        message.success(`成功出库 ${totalQty} ${outboundModal.data?.unit || '件'}`);
        if (outboundModal.data) { openPrintModal(buildManualOutboundPrintPayload(outboundModal.data, values, outboundNo)); }
        outboundModal.close(); setBatchDetails([]); outboundForm.resetFields(); void fetchData();
      } else { message.error((res as any)?.message || (res as any)?.data?.message || '出库失败'); }
    } catch (error: unknown) {
      const errMsg = typeof error === 'object' && error !== null && 'response' in error
        ? String((error as Record<string, any>).response?.data?.message || '') : '';
      message.error(errMsg || (error instanceof Error ? error.message : '出库操作失败，请重试'));
    }
  };

  const handlePrintOutbound = (record: MaterialInventory) => {
    openPrintModal({
      outboundNo: `PREVIEW-${dayjs().format('YYYYMMDDHHmmss')}`,
      outboundTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      materialCode: record.materialCode, materialName: record.materialName,
      materialType: record.materialType, specification: record.specification,
      color: record.color, unit: record.unit,
      supplierName: record.supplierName, fabricWidth: record.fabricWidth,
      fabricWeight: record.fabricWeight, fabricComposition: record.fabricComposition,
      receiverName: '', issuerName: user?.name || user?.username || '系统',
      warehouseLocation: record.warehouseLocation,
      remark: '请先执行正式出库后再打印正式单据',
      items: [{ quantity: record.availableQty, unit: record.unit, materialName: record.materialName,
        specification: record.specification, warehouseLocation: record.warehouseLocation,
        color: record.color, unitPrice: record.unitPrice }],
    });
  };

  return {
    outboundModal, batchDetails, setBatchDetails,
    handleOutbound, handleBatchQtyChange, handleOutboundConfirm, handlePrintOutbound,
  };
}
