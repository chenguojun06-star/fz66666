import { useState, useEffect, useMemo } from 'react';
import { Form, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import { MAX_UNQUALIFIED_IMAGES, MAX_UNQUALIFIED_IMAGE_MB } from '../../../constants';
import { CuttingBundleRow, BundleRepairStats } from '../../../types';
import { isBundleBlockedForWarehousing } from '../../../utils';
import { message } from '@/utils/antdStatic';
import { useWarehousingApi } from './useWarehousingApi';
import { useBatchBundleSelection } from './useBatchBundleSelection';
import { useWarehousingSubmit } from './useWarehousingSubmit';

export const useWarehousingForm = (
  visible: boolean,
  currentWarehousing: WarehousingType | null,
  onCancel: () => void,
  onSuccess: () => void,
  defaultOrderNo?: string,
) => {
  const [form] = Form.useForm();
  const [orderOptions, setOrderOptions] = useState<ProductionOrder[]>([]);
  const [orderOptionsLoading, setOrderOptionsLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [qualifiedWarehousedBundleQrs, setQualifiedWarehousedBundleQrs] = useState<string[]>([]);
  const [bundleRepairStatsByQr, setBundleRepairStatsByQr] = useState<Record<string, BundleRepairStats>>({});
  const [bundleRepairRemainingByQr, setBundleRepairRemainingByQr] = useState<Record<string, number>>({});
  const [productionReadyQrs, setProductionReadyQrs] = useState<string[]>([]);
  const [qrStageHintsMap, setQrStageHintsMap] = useState<Record<string, string[]>>({});
  const [unqualifiedFileList, setUnqualifiedFileList] = useState<UploadFile[]>([]);
  const [detailWarehousingItems, setDetailWarehousingItems] = useState<WarehousingType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const watchedOrderId = Form.useWatch('orderId', form);
  const watchedStyleId = Form.useWatch('styleId', form);
  const watchedBundleQr = Form.useWatch('cuttingBundleQrCode', form);
  const watchedWarehousingQty = Form.useWatch('warehousingQuantity', form);
  const watchedUnqualifiedQty = Form.useWatch('unqualifiedQuantity', form);

  const frozenOrderIds = useMemo(() => (watchedOrderId ? [watchedOrderId] : []), [watchedOrderId]);
  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'statusOrStock', acceptAnyData: true });
  const ensureOrderUnlockedById = async (orderId: any) =>
    await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));

  const apiHook = useWarehousingApi(form, {
    setOrderOptions, setOrderOptionsLoading, setBundles,
    setQualifiedWarehousedBundleQrs, setBundleRepairStatsByQr,
    setBundleRepairRemainingByQr, setProductionReadyQrs,
    setQrStageHintsMap, setDetailWarehousingItems,
    setDetailLoading, setUnqualifiedFileList,
  });

  const batchSelection = useBatchBundleSelection({
    form, bundles, qualifiedWarehousedBundleQrs, productionReadyQrs,
    bundleRepairStatsByQr, bundleRepairRemainingByQr, qrStageHintsMap, currentWarehousing,
  });

  const submitHook = useWarehousingSubmit({
    form,
    batchSelectedBundleQrs: batchSelection.batchSelectedBundleQrs,
    batchQtyByQr: batchSelection.batchQtyByQr,
    unqualifiedFileList, currentWarehousing, onSuccess, onCancel, ensureOrderUnlockedById,
    batchSelectedHasBlocked: batchSelection.batchSelectedHasBlocked,
  });

  // Reset on close; init on open
  useEffect(() => {
    if (!visible) {
      setBundles([]);
      setQualifiedWarehousedBundleQrs([]);
      setProductionReadyQrs([]);
      batchSelection.setBatchSelectedBundleQrs([]);
      batchSelection.setBatchQtyByQr({});
      setDetailWarehousingItems([]);
      setDetailLoading(false);
      setUnqualifiedFileList([]);
      form.resetFields();
      return;
    }
    if (currentWarehousing) {
      apiHook.initDetailForm(currentWarehousing);
    } else {
      void apiHook.initCreateForm(defaultOrderNo, orderOptions);
    }
  }, [visible, currentWarehousing]);

  // Load repair stats for blocked bundles that are missing from the cache
  useEffect(() => {
    if (currentWarehousing) return;
    const oid = String(watchedOrderId || '').trim();
    if (!oid) return;
    const missing = bundles
      .filter((b: any) => {
        const qr = String(b?.qrCode || '').trim();
        if (!qr) return false;
        const rawStatus = String(b?.status || '').trim();
        const sLower = rawStatus.toLowerCase();
        return isBundleBlockedForWarehousing(rawStatus) ||
          sLower === 'repaired_waiting_qc' || rawStatus === '返修待质检' || rawStatus === '返修完成待质检';
      })
      .map((b: any) => String(b?.qrCode || '').trim())
      .filter((qr) => bundleRepairRemainingByQr[qr] === undefined);
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await apiHook.fetchBundleRepairStatsBatch(oid, missing);
    })();
    return () => { cancelled = true; };
  }, [bundles, bundleRepairRemainingByQr, currentWarehousing, watchedOrderId]);

  const handleOrderChange = async (value: any, option: any) => {
    if (!value) {
      form.setFieldsValue({
        warehousingNo: undefined, orderNo: undefined, styleId: undefined, styleNo: undefined, styleName: undefined,
        cuttingBundleId: undefined, cuttingBundleNo: undefined, cuttingBundleQrCode: undefined,
        warehousingQuantity: undefined, qualifiedQuantity: undefined, unqualifiedQuantity: 0, qualityStatus: 'qualified',
        defectCategory: undefined, defectRemark: undefined, repairRemark: '',
      });
      setBundles([]);
      setQualifiedWarehousedBundleQrs([]);
      setProductionReadyQrs([]);
      batchSelection.setBatchSelectedBundleQrs([]);
      batchSelection.setBatchQtyByQr({});
      return;
    }
    const order = (option as any)?.data || orderOptions.find((o) => o.id === value);
    if (!order) return;
    form.setFieldsValue({
      orderNo: (order as any).orderNo, styleId: (order as any).styleId,
      styleNo: (order as any).styleNo, styleName: (order as any).styleName,
      cuttingBundleId: undefined, cuttingBundleNo: undefined, cuttingBundleQrCode: undefined,
      warehousingQuantity: undefined, qualifiedQuantity: undefined, unqualifiedQuantity: 0, qualityStatus: 'qualified',
      unqualifiedImageUrls: JSON.stringify(unqualifiedFileList.map((f) => String((f as any)?.url || '').trim()).filter(Boolean).slice(0, 4)),
      defectCategory: undefined, defectRemark: undefined, repairRemark: '',
    });
    setQualifiedWarehousedBundleQrs([]);
    setProductionReadyQrs([]);
    batchSelection.setBatchSelectedBundleQrs([]);
    batchSelection.setBatchQtyByQr({});
    await Promise.all([
      apiHook.fetchBundlesByOrderNo((order as any).orderNo!),
      apiHook.fetchQualifiedWarehousedBundleQrsByOrderId((order as any).id!),
      apiHook.fetchBundleReadiness((order as any).id!),
    ]);
  };

  const uploadOneUnqualifiedImage = async (file: File) => {
    if (!file.type.startsWith('image/')) { message.error('仅支持图片文件'); return Upload.LIST_IGNORE; }
    if (file.size > MAX_UNQUALIFIED_IMAGE_MB * 1024 * 1024) { message.error(`图片过大，最大${MAX_UNQUALIFIED_IMAGE_MB}MB`); return Upload.LIST_IGNORE; }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<{ code: number; message: string; data: string }>('/common/upload', formData);
      if (res.code !== 200) { message.error(res.message || '上传失败'); return Upload.LIST_IGNORE; }
      const url = String(res.data || '').trim();
      if (!url) { message.error('上传失败'); return Upload.LIST_IGNORE; }
      setUnqualifiedFileList((prev) => {
        const next = [...prev, { uid: `${Date.now()}-${Math.random()}`, name: file.name, status: 'done', url } as UploadFile].slice(0, MAX_UNQUALIFIED_IMAGES);
        form.setFieldsValue({ unqualifiedImageUrls: JSON.stringify(next.map((f) => String((f as any)?.url || '').trim()).filter(Boolean).slice(0, MAX_UNQUALIFIED_IMAGES)) });
        return next;
      });
      message.success('上传成功');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '上传失败');
    }
    return Upload.LIST_IGNORE;
  };

  return {
    form, orderOptions, orderOptionsLoading, bundles,
    unqualifiedFileList, detailWarehousingItems, detailLoading,
    bundleRepairRemainingByQr,
    watchedOrderId, watchedStyleId, watchedBundleQr, watchedWarehousingQty, watchedUnqualifiedQty,
    setBundles, setQualifiedWarehousedBundleQrs, setUnqualifiedFileList,
    fetchBundlesByOrderNo: apiHook.fetchBundlesByOrderNo,
    fetchQualifiedWarehousedBundleQrsByOrderId: apiHook.fetchQualifiedWarehousedBundleQrsByOrderId,
    handleOrderChange, uploadOneUnqualifiedImage,
    ...batchSelection,
    ...submitHook,
  };
};
