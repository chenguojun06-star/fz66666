import { useEffect, useState } from 'react';
import { App, Form } from 'antd';
import dayjs from 'dayjs';
import {
  expenseReimbursementApi,
  type ExpenseReimbursement,
  type ExpenseReimbursementDoc,
  type RecognizeDocResult,
} from '@/services/finance/expenseReimbursementApi';

interface UploadedDoc { tempId: string; docId?: string; imageUrl?: string; recognizing: boolean; }

export const useExpenseForm = (onRefresh: () => void, reportSmartError: (title: string, reason?: string, code?: string) => void) => {
  const { message } = App.useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExpenseReimbursement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docList, setDocList] = useState<ExpenseReimbursementDoc[]>([]);

  useEffect(() => {
    if (editingRecord?.id) {
      expenseReimbursementApi.getDocs(editingRecord.id)
        .then(res => { if (res.code === 200) setDocList(res.data || []); })
        .catch((err) => { console.warn('[ExpenseReim] 编辑凭证加载失败:', err?.message || err); });
    } else {
      setDocList([]);
    }
  }, [editingRecord]);

  const openForm = (record?: ExpenseReimbursement) => {
    if (record) {
      setEditingRecord(record);
      form.setFieldsValue({ ...record, expenseDate: record.expenseDate ? dayjs(record.expenseDate) : undefined });
    } else {
      setEditingRecord(null);
      form.resetFields();
      form.setFieldsValue({ paymentMethod: 'bank_transfer' });
      setUploadedDocs([]);
    }
    setFormOpen(true);
  };

  const handleDocUpload = async (file: File) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploadedDocs(prev => [...prev, { tempId, recognizing: true }]);
    try {
      const res = await expenseReimbursementApi.recognizeDoc(file);
      if (res.code === 200 && res.data) {
        const d = res.data as RecognizeDocResult;
        setUploadedDocs(prev => prev.map(doc =>
          doc.tempId === tempId ? { tempId, docId: d.docId, imageUrl: d.imageUrl, recognizing: false } : doc,
        ));
        const fields: Record<string, unknown> = {};
        if (d.recognizedAmount && !form.getFieldValue('amount')) fields.amount = d.recognizedAmount;
        if (d.recognizedDate && !form.getFieldValue('expenseDate')) fields.expenseDate = dayjs(d.recognizedDate);
        if (d.recognizedTitle && !form.getFieldValue('title')) fields.title = d.recognizedTitle;
        if (d.recognizedType && !form.getFieldValue('expenseType')) fields.expenseType = d.recognizedType;
        if (Object.keys(fields).length > 0) {
          form.setFieldsValue(fields);
          message.success('AI已自动识别凭证信息，请确认后提交');
        } else {
          message.success('凭证上传成功');
        }
      } else {
        setUploadedDocs(prev => prev.filter(doc => doc.tempId !== tempId));
        message.error(res.message || '识别失败，请重新上传');
      }
    } catch (e: unknown) {
      setUploadedDocs(prev => prev.filter(doc => doc.tempId !== tempId));
      message.error(`上传失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
    return false;
  };

  const handleFormSubmit = async () => {
    if (!editingRecord && !uploadedDocs.some(d => d.docId)) {
      message.error('请先上传报销凭证图片');
      return;
    }
    if (uploadedDocs.some(d => d.recognizing)) {
      message.warning('凭证上传中，请稍候...');
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const data: Partial<ExpenseReimbursement> = { ...values, expenseDate: values.expenseDate?.format('YYYY-MM-DD') };

      let res;
      if (editingRecord?.id) {
        data.id = editingRecord.id;
        res = await expenseReimbursementApi.update(data as ExpenseReimbursement);
      } else {
        res = await expenseReimbursementApi.create(data as ExpenseReimbursement);
      }

      if (res.code === 200) {
        if (!editingRecord && uploadedDocs.length > 0 && res.data?.id) {
          try {
            const docIds = uploadedDocs.filter(d => d.docId).map(d => d.docId!);
            if (docIds.length > 0) {
              await expenseReimbursementApi.linkDocs(docIds, res.data.id, res.data.reimbursementNo || '');
            }
          } catch { /* 凭证关联失败不阻断主流程 */ }
        }
        message.success(editingRecord ? '更新成功' : '提交成功');
        setFormOpen(false);
        onRefresh();
      } else {
        reportSmartError('报销单提交失败', res.message || '请检查表单后重试', 'EXPENSE_FORM_SUBMIT_FAILED');
        message.error(res.message || '操作失败');
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('报销单提交失败', errMsg, 'EXPENSE_FORM_SUBMIT_EXCEPTION');
      message.error(err instanceof Error ? err.message : '报销单提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    formOpen, editingRecord, submitting, form, uploadedDocs, docList,
    setFormOpen, setUploadedDocs, openForm, handleDocUpload, handleFormSubmit,
  };
};
