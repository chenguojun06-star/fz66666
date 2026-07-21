import { useCallback, useEffect, useState } from 'react';
import { Form, Input, Modal, message } from 'antd';
import api from '@/utils/api';
import { useViewport } from '@/utils/useViewport';
import { readPageSize } from '@/utils/pageSizeStore';
import dayjs from 'dayjs';
import type {
  PatternRevision,
  PatternRevisionQueryParams,
} from '@/types/patternRevision';

const { confirm } = Modal;

/**
 * 纸样修改记录管理 - 业务逻辑 Hook
 */
export function usePatternRevisionData() {
  const { isMobile } = useViewport();
  const [form] = Form.useForm();
  const [queryForm] = Form.useForm();

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PatternRevision[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [currentRecord, setCurrentRecord] = useState<PatternRevision | null>(null);
  const [saving, setSaving] = useState(false);

  // 获取数据列表
  const fetchList = useCallback(
    async (params?: Partial<PatternRevisionQueryParams>) => {
      setLoading(true);
      try {
        const queryParams = {
          page: params?.page || page,
          pageSize: params?.pageSize || pageSize,
          ...queryForm.getFieldsValue(),
          ...params,
        };

        const response = await api.get<{
          code: number;
          data: { records: PatternRevision[]; total: number };
          message?: string;
        }>('/pattern-revision/list', { params: queryParams });

        if (response.code === 200) {
          setData(response.data.records || []);
          setTotal(response.data.total || 0);
        } else {
          message.error(response.message || '获取数据失败');
        }
      } catch (error: unknown) {
        message.error(error instanceof Error ? error.message : '获取数据失败');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, queryForm]
  );

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 打开新增弹窗
  const handleCreate = () => {
    setModalMode('create');
    setCurrentRecord(null);
    form.resetFields();
    form.setFieldsValue({ status: 'DRAFT', revisionType: 'MINOR' });
    setModalOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (record: PatternRevision) => {
    setModalMode('edit');
    setCurrentRecord(record);
    form.setFieldsValue({
      ...record,
      revisionDate: record.revisionDate ? dayjs(record.revisionDate) : null,
      expectedCompleteDate: record.expectedCompleteDate
        ? dayjs(record.expectedCompleteDate)
        : null,
    });
    setModalOpen(true);
  };

  // 打开查看弹窗
  const handleView = (record: PatternRevision) => {
    setModalMode('view');
    setCurrentRecord(record);
    form.setFieldsValue({
      ...record,
      revisionDate: record.revisionDate ? dayjs(record.revisionDate) : null,
      expectedCompleteDate: record.expectedCompleteDate
        ? dayjs(record.expectedCompleteDate)
        : null,
      actualCompleteDate: record.actualCompleteDate
        ? dayjs(record.actualCompleteDate)
        : null,
    });
    setModalOpen(true);
  };

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        revisionDate: values.revisionDate
          ? dayjs(values.revisionDate).format('YYYY-MM-DD')
          : null,
        expectedCompleteDate: values.expectedCompleteDate
          ? dayjs(values.expectedCompleteDate).format('YYYY-MM-DD')
          : null,
      };

      let response;
      if (modalMode === 'create') {
        response = await api.post<{ code: number; message?: string }>(
          '/pattern-revision',
          payload
        );
      } else {
        response = await api.put<{ code: number; message?: string }>(
          `/pattern-revision/${currentRecord?.id}`,
          payload
        );
      }

      if (response.code === 200) {
        message.success(modalMode === 'create' ? '创建成功' : '更新成功');
        setModalOpen(false);
        fetchList({ page: 1 });
      } else {
        message.error(response.message || '操作失败');
      }
    } catch (error: unknown) {
      // Form validation error or API error
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return; // Form validation error, don't show message
      }
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  // 删除
  const handleDelete = (record: PatternRevision) => {
    confirm({
      title: '确认删除',
      content: `确定要删除版本 ${record.revisionNo} 吗？`,
      okText: '删除',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await api.delete<{ code: number; message?: string }>(
            `/pattern-revision/${record.id}`
          );
          if (response.code === 200) {
            message.success('删除成功');
            fetchList();
          } else {
            message.error(response.message || '删除失败');
          }
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '删除失败');
        }
      },
    });
  };

  // 提交审核
  const handleSubmit = (record: PatternRevision) => {
    confirm({
      title: '提交审核',
      content: '确定要提交审核吗？',
      okText: '提交',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await api.post<{ code: number; message?: string }>(
            `/pattern-revision/${record.id}/workflow`, undefined, { params: { action: 'submit' } }
          );
          if (response.code === 200) {
            message.success('提交成功');
            fetchList();
          } else {
            message.error(response.message || '提交失败');
          }
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '提交失败');
        }
      },
    });
  };

  // 审核通过
  const handleApprove = (record: PatternRevision) => {
    let comment = '';
    confirm({
      title: '审核通过',
      content: (
        <Input.TextArea
          rows={3}
          placeholder="审核意见（选填）"
          onChange={(e) => (comment = e.target.value)}
        />
      ),
      okText: '通过',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await api.post<{ code: number; message?: string }>(
            `/pattern-revision/${record.id}/workflow`,
            { comment }, { params: { action: 'approve' } }
          );
          if (response.code === 200) {
            message.success('审核通过');
            fetchList();
          } else {
            message.error(response.message || '审核失败');
          }
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '审核失败');
        }
      },
    });
  };

  // 审核拒绝
  const handleReject = (record: PatternRevision) => {
    let comment = '';
    confirm({
      title: '审核拒绝',
      content: (
        <Input.TextArea
          rows={3}
          placeholder="请输入拒绝原因"
          onChange={(e) => (comment = e.target.value)}
        />
      ),
      okText: '拒绝',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        if (!comment.trim()) {
          message.error('请输入拒绝原因');
          return Promise.reject();
        }
        try {
          const response = await api.post<{ code: number; message?: string }>(
            `/pattern-revision/${record.id}/workflow`,
            { comment }, { params: { action: 'reject' } }
          );
          if (response.code === 200) {
            message.success('已拒绝');
            fetchList();
          } else {
            message.error(response.message || '操作失败');
          }
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '操作失败');
        }
      },
    });
  };

  // 完成修改
  const handleComplete = (record: PatternRevision) => {
    confirm({
      title: '完成修改',
      content: '确定修改已完成吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await api.post<{ code: number; message?: string }>(
            `/pattern-revision/${record.id}/workflow`, undefined, { params: { action: 'complete' } }
          );
          if (response.code === 200) {
            message.success('已完成');
            fetchList();
          } else {
            message.error(response.message || '操作失败');
          }
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '操作失败');
        }
      },
    });
  };

  return {
    isMobile,
    form,
    queryForm,
    loading,
    data,
    total,
    page,
    pageSize,
    modalOpen,
    modalMode,
    currentRecord,
    saving,
    fetchList,
    handleCreate,
    handleEdit,
    handleView,
    handleSave,
    handleDelete,
    handleSubmit,
    handleApprove,
    handleReject,
    handleComplete,
    setPage,
    setPageSize,
    setModalOpen,
  };
}
