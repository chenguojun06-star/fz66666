import { useState, useEffect, useMemo, useCallback } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { useModal } from '@/hooks';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { readPageSize } from '@/utils/pageSizeStore';
import type { DictItem } from './types';
import { dedupeDictItems, getDictTypeLabel, getLocalData } from './helpers';

export interface UseDictManageDataReturn {
  loading: boolean;
  dataSource: DictItem[];
  dictPageSize: number;
  setDictPageSize: (size: number) => void;
  smartError: SmartErrorInfo | null;
  showSmartErrorNotice: boolean;
  showDictAutocollect: boolean;
  dictModal: ReturnType<typeof useModal<DictItem>>;
  form: ReturnType<typeof Form.useForm>[0];
  selectedType: string;
  setSelectedType: (type: string) => void;
  fetchData: (dictType?: string) => Promise<void>;
  handleAdd: () => void;
  handleEdit: (record: DictItem) => void;
  handleDelete: (record: DictItem) => void;
  handleSave: () => Promise<void>;
  handleImportPreset: () => Promise<void>;
}

export const useDictManageData = (): UseDictManageDataReturn => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<DictItem[]>([]);
  const [dictPageSize, setDictPageSize] = useState(readPageSize(50));
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showDictAutocollect = useMemo(() => isSmartFeatureEnabled('smart.dict.autocollect.enabled'), []);
  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  }, [showSmartErrorNotice]);

  const dictModal = useModal<DictItem>();

  const [selectedType, setSelectedType] = useState<string>('category');
  const [form] = Form.useForm();

  const fetchData = useCallback(async (dictType: string = selectedType) => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: DictItem[] | { records: DictItem[]; total: number } }>('/system/dict/list', {
        params: { dictType, page: 1, pageSize: 1000 }
      });
      if (res.code === 200) {
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data?.records || []);
        setDataSource(dedupeDictItems(list));
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        const localData = getLocalData(dictType);
        setDataSource(dedupeDictItems(localData));
        reportSmartError('字典数据加载失败', '服务返回异常，已回退本地预置数据', 'SYSTEM_DICT_LIST_FAILED');
      }
    } catch (error) {
      const localData = getLocalData(dictType);
      setDataSource(dedupeDictItems(localData));
      reportSmartError('字典数据加载失败', '网络异常，已回退本地预置数据', 'SYSTEM_DICT_LIST_EXCEPTION');
    } finally {
      setLoading(false);
    }
  }, [selectedType, showSmartErrorNotice, reportSmartError]);

  useEffect(() => {
    fetchData(selectedType);
  }, [selectedType, fetchData]);

  useEffect(() => {
    if (!dictModal.visible) {
      form.resetFields();
      return;
    }
    if (dictModal.data) {
      form.setFieldsValue(dictModal.data);
      return;
    }
    form.setFieldsValue({ dictType: selectedType });
  }, [dictModal.data, dictModal.visible, form, selectedType]);

  // 新建
  const handleAdd = () => {
    dictModal.open(null as unknown as DictItem | undefined);
  };

  // 编辑
  const handleEdit = (record: DictItem) => {
    dictModal.open(record);
  };

  // 删除
  const handleDelete = (record: DictItem) => {
    modal.confirm({
      width: '30vw',
      title: '确认删除',
      content: `确定要删除字典项"${record.dictLabel}"吗？`,
      onOk: async () => {
        try {
          await api.delete(`/system/dict/${record.id}`);
          message.success('删除成功');
          fetchData();
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '删除失败，请重试');
        }
      }
    });
  };

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (dictModal.data?.id) {
        await api.put(`/system/dict/${dictModal.data.id}`, values);
        message.success('更新成功');
      } else {
        await api.post('/system/dict', values);
        message.success('新建成功');
      }

      dictModal.close();
      fetchData();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        message.error('请检查表单输入');
      } else {
        // 展示后端返回的真实错误（如"字典编码已存在"）
        const errMsg: string = error instanceof Error ? error.message : '';
        if (errMsg) {
          message.error(errMsg);
        } else {
          message.error('保存失败，请检查输入是否有重复');
        }
      }
    }
  };

  // 批量导入预设数据（跳过已存在项，展示真实结果）
  const handleImportPreset = async () => {
    const typeLabel = getDictTypeLabel(selectedType);
    const localData = getLocalData(selectedType);
    if (localData.length === 0) {
      message.warning(`暂无「${typeLabel}」的预设数据`);
      return;
    }
    modal.confirm({
      width: '30vw',
      title: '导入预设数据',
      content: `将把系统内置的「${typeLabel}」预设选项（共 ${localData.length} 条）写入数据库，已存在的条目会自动跳过。确定继续？`,
      onOk: async () => {
        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;
        for (const item of localData) {
          try {
            await api.post('/system/dict', item);
            successCount++;
          } catch (err: unknown) {
            // 后端返回 400/已存在 = 重复条目，正常跳过；其他错误计入失败
            const msg: string = err instanceof Error ? err.message : '';
            const isConflict = msg.includes('已存在') || msg.includes('重复');
            if (isConflict) {
              skipCount++;
            } else {
              failCount++;
            }
          }
        }
        fetchData();
        if (successCount > 0 && skipCount === 0 && failCount === 0) {
          message.success(`导入成功，共新增 ${successCount} 条`);
        } else if (successCount === 0 && failCount === 0) {
          message.info(`所有 ${skipCount} 条预设数据已存在，无需重复导入`);
        } else {
          message.success(
            `导入完成：新增 ${successCount} 条，跳过已存在 ${skipCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}`
          );
        }
      }
    });
  };

  return {
    loading,
    dataSource,
    dictPageSize,
    setDictPageSize,
    smartError,
    showSmartErrorNotice,
    showDictAutocollect,
    dictModal,
    form,
    selectedType,
    setSelectedType,
    fetchData,
    handleAdd,
    handleEdit,
    handleDelete,
    handleSave,
    handleImportPreset,
  };
};
