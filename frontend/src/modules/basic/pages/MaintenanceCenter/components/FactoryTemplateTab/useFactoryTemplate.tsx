import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { App, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import api from '@/utils/api';
import { sortSizeNames } from '@/utils/api';
import type { TemplateLibrary } from '@/types/style';
import { typeLabel, typeColor } from '../../../TemplateCenter/utils/templateUtils';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { FACTORY_TEMPLATE_TYPE_OPTIONS } from './constants';
import { getDefaultContent } from './utils';

export function useFactoryTemplate() {
  const { modal } = App.useApp();

  const [data, setData] = useState<TemplateLibrary[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [templateType, setTemplateType] = useState('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const prevDebouncedKeywordRef = useRef(debouncedKeyword);
  if (debouncedKeyword !== prevDebouncedKeywordRef.current) {
    prevDebouncedKeywordRef.current = debouncedKeyword;
    setPage(1);
  }

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TemplateLibrary | null>(null);
  const [createType, setCreateType] = useState<string>('process');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingRow, setViewingRow] = useState<TemplateLibrary | null>(null);

  const fetchList = useCallback(async (pg?: number) => {
    setLoading(true);
    try {
      const p = pg ?? page;
      const params: Record<string, unknown> = { page: p, pageSize, isFactoryTemplate: true };
      if (templateType) params.templateType = templateType;
      if (debouncedKeyword) params.keyword = debouncedKeyword;
      const res = await api.get<any>('/template-library/list', { params });
      const d = res?.data ?? res;
      setData(d?.records ?? []);
      setTotal(Number(d?.total ?? 0));
      setPage(p);
    } catch {
      message.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, templateType, debouncedKeyword]);

  useEffect(() => { fetchList(1); }, [templateType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBlank = async (type: string) => {
    setCreateType(type);
    let content = getDefaultContent(type);
    if (type === 'size') {
      try {
        const res = await api.get<any>('/system/dict/list', { params: { dictType: 'size', page: 1, pageSize: 200 } });
        const records = res?.data?.records || (Array.isArray(res?.data) ? res.data : []);
        const labels = records.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        if (labels.length) {
          content = JSON.stringify({ sizes: sortSizeNames(labels), parts: [{ partName: '', measureMethod: '', tolerance: 0.5, values: {} }] });
        }
      } catch (e) { console.error('[FactoryTemplateTab] 加载尺码字典失败:', e); }
    }
    const newTpl: Partial<TemplateLibrary> = {
      templateType: type,
      templateName: '',
      templateKey: `factory_${type}_${Date.now()}`,
      sourceStyleNo: '',
      locked: 0,
      templateContent: content,
    };
    setEditingRow(newTpl as TemplateLibrary);
    setEditOpen(true);
  };

  const handleEdit = async (row: TemplateLibrary) => {
    if (Number(row.locked) === 1) {
      message.error('模板已锁定，如需修改请先退回');
      return;
    }
    try {
      const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
      if (res?.code === 200 && res.data) {
        setEditingRow(res.data);
        setEditOpen(true);
      }
    } catch {
      setEditingRow(row);
      setEditOpen(true);
    }
  };

  const handleView = (row: TemplateLibrary) => {
    setViewingRow(row);
    setViewOpen(true);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDelete = (row: TemplateLibrary) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除模板「${row.templateName || row.templateKey}」吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/template-library/${row.id}`);
          message.success('删除成功');
          fetchList();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleLock = async (row: TemplateLibrary) => {
    try {
      await api.post(`/template-library/${row.id}/lock`);
      message.success('锁定成功');
      fetchList();
    } catch {
      message.error('锁定失败');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleRollback = async (row: TemplateLibrary) => {
    try {
      await api.post(`/template-library/${row.id}/rollback`, { reason: '工厂模板退回编辑' });
      message.success('退回成功');
      fetchList();
    } catch {
      message.error('退回失败');
    }
  };

  const columns = useMemo(() => [
    {
      title: '模板名称',
      dataIndex: 'templateName',
      key: 'templateName',
      width: 200,
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '类型',
      dataIndex: 'templateType',
      key: 'templateType',
      width: 100,
      render: (type: string) => <Tag color={typeColor(type)}>{typeLabel(type)}</Tag>,
    },
    {
      title: '来源款号',
      dataIndex: 'sourceStyleNo',
      key: 'sourceStyleNo',
      width: 120,
      render: (text: string) => text || <Tag>工厂自建</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'locked',
      key: 'locked',
      width: 80,
      render: (locked: number) => Number(locked) === 1
        ? <Tag color="green">已锁定</Tag>
        : <Tag color="orange">编辑中</Tag>,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 160,
      render: (text: string) => text || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, row: TemplateLibrary) => {
        const isLocked = Number(row.locked) === 1;
        const actions: RowAction[] = [
          { key: 'view', label: '查看', onClick: () => handleView(row) },
        ];
        if (!isLocked) {
          actions.push({ key: 'edit', label: '编辑', onClick: () => handleEdit(row) });
        }
        if (isLocked) {
          actions.push({ key: 'rollback', label: '退回', onClick: () => handleRollback(row) });
        } else {
          actions.push({ key: 'lock', label: '锁定', onClick: () => handleLock(row) });
        }
        actions.push({ key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(row) });
        return <RowActions actions={actions} maxInline={2} />;
      },
    },
  ], [handleDelete, handleLock, handleRollback]);

  const createMenuItems = useMemo(() => FACTORY_TEMPLATE_TYPE_OPTIONS.map(opt => ({
    key: opt.value,
    label: <span><PlusOutlined style={{ marginRight: 8 }} />{opt.label}</span>,
    onClick: () => handleCreateBlank(opt.value),
  })), []);

  return {
    data,
    loading,
    page,
    pageSize,
    setPageSize,
    total,
    templateType,
    setTemplateType,
    keyword,
    setKeyword,
    fetchList,
    editOpen,
    setEditOpen,
    editingRow,
    setEditingRow,
    createType,
    viewOpen,
    setViewOpen,
    viewingRow,
    setViewingRow,
    columns,
    createMenuItems,
  };
}
