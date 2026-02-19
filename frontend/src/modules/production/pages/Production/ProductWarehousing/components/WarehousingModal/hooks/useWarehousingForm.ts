import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Form, message, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import {
  MAX_UNQUALIFIED_IMAGES,
  MAX_UNQUALIFIED_IMAGE_MB,
} from '../../../constants';
import {
  CuttingBundleRow,
  BatchSelectBundleRow,
  BundleRepairStats
} from '../../../types';
import {
  isBundleBlockedForWarehousing,
  parseUrlsValue,
  computeBundleRepairStats,
  toUploadFileList,
  mapBundleStatusText
} from '../../../utils';

export const useWarehousingForm = (
  visible: boolean,
  currentWarehousing: WarehousingType | null,
  onCancel: () => void,
  onSuccess: () => void,
  defaultOrderNo?: string,
) => {
  const [form] = Form.useForm();

  // Local State
  const [submitLoading, setSubmitLoading] = useState(false);
  const [orderOptions, setOrderOptions] = useState<ProductionOrder[]>([]);
  const [orderOptionsLoading, setOrderOptionsLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [qualifiedWarehousedBundleQrs, setQualifiedWarehousedBundleQrs] = useState<string[]>([]);
  const [bundleRepairStatsByQr, setBundleRepairStatsByQr] = useState<Record<string, BundleRepairStats>>({});
  const [bundleRepairRemainingByQr, setBundleRepairRemainingByQr] = useState<Record<string, number>>({});
  const [unqualifiedFileList, setUnqualifiedFileList] = useState<UploadFile[]>([]);
  const [batchSelectedBundleQrs, setBatchSelectedBundleQrs] = useState<string[]>([]);
  const [batchQtyByQr, setBatchQtyByQr] = useState<Record<string, number>>({});
  const [detailWarehousingItems, setDetailWarehousingItems] = useState<WarehousingType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form Watch
  const watchedOrderId = Form.useWatch('orderId', form);
  const watchedStyleId = Form.useWatch('styleId', form);
  const watchedBundleQr = Form.useWatch('cuttingBundleQrCode', form);
  const watchedWarehousingQty = Form.useWatch('warehousingQuantity', form);
  const watchedUnqualifiedQty = Form.useWatch('unqualifiedQuantity', form);

  // Frozen Check
  const frozenOrderIds = useMemo(() => {
    return watchedOrderId ? [watchedOrderId] : [];
  }, [watchedOrderId]);
  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'statusOrStock', acceptAnyData: true });

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  // API Calls
  const fetchOrderOptions = async () => {
    setOrderOptionsLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: ProductionOrder[]; total: number }; message?: string }>('/production/order/list', { params: { page: 1, pageSize: 5000 } });
      if (res.code === 200) {
        setOrderOptions(res.data.records || []);
      } else {
        setOrderOptions([]);
        message.error(res.message || '获取订单列表失败');
      }
    } catch {
      setOrderOptions([]);
      message.error('获取订单列表失败');
    } finally {
      setOrderOptionsLoading(false);
    }
  };

  const fetchBundlesByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) {
      setBundles([]);
      return;
    }
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      if (res.code === 200) {
        setBundles((res.data?.records || []) as CuttingBundleRow[]);
      } else {
        setBundles([]);
      }
    } catch {
      setBundles([]);
    }
  };

  const fetchQualifiedWarehousedBundleQrsByOrderId = async (orderId: string) => {
    const oid = String(orderId || '').trim();
    if (!oid) {
      setQualifiedWarehousedBundleQrs([]);
      return;
    }
    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: { page: 1, pageSize: 10000, orderId: oid },
      });
      if (res.code === 200) {
        const records = (res.data?.records || []) as any[];
        const whNo = String(records?.[0]?.warehousingNo || '').trim();
        form.setFieldsValue({ warehousingNo: whNo || undefined });
        const qrs = records
          .filter((r) => {
            const q = Number(r?.qualifiedQuantity || 0) || 0;
            if (q <= 0) return false;
            const qs = String(r?.qualityStatus || '').trim().toLowerCase();
            return !qs || qs === 'qualified';
          })
          .map((r) => String(r?.cuttingBundleQrCode || '').trim())
          .filter(Boolean);
        setQualifiedWarehousedBundleQrs(Array.from(new Set(qrs)));
      } else {
        setQualifiedWarehousedBundleQrs([]);
        form.setFieldsValue({ warehousingNo: undefined });
      }
    } catch {
      setQualifiedWarehousedBundleQrs([]);
      form.setFieldsValue({ warehousingNo: undefined });
    }
  };

  const fetchBundleRepairStatsByQr = async (orderId: string, qrCode: string) => {
    const oid = String(orderId || '').trim();
    const qr = String(qrCode || '').trim();
    if (!oid || !qr) return;

    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: {
          page: 1,
          pageSize: 10000,
          orderId: oid,
          cuttingBundleQrCode: qr,
        },
      });
      if (res.code !== 200) return;
      const records = (res.data?.records || []) as any[];
      const stats = computeBundleRepairStats(records);
      setBundleRepairStatsByQr((prev) => ({ ...prev, [qr]: stats }));
      setBundleRepairRemainingByQr((prev) => ({ ...prev, [qr]: stats.remaining }));
    } catch {
      // ignore
    }
  };

  const fetchBundleRepairStatsBatch = async (orderId: string, qrs: string[]) => {
    const oid = String(orderId || '').trim();
    const list = Array.isArray(qrs) ? qrs.map((v) => String(v || '').trim()).filter(Boolean) : [];
    if (!oid || !list.length) return;
    try {
      const res = await api.post<{ code: number; data: Record<string, unknown>; message?: string }>('/production/warehousing/repair-stats', {
        orderId: oid,
        qrs: list,
      });
      if (res.code !== 200) {
        throw new Error(res.message || '获取返修统计失败');
      }
      const items = (res.data?.items || []) as any[];
      if (!Array.isArray(items) || !items.length) return;

      setBundleRepairStatsByQr((prev) => {
        const next = { ...prev };
        for (const it of items) {
          const qr = String(it?.qr || '').trim();
          if (!qr) continue;
          next[qr] = {
            repairPool: Math.max(0, Number(it?.repairPool ?? 0) || 0),
            repairedOut: Math.max(0, Number(it?.repairedOut ?? 0) || 0),
            remaining: Math.max(0, Number(it?.remaining ?? 0) || 0),
          };
        }
        return next;
      });

      setBundleRepairRemainingByQr((prev) => {
        const next = { ...prev };
        for (const it of items) {
          const qr = String(it?.qr || '').trim();
          if (!qr) continue;
          next[qr] = Math.max(0, Number(it?.remaining ?? 0) || 0);
        }
        return next;
      });
    } catch {
      const concurrency = 6;
      const queue = list.slice();
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
        while (queue.length) {
          const qr = queue.shift();
          if (!qr) continue;
          await fetchBundleRepairStatsByQr(oid, qr);
        }
      });
      await Promise.allSettled(workers);
    }
  };

  const loadWarehousingDetail = async (warehousing: WarehousingType) => {
    const warehousingNo = String((warehousing as any)?.warehousingNo || '').trim();
    const orderId = String((warehousing as any)?.orderId || '').trim();
    const orderNo = String((warehousing as any)?.orderNo || '').trim();

    setDetailLoading(true);
    try {
      let records: WarehousingType[] = [];

      if (warehousingNo || orderId) {
        const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
          params: {
            page: 1,
            pageSize: 10000,
            ...(warehousingNo ? { warehousingNo } : {}),
            ...(!warehousingNo && orderId ? { orderId } : {}),
          },
        });
        if (res.code === 200) {
          records = (res.data?.records || []) as WarehousingType[];
        }
      }

      setDetailWarehousingItems(records);
      const resolvedOrderNo = orderNo || String((records as any)?.[0]?.orderNo || '').trim();
      if (resolvedOrderNo) {
        await fetchBundlesByOrderNo(resolvedOrderNo);
      } else {
        setBundles([]);
      }
    } catch {
      setDetailWarehousingItems([]);
      setBundles([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    if (!visible) {
      setBundles([]);
      setQualifiedWarehousedBundleQrs([]);
      setBatchSelectedBundleQrs([]);
      setBatchQtyByQr({});
      setDetailWarehousingItems([]);
      setDetailLoading(false);
      setUnqualifiedFileList([]);
      form.resetFields();
      return;
    }

    if (currentWarehousing) {
      form.setFieldsValue({
        ...currentWarehousing,
        createTime: formatDateTime((currentWarehousing as any)?.createTime),
      });
      const urls = parseUrlsValue((currentWarehousing as any)?.unqualifiedImageUrls);
      setUnqualifiedFileList(toUploadFileList(urls));
      loadWarehousingDetail(currentWarehousing);
    } else {
      fetchOrderOptions().then(() => {
        // 如果有默认订单号（从质检详情页传入），自动选中
        if (defaultOrderNo) {
          // 延迟一帧等待orderOptions加载完成
          setTimeout(() => {
            const matchOrder = orderOptions.find((o: any) => String(o?.orderNo || '').trim() === defaultOrderNo);
            if (matchOrder) {
              form.setFieldsValue({ orderId: (matchOrder as any).id });
            }
          }, 500);
        }
      });
      form.resetFields();
      form.setFieldsValue({
        unqualifiedQuantity: 0,
        qualifiedQuantity: undefined,
        qualityStatus: 'qualified',
        unqualifiedImageUrls: '[]',
        defectCategory: undefined,
        defectRemark: undefined,
        repairRemark: '',
      });
      setUnqualifiedFileList([]);
    }
  }, [visible, currentWarehousing]);

  useEffect(() => {
    if (currentWarehousing) return;
    const oid = String(watchedOrderId || '').trim();
    if (!oid) return;
    const blockedQrs = bundles
      .map((b: any) => {
        const qr = String(b?.qrCode || '').trim();
        if (!qr) return '';
        const rawStatus = String(b?.status || '').trim();
        if (!isBundleBlockedForWarehousing(rawStatus)) return '';
        return qr;
      })
      .filter(Boolean);
    const missing = blockedQrs.filter((qr) => bundleRepairRemainingByQr[qr] === undefined);
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await fetchBundleRepairStatsBatch(oid, missing);
    })();

    return () => {
      cancelled = true;
    };
  }, [bundles, bundleRepairRemainingByQr, currentWarehousing, watchedOrderId]);

  // Logic for Batch Selection
  const qualifiedWarehousedBundleQrSet = useMemo(() => {
    return new Set(
      qualifiedWarehousedBundleQrs
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    );
  }, [qualifiedWarehousedBundleQrs]);

  const batchSelectRows = useMemo((): BatchSelectBundleRow[] => {
    return bundles
      .map((b) => {
        const qr = String(b.qrCode || '').trim();
        if (!qr) return null;
        const color = String(b.color || '').trim();
        const size = String(b.size || '').trim();
        const qty = Number(b.quantity || 0) || 0;
        const bundleNo = Number(b.bundleNo || 0) || 0;
        const rawStatus = String((b as any)?.status || '').trim();
        const isBlocked = isBundleBlockedForWarehousing(rawStatus);
        const remaining = isBlocked ? bundleRepairRemainingByQr[qr] : undefined;
        const availableQty = isBlocked ? (remaining === undefined ? 0 : Math.max(0, Number(remaining || 0) || 0)) : qty;
        const isUsed = qualifiedWarehousedBundleQrSet.has(qr);
        const disabled = isUsed || (isBlocked && (remaining === undefined || availableQty <= 0));

        let statusText = '';
        if (isUsed) {
          statusText = '已合格质检';
        } else if (isBlocked) {
          if (remaining === undefined) statusText = '次品待返修（计算中）';
          else statusText = availableQty > 0 ? `次品待返修｜可入库${availableQty}` : '次品待返修｜无可入库';
        } else if (rawStatus) {
          statusText = mapBundleStatusText(rawStatus);
        } else {
          statusText = '未开始';
        }

        return {
          key: qr,
          qr,
          bundleNo: bundleNo || undefined,
          color: color || undefined,
          size: size || undefined,
          quantity: qty || 0,
          availableQty,
          statusText,
          disabled,
          rawStatus,
        };
      })
      .filter(Boolean) as BatchSelectBundleRow[];
  }, [bundleRepairRemainingByQr, bundles, qualifiedWarehousedBundleQrSet]);

  const batchSelectableQrs = useMemo(() => {
    return batchSelectRows.filter((r) => !r.disabled).map((r) => r.qr);
  }, [batchSelectRows]);

  const handleBatchSelectionChange = (nextKeys: React.Key[], selectedRows: BatchSelectBundleRow[]) => {
    const nextQrs = nextKeys
      .map((k) => String(k || '').trim())
      .filter(Boolean);

    setBatchSelectedBundleQrs(nextQrs);
    setBatchQtyByQr((prev) => {
      const next: Record<string, number> = {};
      for (const qr of nextQrs) {
        const keep = Number(prev[qr] || 0) || 0;
        const row = selectedRows.find((r) => r.qr === qr) || batchSelectRows.find((r) => r.qr === qr);
        const maxQty = Math.max(0, Number((row as any)?.availableQty ?? row?.quantity ?? 0) || 0);
        const base = keep > 0 ? keep : maxQty;
        next[qr] = Math.max(0, Math.min(maxQty || base, base));
      }
      return next;
    });
  };

  const batchSelectedSummary = useMemo(() => {
    const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
    let totalQty = 0;
    let blockedCount = 0;
    let blockedQty = 0;
    let nonBlockedQty = 0;
    let blockedRemainingSum = 0;
    let blockedMissing = 0;
    let repairPoolSum = 0;
    let repairedOutSum = 0;
    let statsMissing = 0;

    const bundleByQrForSummary = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (!qr) continue;
      bundleByQrForSummary.set(qr, b);
    }

    for (const qr of qrs) {
      const b = bundleByQrForSummary.get(qr);
      const rawStatus = String((b as any)?.status || '').trim();
      const isBlocked = isBundleBlockedForWarehousing(rawStatus);
      const remaining = isBlocked ? bundleRepairRemainingByQr[qr] : undefined;
      const maxQty = isBlocked
        ? Math.max(0, Number(remaining === undefined ? 0 : remaining) || 0)
        : Math.max(0, Number(b?.quantity ?? 0) || 0);
      const currentQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));

      totalQty += currentQty;
      if (isBlocked) {
        blockedCount += 1;
        blockedQty += currentQty;
        if (remaining === undefined) blockedMissing += 1;
        else blockedRemainingSum += Math.max(0, Number(remaining || 0) || 0);

        const st = bundleRepairStatsByQr[qr];
        if (!st) statsMissing += 1;
        else {
          repairPoolSum += Math.max(0, Number(st.repairPool || 0) || 0);
          repairedOutSum += Math.max(0, Number(st.repairedOut || 0) || 0);
        }
      } else {
        nonBlockedQty += currentQty;
      }
    }

    return {
      selectedCount: qrs.length,
      totalQty,
      blockedCount,
      blockedQty,
      nonBlockedQty,
      blockedRemainingSum,
      blockedMissing,
      repairPoolSum,
      repairedOutSum,
      statsMissing,
    };
  }, [batchQtyByQr, batchSelectedBundleQrs, bundles, bundleRepairRemainingByQr, bundleRepairStatsByQr]);

  const batchSelectedHasBlocked = useMemo(() => {
    return batchSelectedSummary.blockedCount > 0;
  }, [batchSelectedSummary.blockedCount]);

  const singleSelectedQr = useMemo(() => {
    if (batchSelectedBundleQrs.length !== 1) return '';
    return String(batchSelectedBundleQrs[0] || '').trim();
  }, [batchSelectedBundleQrs]);

  const singleSelectedBundle = useMemo(() => {
    if (!singleSelectedQr) return null;
    return bundles.find((b) => String(b.qrCode || '').trim() === singleSelectedQr) || null;
  }, [bundles, singleSelectedQr]);

  const isSingleSelectedBundleBlocked = useMemo(() => {
    const rawStatus = String((singleSelectedBundle as any)?.status || '').trim();
    return Boolean(singleSelectedQr && isBundleBlockedForWarehousing(rawStatus));
  }, [singleSelectedBundle, singleSelectedQr]);

  const singleSelectedBundleRepairStats = useMemo(() => {
    if (!singleSelectedQr) return undefined;
    return bundleRepairStatsByQr[singleSelectedQr];
  }, [bundleRepairStatsByQr, singleSelectedQr]);

  useEffect(() => {
    if (currentWarehousing) return;
    const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
    if (!qrs.length) {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
        warehousingQuantity: undefined,
        qualifiedQuantity: undefined,
        unqualifiedQuantity: 0,
        qualityStatus: 'qualified',
      });
      return;
    }

    if (qrs.length === 1) {
      const qr = qrs[0];
      const b = bundles.find((x) => String(x.qrCode || '').trim() === qr) || null;
      form.setFieldsValue({
        cuttingBundleQrCode: qr,
        cuttingBundleId: b?.id,
        cuttingBundleNo: b?.bundleNo,
      });
    } else {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
      });
    }

    const total = qrs.reduce((sum, qr) => sum + (Number(batchQtyByQr[qr] || 0) || 0), 0);
    const rawStatus = qrs.length === 1 ? String((bundles.find((x) => String(x.qrCode || '').trim() === qrs[0]) as any)?.status || '').trim() : '';
    const isRepairFlow = qrs.length === 1 && isBundleBlockedForWarehousing(rawStatus);
    const baseUnq = qrs.length === 1 ? Number(form.getFieldValue('unqualifiedQuantity') || 0) || 0 : 0;
    const unq = isRepairFlow ? 0 : (qrs.length === 1 ? Math.max(0, Math.min(total, baseUnq)) : 0);
    const qual = Math.max(0, total - unq);
    form.setFieldsValue({
      warehousingQuantity: total,
      unqualifiedQuantity: unq,
      qualifiedQuantity: qual,
      qualityStatus: unq > 0 ? 'unqualified' : 'qualified',
    });
  }, [batchQtyByQr, batchSelectedBundleQrs, bundles, currentWarehousing, form]);

  const handleBatchSelectAll = () => {
    const nextQrs = batchSelectableQrs.slice();
    const selectedRows = nextQrs
      .map((qr) => batchSelectRows.find((r) => r.qr === qr))
      .filter(Boolean) as BatchSelectBundleRow[];
    handleBatchSelectionChange(nextQrs, selectedRows);
  };

  const handleBatchSelectInvert = () => {
    const current = new Set(batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean));
    const nextQrs = batchSelectableQrs.filter((qr) => !current.has(qr));
    const selectedRows = nextQrs
      .map((qr) => batchSelectRows.find((r) => r.qr === qr))
      .filter(Boolean) as BatchSelectBundleRow[];
    handleBatchSelectionChange(nextQrs, selectedRows);
  };

  const handleBatchSelectClear = () => {
    setBatchSelectedBundleQrs([]);
    setBatchQtyByQr({});
  };

  const uploadOneUnqualifiedImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('仅支持图片文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_UNQUALIFIED_IMAGE_MB * 1024 * 1024) {
      message.error(`图片过大，最大${MAX_UNQUALIFIED_IMAGE_MB}MB`);
      return Upload.LIST_IGNORE;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<{ code: number; message: string; data: string }>('/common/upload', formData);
      if (res.code !== 200) {
        message.error(res.message || '上传失败');
        return Upload.LIST_IGNORE;
      }
      const url = String(res.data || '').trim();
      if (!url) {
        message.error('上传失败');
        return Upload.LIST_IGNORE;
      }

      setUnqualifiedFileList((prev) => {
        const next = [...prev, { uid: `${Date.now()}-${Math.random()}`, name: file.name, status: 'done', url } as UploadFile].slice(0, MAX_UNQUALIFIED_IMAGES);
        form.setFieldsValue({
          unqualifiedImageUrls: JSON.stringify(
            next
              .map((f) => String((f as any)?.url || '').trim())
              .filter(Boolean)
              .slice(0, MAX_UNQUALIFIED_IMAGES)
          ),
        });
        return next;
      });
      message.success('上传成功');
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    }
    return Upload.LIST_IGNORE;
  };

  const handleBatchQualifiedSubmit = async () => {
    if (!batchSelectedBundleQrs.length) {
      message.warning('请先添加菲号');
      return;
    }
    if (batchSelectedHasBlocked) {
      message.warning('次品待返修菲号请单条处理（保存时填写返修备注）');
      return;
    }
    try {
      setSubmitLoading(true);
      const orderId = String(form.getFieldValue('orderId') || '').trim();
      if (!orderId) {
        message.error('请选择订单号');
        return;
      }

      if (!(await ensureOrderUnlockedById(orderId))) return;

      const items = batchSelectedBundleQrs
        .map((qr) => {
          const qty = Number(batchQtyByQr[qr] || 0) || 0;
          return { cuttingBundleQrCode: qr, warehousingQuantity: qty };
        })
        .filter((it) => (Number(it.warehousingQuantity || 0) || 0) > 0);

      if (!items.length) {
        message.error('质检数量必须大于0');
        return;
      }

      const res = await api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/batch', {
        orderId,
        warehousingType: 'manual',
        items,
      });
      if (res.code === 200) {
        message.success('批量合格质检成功');
        onSuccess();
        onCancel();
      } else {
        message.error(res.message || '批量入库失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        const firstError = error.errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error(error.message || '批量入库失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();

      if (!(await ensureOrderUnlockedById(values.orderId))) return;

      const urls = unqualifiedFileList
        .map((f) => String((f as any)?.url || '').trim())
        .filter(Boolean)
        .slice(0, 4);
      const warehousingQty = Number(values.warehousingQuantity || 0) || 0;
      const unqualifiedQty = Math.max(0, Math.min(warehousingQty, Number(values.unqualifiedQuantity || 0) || 0));
      const qualifiedQty = Math.max(0, warehousingQty - unqualifiedQty);
      const qualityStatus = unqualifiedQty > 0 ? 'unqualified' : 'qualified';

      const defectCategory = String(values.defectCategory || '').trim();
      const defectRemark = String(values.defectRemark || '').trim();

      const payload: any = {
        ...values,
        unqualifiedQuantity: unqualifiedQty,
        qualifiedQuantity: qualifiedQty,
        warehousingQuantity: warehousingQty,
        qualityStatus,
        unqualifiedImageUrls: JSON.stringify(urls),
      };

      if (unqualifiedQty > 0) {
        payload.defectCategory = defectCategory;
        payload.defectRemark = defectRemark;
      } else {
        payload.defectCategory = '';
        payload.defectRemark = '';
      }

      let response;
      if (currentWarehousing?.id) {
        response = await api.put('/production/warehousing', { ...payload, id: currentWarehousing.id });
      } else {
        const { warehouse: _warehouse, ...safePayload } = payload;
        response = await api.post('/production/warehousing', { ...safePayload, warehousingType: 'manual' });
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(currentWarehousing?.id ? '编辑质检入库成功' : '新增质检入库成功');
        onSuccess();
        onCancel();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        const firstError = error.errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error(error.message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleOrderChange = async (value: any, option: any) => {
    if (!value) {
      form.setFieldsValue({
        warehousingNo: undefined,
        orderNo: undefined,
        styleId: undefined,
        styleNo: undefined,
        styleName: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
        cuttingBundleQrCode: undefined,
        warehousingQuantity: undefined,
        qualifiedQuantity: undefined,
        unqualifiedQuantity: 0,
        qualityStatus: 'qualified',
        defectCategory: undefined,
        defectRemark: undefined,
        repairRemark: '',
      });
      setBundles([]);
      setQualifiedWarehousedBundleQrs([]);
      setBatchSelectedBundleQrs([]);
      setBatchQtyByQr({});
      return;
    }
    const order = (option as any)?.data || orderOptions.find((o) => o.id === value);
    if (!order) return;

    form.setFieldsValue({
      orderNo: (order as any).orderNo,
      styleId: (order as any).styleId,
      styleNo: (order as any).styleNo,
      styleName: (order as any).styleName,
    });
    form.setFieldsValue({
      cuttingBundleId: undefined,
      cuttingBundleNo: undefined,
      cuttingBundleQrCode: undefined,
      warehousingQuantity: undefined,
      qualifiedQuantity: undefined,
      unqualifiedQuantity: 0,
      qualityStatus: 'qualified',
      unqualifiedImageUrls: JSON.stringify(
        unqualifiedFileList.map((f) => String((f as any)?.url || '').trim()).filter(Boolean).slice(0, 4)
      ),
      defectCategory: undefined,
      defectRemark: undefined,
      repairRemark: '',
    });
    setQualifiedWarehousedBundleQrs([]);
    setBatchSelectedBundleQrs([]);
    setBatchQtyByQr({});
    await Promise.all([
      fetchBundlesByOrderNo((order as any).orderNo!),
      fetchQualifiedWarehousedBundleQrsByOrderId((order as any).id!),
    ]);
  };

  return {
    form,
    submitLoading,
    orderOptions,
    orderOptionsLoading,
    bundles,
    batchSelectedBundleQrs,
    batchQtyByQr,
    unqualifiedFileList,
    detailWarehousingItems,
    detailLoading,
    watchedOrderId,
    watchedBundleQr,
    watchedWarehousingQty,
    watchedUnqualifiedQty,
    watchedStyleId,
    // Methods
    setBundles,
    setQualifiedWarehousedBundleQrs,
    setBatchSelectedBundleQrs,
    setBatchQtyByQr,
    setUnqualifiedFileList,
    fetchBundlesByOrderNo,
    fetchQualifiedWarehousedBundleQrsByOrderId,
    uploadOneUnqualifiedImage,
    handleBatchSelectionChange,
    handleBatchQualifiedSubmit,
    handleSubmit,
    handleBatchSelectAll,
    handleBatchSelectInvert,
    handleBatchSelectClear,
    handleOrderChange,
    // Computed
    batchSelectRows,
    batchSelectableQrs,
    batchSelectedSummary,
    batchSelectedHasBlocked,
    singleSelectedBundle,
    isSingleSelectedBundleBlocked,
    singleSelectedBundleRepairStats,
    bundleRepairRemainingByQr,
  };
};
