import { useState } from 'react';
import { Form } from 'antd';
import api from '@/utils/api';
import { wagePaymentApi } from '@/services/finance/wagePaymentApi';
import type { SmartErrorInfo } from '@/smart/core/types';

interface UseProofModalOptions {
  msg: { success: (text: string) => void; error: (text: string) => void };
  reportSmartError: (title: string, reason?: string, code?: string) => void;
  showSmartErrorNotice: boolean;
  setSmartError: (v: SmartErrorInfo | null) => void;
  fetchPayments: () => void;
  fetchPayables: () => void;
}

export function useProofModal({ msg, reportSmartError, showSmartErrorNotice, setSmartError, fetchPayments, fetchPayables }: UseProofModalOptions) {
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofForm] = Form.useForm();
  const [proofPaymentId, setProofPaymentId] = useState('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofFileList, setProofFileList] = useState<any[]>([]);

  const openProofModal = (paymentId: string) => {
    setProofPaymentId(paymentId);
    proofForm.resetFields();
    setProofFileList([]);
    setProofModalOpen(true);
  };

  const uploadProofImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res: any = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res?.data ?? res;
      if (url) {
        proofForm.setFieldsValue({ proofUrl: url });
        setProofFileList([{ uid: '-1', name: file.name, status: 'done', url }]);
      }
    } catch (err: any) {
      reportSmartError('支付凭证上传失败', err?.message || '请检查文件格式后重试', 'WAGE_PROOF_UPLOAD_FAILED');
      msg.error(`上传凭证失败: ${err?.message || '请检查文件格式'}`);
    }
  };

  const handleConfirmProof = async () => {
    try {
      setProofSubmitting(true);
      const values = proofForm.getFieldsValue();
      await wagePaymentApi.confirmOfflineWithCallback(proofPaymentId, values.proofUrl, values.remark);
      msg.success('已确认支付');
      setProofModalOpen(false);
      fetchPayments();
      fetchPayables();
      if (showSmartErrorNotice) setSmartError(null);
    } catch (err: any) {
      reportSmartError('线下支付确认失败', err?.message || '网络异常或服务不可用，请稍后重试', 'WAGE_PROOF_CONFIRM_FAILED');
      msg.error(err?.message || '操作失败');
    } finally {
      setProofSubmitting(false);
    }
  };

  return {
    proofModalOpen, setProofModalOpen,
    proofForm,
    proofSubmitting,
    proofFileList, setProofFileList,
    openProofModal,
    uploadProofImage,
    handleConfirmProof,
  };
}
