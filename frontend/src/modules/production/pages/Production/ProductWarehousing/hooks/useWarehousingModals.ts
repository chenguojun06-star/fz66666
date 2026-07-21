import { useState } from 'react';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import type { UploadFile } from 'antd/es/upload/interface';
import { CuttingBundleRow } from '../types';

export interface UseWarehousingModalsOptions {
  fetchWarehousingList: () => Promise<void>;
  ensureOrderUnlockedById: (orderId: any) => Promise<boolean>;
}

export interface UseWarehousingModalsResult {
  // New/Edit Modal
  visible: boolean;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
  currentWarehousing: WarehousingType | null;
  form: FormInstance;
  submitLoading: boolean;
  setSubmitLoading: React.Dispatch<React.SetStateAction<boolean>>;

  // Simple Warehousing Modal
  warehousingModalOpen: boolean;
  setWarehousingModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  warehousingModalLoading: boolean;
  setWarehousingModalLoading: React.Dispatch<React.SetStateAction<boolean>>;
  warehousingModalOrderId: string;
  setWarehousingModalOrderId: React.Dispatch<React.SetStateAction<string>>;
  warehousingModalWarehousingNo: string;
  setWarehousingModalWarehousingNo: React.Dispatch<React.SetStateAction<string>>;
  warehousingModalOrderNo: string;
  setWarehousingModalOrderNo: React.Dispatch<React.SetStateAction<string>>;
  warehousingModalWarehouse: string;
  setWarehousingModalWarehouse: React.Dispatch<React.SetStateAction<string>>;
  warehousingModalStyleNo: string;
  warehousingModalColor: string;
  warehousingModalSize: string;
  warehousingModalQuantity: number;

  // Independent Detail Popup
  independentDetailOpen: boolean;
  setIndependentDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  independentDetailWarehousingNo: string;
  setIndependentDetailWarehousingNo: React.Dispatch<React.SetStateAction<string>>;
  independentDetailSummary: WarehousingType | null;
  setIndependentDetailSummary: React.Dispatch<React.SetStateAction<WarehousingType | null>>;

  // Preview
  previewOpen: boolean;
  setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  previewUrl: string;
  setPreviewUrl: React.Dispatch<React.SetStateAction<string>>;
  previewTitle: string;
  setPreviewTitle: React.Dispatch<React.SetStateAction<string>>;

  // Form/Data State
  bundles: CuttingBundleRow[];
  setBundles: React.Dispatch<React.SetStateAction<CuttingBundleRow[]>>;
  unqualifiedFileList: UploadFile[];
  setUnqualifiedFileList: React.Dispatch<React.SetStateAction<UploadFile[]>>;

  // Actions
  fetchBundlesByOrderNo: (orderNo: string) => Promise<void>;
  openDialog: (warehousing?: WarehousingType) => void;
  closeDialog: () => void;
  openWarehousingModal: (record: WarehousingType) => void;
  closeWarehousingModal: () => void;
  submitWarehousing: () => Promise<void>;
  openIndependentDetailPopup: (record: WarehousingType) => void;
  closeIndependentDetailPopup: () => void;
}

