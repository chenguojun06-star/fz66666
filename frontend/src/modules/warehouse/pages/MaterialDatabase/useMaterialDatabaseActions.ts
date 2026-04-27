import { useState, useCallback } from 'react';
import { App, Form } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { MaterialDatabase } from '@/types/production';
import api, { unwrapApiData } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getBaseMaterialType } from '@/utils/materialType';
import { useModal, useRequest } from '@/hooks';

const toLocalDateTimeInputValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export function useMaterialDatabaseActions(deps: {
  dataList: MaterialDatabase[];
  fetchList: () => void;
}) {
  const { dataList, fetchList } = deps;
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const { visible, data: currentMaterial, open, close } = useModal<MaterialDatabase>();
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);
  const [returnTarget, setReturnTarget] = useState<MaterialDatabase | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);

  const generateLocalMaterialCode = useCallback((materialType: string): string => {
    const prefixMap: Record<string, string> = { fabric: 'M', lining: 'L', accessory: 'F' };
    const baseType = (materialType || 'accessory').toLowerCase().startsWith('lining') ? 'lining'
      : (materialType || 'accessory').toLowerCase().startsWith('fabric') ? 'fabric' : 'accessory';
    const prefix = prefixMap[baseType] || 'F';
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const existingCodes = dataList
      .filter(item => {
        const mt = String(item.materialType || '').toLowerCase();
        if (baseType === 'fabric') return mt.startsWith('fabric');
        if (baseType === 'lining') return mt.startsWith('lining');
        return mt.startsWith('accessory') || (!mt.startsWith('fabric') && !mt.startsWith('lining'));
      })
      .map(item => String(item.materialCode || ''))
      .filter(code => code.startsWith(prefix + dateStr));
    let maxSeq = 0;
    existingCodes.forEach(code => { try { const seqPart = code.substring((prefix + dateStr).length); const seq = parseInt(seqPart, 10); if (!isNaN(seq) && seq > maxSeq) maxSeq = seq; } catch { /* ignore */ } });
    const nextSeq = maxSeq + 1;
    return `${prefix}${dateStr}${String(nextSeq).padStart(3, '0')}`;
  }, [dataList]);

  const fetchMaterialCode = useCallback(async (materialType: string) => {
    if (!materialType) return;
    try {
      const res = await api.get<{ code: number; data: string }>('/material/database/generate-code', { params: { materialType } });
      const code = unwrapApiData<string>(res as any, '获取物料编号失败');
      if (code) { form.setFieldsValue({ materialCode: code }); return; }
    } catch { /* fallback to local */ }
    const localCode = generateLocalMaterialCode(materialType);
    if (localCode) form.setFieldsValue({ materialCode: localCode });
  }, [form, generateLocalMaterialCode]);

  const uploadImage = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.code === 200 && res.data) {
        form.setFieldsValue({ image: res.data });
        setImageFiles([{ uid: '-1', name: file.name, status: 'done', url: getFullAuthedFileUrl(res.data) }]);
      } else { message.error(res.message || '上传失败'); }
    } catch (e) { message.error((e as Error)?.message || '上传失败'); }
  }, [form, message]);

  const openDialog = useCallback((dialogMode: 'create' | 'edit' | 'copy', record?: MaterialDatabase) => {
    if ((dialogMode === 'edit' || dialogMode === 'copy') && record) {
      open(dialogMode === 'copy' ? undefined as any : record);
      const formValues: Record<string, unknown> = { ...record, materialType: getBaseMaterialType(record.materialType || 'accessory') };
      if (dialogMode === 'copy') { delete formValues.id; delete formValues.status; delete formValues.createTime; delete formValues.completedTime; delete formValues.updateTime; formValues.status = 'pending'; }
      form.setFieldsValue(formValues);
      if (dialogMode === 'copy') fetchMaterialCode(getBaseMaterialType(record.materialType || 'accessory'));
      if (record.image) { setImageFiles([{ uid: '-1', name: 'image', status: 'done', url: getFullAuthedFileUrl(record.image) }]); }
      else { setImageFiles([]); }
    } else { open(); form.resetFields(); setImageFiles([]); }
  }, [open, form, fetchMaterialCode]);

  const closeDialog = useCallback(() => { close(); form.resetFields(); setImageFiles([]); }, [close, form]);

  const { run: handleSubmit, loading: submitLoading } = useRequest(
    async () => {
      const values = (await form.validateFields()) as any;
      const status = String(values?.status || 'pending').trim();
      const { createTime: _createTime, completedTime: _completedTime, ...rest } = values as any;
      const payload: Record<string, unknown> = { ...rest, materialType: getBaseMaterialType(values?.materialType || 'accessory'), status: status === 'completed' ? 'completed' : 'pending', image: String(values?.image || '').trim() || undefined };
      const isCopy = !currentMaterial?.id;
      const mode = isCopy ? 'create' : 'edit';
      if (mode === 'create') { unwrapApiData<boolean>(await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload), '新增失败'); return '新增成功'; }
      else { unwrapApiData<boolean>(await api.put<{ code: number; message: string; data: boolean }>('/material/database', { ...payload, id: currentMaterial?.id }), '保存失败'); return '保存成功'; }
    },
    { manual: true, onSuccess: () => { close(); fetchList(); }, onError: (error) => { const formError = error as { errorFields?: Array<{ errors?: string[] }> }; if (formError?.errorFields?.length) { const firstError = formError.errorFields[0]; message.error(firstError?.errors?.[0] || '表单验证失败'); } } }
  );

  const handleDelete = useCallback((record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) { message.error('记录缺少ID'); return; }
    modal.confirm({ width: '30vw', title: '确认删除', content: '删除后不可恢复，是否继续？', okText: '删除', cancelText: '取消', okButtonProps: { danger: true, type: 'default' }, onOk: async () => { unwrapApiData<boolean>(await api.delete<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}`), '删除失败'); message.success('删除成功'); fetchList(); } });
  }, [message, modal, fetchList]);

  const handleComplete = useCallback((record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) { message.error('记录缺少ID'); return; }
    modal.confirm({ width: '30vw', title: '确认完成', content: '确认将该物料标记为已完成？完成后需退回才能再次编辑。', okText: '确认', cancelText: '取消', onOk: async () => { unwrapApiData<boolean>(await api.put<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/complete`), '标记完成失败'); message.success('标记完成成功'); fetchList(); } });
  }, [message, modal, fetchList]);

  const handleReturn = useCallback((record: MaterialDatabase) => { setReturnTarget(record); }, []);

  const handleReturnConfirm = useCallback(async (reason: string) => {
    const id = String(returnTarget?.id || '').trim();
    if (!id) return;
    setReturnLoading(true);
    try { unwrapApiData<boolean>(await api.put<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/return`, reason ? { reason } : {}), '退回失败'); message.success('退回成功'); setReturnTarget(null); fetchList(); }
    finally { setReturnLoading(false); }
  }, [returnTarget, message, fetchList]);

  const handleDisable = useCallback((record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) return;
    modal.confirm({ width: '30vw', title: '确认停用', content: '停用后该物料将不可被选择使用，是否继续？', okText: '停用', cancelText: '取消', okButtonProps: { danger: true, type: 'default' }, onOk: async () => { unwrapApiData<boolean>(await api.put<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/disable`), '停用失败'); message.success('停用成功'); fetchList(); } });
  }, [message, modal, fetchList]);

  const handleEnable = useCallback(async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) return;
    unwrapApiData<boolean>(await api.put<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/enable`), '启用失败');
    message.success('启用成功');
    fetchList();
  }, [message, fetchList]);

  return {
    form, visible, currentMaterial, imageFiles, setImageFiles,
    returnTarget, setReturnTarget, returnLoading,
    submitLoading, fetchMaterialCode, uploadImage,
    openDialog, closeDialog, handleSubmit,
    handleDelete, handleComplete, handleReturn, handleReturnConfirm,
    handleDisable, handleEnable, toLocalDateTimeInputValue,
  };
}
