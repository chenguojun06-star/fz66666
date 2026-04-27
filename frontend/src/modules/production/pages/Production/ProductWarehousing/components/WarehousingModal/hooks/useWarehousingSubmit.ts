import { useState } from 'react';
import { Form } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import api from '@/utils/api';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { message } from '@/utils/antdStatic';

interface SubmitDeps {
  form: ReturnType<typeof Form.useForm>[0];
  batchSelectedBundleQrs: string[];
  batchQtyByQr: Record<string, number>;
  unqualifiedFileList: UploadFile[];
  currentWarehousing: WarehousingType | null;
  onSuccess: () => void;
  onCancel: () => void;
  ensureOrderUnlockedById: (orderId: any) => Promise<boolean>;
  batchSelectedHasBlocked: boolean;
}

export const useWarehousingSubmit = (deps: SubmitDeps) => {
  const {
    form, batchSelectedBundleQrs, batchQtyByQr, unqualifiedFileList,
    currentWarehousing, onSuccess, onCancel, ensureOrderUnlockedById, batchSelectedHasBlocked,
  } = deps;

  const [submitLoading, setSubmitLoading] = useState(false);

  const handleBatchQualifiedSubmit = async () => {
    if (!batchSelectedBundleQrs.length) { message.warning('请先添加菲号'); return; }
    if (batchSelectedHasBlocked) { message.warning('次品待返修菲号请单条处理（保存时填写返修备注）'); return; }
    try {
      setSubmitLoading(true);
      const orderId = String(form.getFieldValue('orderId') || '').trim();
      if (!orderId) { message.error('请选择订单号'); return; }
      if (!(await ensureOrderUnlockedById(orderId))) return;

      const items = batchSelectedBundleQrs
        .map((qr) => ({ cuttingBundleQrCode: qr, warehousingQuantity: Number(batchQtyByQr[qr] || 0) || 0 }))
        .filter((it) => (Number(it.warehousingQuantity || 0) || 0) > 0);
      if (!items.length) { message.error('质检数量必须大于0'); return; }

      const res = await api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/batch', {
        orderId, warehousingType: 'manual', items,
      });
      if (res.code === 200) {
        message.success('批量合格质检成功');
        intelligenceApi.feedback({ orderId: String(orderId || ''), stageName: '入库', actualFinishTime: new Date().toISOString(), actualResult: 'success' }).catch(() => {});
        onSuccess();
        onCancel();
      } else {
        message.error(res.message || '批量入库失败');
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        message.error((error as any).errorFields[0]?.errors[0] || '表单验证失败');
      } else {
        message.error(error instanceof Error ? error.message : '批量入库失败');
      }
    } finally { setSubmitLoading(false); }
  };

  const handleBatchUnqualifiedSubmit = async (defectCategory: string, defectRemark: string, unqualifiedImageUrls?: string[]) => {
    if (!batchSelectedBundleQrs.length) { message.warning('请先添加菲号'); return; }
    if (batchSelectedHasBlocked) { message.warning('次品待返修菲号请单条处理'); return; }
    try {
      setSubmitLoading(true);
      const orderId = String(form.getFieldValue('orderId') || '').trim();
      if (!orderId) { message.error('请选择订单号'); return; }
      if (!(await ensureOrderUnlockedById(orderId))) return;

      const items = batchSelectedBundleQrs
        .map((qr) => ({ cuttingBundleQrCode: qr, warehousingQuantity: Number(batchQtyByQr[qr] || 0) || 0 }))
        .filter((it) => (Number(it.warehousingQuantity || 0) || 0) > 0);
      if (!items.length) { message.error('质检数量必须大于0'); return; }

      const res = await api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/batch-unqualified', {
        orderId, warehousingType: 'manual', items, defectCategory, defectRemark,
        unqualifiedImageUrls: unqualifiedImageUrls || '[]',
      });
      if (res.code === 200) {
        message.success('批量不合格质检成功');
        onSuccess();
        onCancel();
      } else {
        message.error(res.message || '批量不合格质检失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '批量不合格质检失败');
    } finally { setSubmitLoading(false); }
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values: any = await form.validateFields();
      if (!(await ensureOrderUnlockedById(values.orderId))) return;

      const urls = unqualifiedFileList.map((f) => String((f as any)?.url || '').trim()).filter(Boolean).slice(0, 4);
      const warehousingQty = Number(values.warehousingQuantity || 0) || 0;
      const unqualifiedQty = Math.max(0, Math.min(warehousingQty, Number(values.unqualifiedQuantity || 0) || 0));
      const qualifiedQty = Math.max(0, warehousingQty - unqualifiedQty);

      const payload: any = {
        ...values,
        unqualifiedQuantity: unqualifiedQty,
        qualifiedQuantity: qualifiedQty,
        warehousingQuantity: warehousingQty,
        qualityStatus: unqualifiedQty > 0 ? 'unqualified' : 'qualified',
        unqualifiedImageUrls: JSON.stringify(urls),
        defectCategory: unqualifiedQty > 0 ? String(values.defectCategory || '').trim() : '',
        defectRemark: unqualifiedQty > 0 ? String(values.defectRemark || '').trim() : '',
      };

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
        if (!currentWarehousing?.id) {
          intelligenceApi.feedback({
            orderId: String(values.orderId || ''), orderNo: String(values.orderNo || ''),
            stageName: '入库', actualFinishTime: new Date().toISOString(), actualResult: 'success',
          }).catch(() => {});
        }
        onSuccess();
        onCancel();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        message.error((error as any).errorFields[0]?.errors[0] || '表单验证失败');
      } else {
        message.error(error instanceof Error ? error.message : '保存失败');
      }
    } finally { setSubmitLoading(false); }
  };

  return { submitLoading, handleBatchQualifiedSubmit, handleBatchUnqualifiedSubmit, handleSubmit };
};