export const useWarehousingModals = ({
  fetchWarehousingList,
  ensureOrderUnlockedById,
}: UseWarehousingModalsOptions): UseWarehousingModalsResult => {
  const [form] = Form.useForm();

  // New/Edit Modal
  const [visible, setVisible] = useState(false);
  const [currentWarehousing, setCurrentWarehousing] = useState<WarehousingType | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Simple Warehousing Modal
  const [warehousingModalOpen, setWarehousingModalOpen] = useState(false);
  const [warehousingModalLoading, setWarehousingModalLoading] = useState(false);
  const [warehousingModalOrderId, setWarehousingModalOrderId] = useState<string>('');
  const [warehousingModalWarehousingNo, setWarehousingModalWarehousingNo] = useState<string>('');
  const [warehousingModalOrderNo, setWarehousingModalOrderNo] = useState<string>('');
  const [warehousingModalWarehouse, setWarehousingModalWarehouse] = useState<string>('');
  const [warehousingModalStyleNo, setWarehousingModalStyleNo] = useState<string>('');
  const [warehousingModalColor, setWarehousingModalColor] = useState<string>('');
  const [warehousingModalSize, setWarehousingModalSize] = useState<string>('');
  const [warehousingModalQuantity, setWarehousingModalQuantity] = useState<number>(0);

  // Independent Detail Popup
  const [independentDetailOpen, setIndependentDetailOpen] = useState(false);
  const [independentDetailWarehousingNo, setIndependentDetailWarehousingNo] = useState<string>('');
  const [independentDetailSummary, setIndependentDetailSummary] = useState<WarehousingType | null>(null);

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Form/Data State
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [unqualifiedFileList, setUnqualifiedFileList] = useState<UploadFile[]>([]);

  const fetchBundlesByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) {
      setBundles([]);
      return;
    }
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 500, orderNo: on },
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

  const openDialog = (warehousing?: WarehousingType) => {
    setCurrentWarehousing(warehousing || null);
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentWarehousing(null);
  };

  const openWarehousingModal = (record: WarehousingType) => {
    const oid = String((record as any)?.orderId || '').trim();
    const whNo = String((record as any)?.warehousingNo || '').trim();
    const on = String((record as any)?.orderNo || '').trim();
    if (!oid && !whNo) {
      message.error('缺少订单信息');
      return;
    }
    setWarehousingModalOrderId(oid);
    setWarehousingModalWarehousingNo(whNo);
    setWarehousingModalOrderNo(on);
    setWarehousingModalWarehouse('');
    setWarehousingModalStyleNo(String(record?.styleNo || '').trim());
    setWarehousingModalColor(String(record?.color || '').trim());
    setWarehousingModalSize(String(record?.size || '').trim());
    setWarehousingModalQuantity(Number(record?.warehousingQuantity || 0));
    setWarehousingModalOpen(true);
  };

  const closeWarehousingModal = () => {
    setWarehousingModalOpen(false);
    setWarehousingModalLoading(false);
    setWarehousingModalOrderId('');
    setWarehousingModalWarehousingNo('');
    setWarehousingModalOrderNo('');
    setWarehousingModalWarehouse('');
    setWarehousingModalStyleNo('');
    setWarehousingModalColor('');
    setWarehousingModalSize('');
    setWarehousingModalQuantity(0);
  };

  const submitWarehousing = async () => {
    const oid = String(warehousingModalOrderId || '').trim();
    const whNo = String(warehousingModalWarehousingNo || '').trim();
    const warehouse = String(warehousingModalWarehouse || '').trim();
    if (!warehouse) {
      message.error('请选择仓库');
      return;
    }
    if (!oid && !whNo) {
      message.error('缺少订单信息');
      return;
    }
    if (oid && !(await ensureOrderUnlockedById(oid))) return;

    try {
      setWarehousingModalLoading(true);
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number }; message?: string }>('/production/warehousing/list', {
        params: {
          page: 1,
          pageSize: 500,
          ...(whNo ? { warehousingNo: whNo } : {}),
          ...(!whNo && oid ? { orderId: oid } : {}),
        },
      });
      if (res.code !== 200) {
        message.error(res.message || '获取质检记录失败');
        return;
      }
      const records = (res.data?.records || []) as WarehousingType[];
      const targets = records.filter((r) => {
        const qs = String((r as any)?.qualityStatus || '').trim().toLowerCase();
        const qualified = !qs || qs === 'qualified';
        const q = Number((r as any)?.qualifiedQuantity || 0) || 0;
        const wt = String((r as any)?.warehousingType || '').trim();
        const wh = String((r as any)?.warehouse || '').trim();
        if (wt === 'quality_scan_scrap' || wt === 'repair_return') return false;
        if (wh && wh !== '待分配') return false;
        return qualified && q > 0;
      });

      if (!targets.length) {
        message.info('该订单暂无可入库的合格质检记录');
        return;
      }

      const concurrency = 5;
      const queue = targets.slice();
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
        while (queue.length) {
          const r = queue.shift();
          if (!r) continue;
          await api.put<{ code: number; message: string; data: boolean }>('/production/warehousing', { id: (r as any)?.id, warehouse });
        }
      });
      await Promise.all(workers);

      message.success('入库完成');
      try {
        window.dispatchEvent(new Event('warehouse:in'));
        window.dispatchEvent(new Event('data:changed'));
      } catch (_e) {
        // 事件派发失败不影响业务
      }
      closeWarehousingModal();
      fetchWarehousingList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '入库失败');
    } finally {
      setWarehousingModalLoading(false);
    }
  };

  const openIndependentDetailPopup = (record: WarehousingType) => {
    const whNo = String((record as any)?.warehousingNo || '').trim();
    if (!whNo) {
      message.warning('质检入库号为空');
      return;
    }
    setIndependentDetailWarehousingNo(whNo);
    setIndependentDetailSummary(record);
    setIndependentDetailOpen(true);
  };

  const closeIndependentDetailPopup = () => {
    setIndependentDetailOpen(false);
    setIndependentDetailWarehousingNo('');
    setIndependentDetailSummary(null);
  };

  return {
    visible,
    setVisible,
    currentWarehousing,
    form,
    submitLoading,
    setSubmitLoading,

    warehousingModalOpen,
    setWarehousingModalOpen,
    warehousingModalLoading,
    setWarehousingModalLoading,
    warehousingModalOrderId,
    setWarehousingModalOrderId,
    warehousingModalWarehousingNo,
    setWarehousingModalWarehousingNo,
    warehousingModalOrderNo,
    setWarehousingModalOrderNo,
    warehousingModalWarehouse,
    setWarehousingModalWarehouse,
    warehousingModalStyleNo,
    warehousingModalColor,
    warehousingModalSize,
    warehousingModalQuantity,

    independentDetailOpen,
    setIndependentDetailOpen,
    independentDetailWarehousingNo,
    setIndependentDetailWarehousingNo,
    independentDetailSummary,
    setIndependentDetailSummary,

    previewOpen,
    setPreviewOpen,
    previewUrl,
    setPreviewUrl,
    previewTitle,
    setPreviewTitle,

    bundles,
    setBundles,
    unqualifiedFileList,
    setUnqualifiedFileList,

    fetchBundlesByOrderNo,
    openDialog,
    closeDialog,
    openWarehousingModal,
    closeWarehousingModal,
    submitWarehousing,
    openIndependentDetailPopup,
    closeIndependentDetailPopup,
  };
};
