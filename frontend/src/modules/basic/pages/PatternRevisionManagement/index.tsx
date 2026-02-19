import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Tag,
  message,
  Modal,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import dayjs from 'dayjs';
import type {
  PatternRevision,
  PatternRevisionQueryParams,
} from '@/types/patternRevision';
import {
  REVISION_TYPE_OPTIONS,
  REVISION_STATUS_OPTIONS,
  getRevisionTypeLabel,
  getRevisionStatusLabel,
  getRevisionStatusColor,
} from '@/types/patternRevision';

const { TextArea } = Input;
const { confirm } = Modal;

/**
 * 纸样修改记录管理页面
 */
const PatternRevisionManagement: React.FC = () => {
  const { isMobile } = useViewport();
  const [form] = Form.useForm();
  const [queryForm] = Form.useForm();

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PatternRevision[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
      } catch (error: any) {
        const err = error as Error;
        message.error(err?.message || '获取数据失败');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, queryForm]
  );

  useEffect(() => {
    fetchList();
  }, []);

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
    } catch (error: any) {
      // Form validation error or API error
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return; // Form validation error, don't show message
      }
      const err = error as Error;
      message.error(err?.message || '操作失败');
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
      okType: 'danger',
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
        } catch (error: any) {
          const err = error as Error;
          message.error(err?.message || '删除失败');
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
        } catch (error: any) {
          const err = error as Error;
          message.error(err?.message || '提交失败');
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
        } catch (error: any) {
          const err = error as Error;
          message.error(err?.message || '审核失败');
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
      okType: 'danger',
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
        } catch (error: any) {
          const err = error as Error;
          message.error(err?.message || '操作失败');
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
        } catch (error: any) {
          const err = error as Error;
          message.error(err?.message || '操作失败');
        }
      },
    });
  };

  // 表格列定义
  const columns: ColumnsType<PatternRevision> = [
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      fixed: isMobile ? undefined : 'left',
    },
    {
      title: '版本号',
      dataIndex: 'revisionNo',
      key: 'revisionNo',
      width: 100,
    },
    {
      title: '修改类型',
      dataIndex: 'revisionType',
      key: 'revisionType',
      width: 100,
      render: (type: string) => {
        const option = REVISION_TYPE_OPTIONS.find((opt) => opt.value === type);
        return <Tag color={option?.color}>{getRevisionTypeLabel(type)}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getRevisionStatusColor(status)}>
          {getRevisionStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: '修改原因',
      dataIndex: 'revisionReason',
      key: 'revisionReason',
      width: 200,
      ellipsis: true,
    },
    {
      title: '维护人',
      dataIndex: 'maintainerName',
      key: 'maintainerName',
      width: 100,
    },
    {
      title: '维护时间',
      dataIndex: 'maintainTime',
      key: 'maintainTime',
      width: 160,
      render: (time: string) => formatDateTime(time),
    },
    {
      title: '修改日期',
      dataIndex: 'revisionDate',
      key: 'revisionDate',
      width: 110,
    },
    {
      title: '预计完成',
      dataIndex: 'expectedCompleteDate',
      key: 'expectedCompleteDate',
      width: 110,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (time: string) => formatDateTime(time),
    },
    {
      title: '操作',
      key: 'action',
      fixed: isMobile ? undefined : 'right',
      width: 200,
      render: (_, record) => {
        const actions = [];

        // 查看
        actions.push({
          label: '查看',
          onClick: () => handleView(record),
        });

        // 编辑（仅草稿）
        if (record.status === 'DRAFT') {
          actions.push({
            label: '编辑',
            onClick: () => handleEdit(record),
          });
        }

        // 提交审核（仅草稿）
        if (record.status === 'DRAFT') {
          actions.push({
            label: '提交',
            onClick: () => handleSubmit(record),
          });
        }

        // 审核操作（仅已提交）
        if (record.status === 'SUBMITTED') {
          actions.push({
            label: '通过',
            onClick: () => handleApprove(record),
          });
          actions.push({
            label: '拒绝',
            onClick: () => handleReject(record),
            danger: true,
          });
        }

        // 完成（仅已审核）
        if (record.status === 'APPROVED') {
          actions.push({
            label: '完成',
            onClick: () => handleComplete(record),
          });
        }

        // 删除（仅草稿）
        if (record.status === 'DRAFT') {
          actions.push({
            label: '删除',
            onClick: () => handleDelete(record),
            danger: true,
          });
        }

        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <Layout>
      {/* contextHolder 已注释，不再需要 */}
      <Card>
        <Space orientation="vertical" style={{ width: '100%' }} size="large">
          {/* 标题 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>纸样修改记录</h2>
            <Button type="primary" onClick={handleCreate}>
              新增修改记录
            </Button>
          </div>

          {/* 查询表单 */}
          <Form form={queryForm} layout="inline">
            <Form.Item name="styleNo" label="款号">
              <Input placeholder="请输入款号" allowClear style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择" allowClear style={{ width: 120 }}>
                {REVISION_STATUS_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="revisionType" label="修改类型">
              <Select placeholder="请选择" allowClear style={{ width: 120 }}>
                {REVISION_TYPE_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="maintainerName" label="维护人">
              <Input placeholder="请输入" allowClear style={{ width: 120 }} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" onClick={() => fetchList({ page: 1 })}>
                  查询
                </Button>
                <Button
                  onClick={() => {
                    queryForm.resetFields();
                    fetchList({ page: 1 });
                  }}
                >
                  重置
                </Button>
              </Space>
            </Form.Item>
          </Form>

          {/* 表格 */}
          <ResizableTable
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={loading}
            scroll={{ x: 'max-content' }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps || 10);
                fetchList({ page: p, pageSize: ps });
              },
            }}
          />
        </Space>
      </Card>

      {/* 编辑/查看弹窗 */}
      <ResizableModal
        title={
          modalMode === 'create'
            ? '新增修改记录'
            : modalMode === 'edit'
            ? '编辑修改记录'
            : '查看修改记录'
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={modalMode === 'view' ? undefined : handleSave}
        okText="保存"
        cancelText={modalMode === 'view' ? '关闭' : '取消'}
        confirmLoading={saving}
        defaultWidth="30vw"
        defaultHeight="40vh"
      >
        <Form
          form={form}
          layout="vertical"
          disabled={modalMode === 'view'}
        >
          <Form.Item
            name="styleNo"
            label="款号"
            rules={[{ required: true, message: '请输入款号' }]}
          >
            <Input placeholder="请输入款号" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="revisionNo" label="版本号">
              <Input placeholder="自动生成" />
            </Form.Item>
            <Form.Item
              name="revisionType"
              label="修改类型"
              rules={[{ required: true, message: '请选择修改类型' }]}
            >
              <Select placeholder="请选择">
                {REVISION_TYPE_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="revisionDate" label="修改日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            name="revisionReason"
            label="修改原因"
            rules={[{ required: true, message: '请输入修改原因' }]}
          >
            <TextArea rows={3} placeholder="请描述修改原因" />
          </Form.Item>

          <Form.Item name="revisionContent" label="修改内容">
            <TextArea rows={4} placeholder="请详细描述修改内容" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="patternMakerName" label="纸样师傅">
              <Input placeholder="请输入纸样师傅姓名" />
            </Form.Item>
            <Form.Item name="expectedCompleteDate" label="预计完成日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="其他备注信息" />
          </Form.Item>

          {/* 查看模式显示额外信息 */}
          {modalMode === 'view' && currentRecord && (
            <>
              {currentRecord.maintainerName && (
                <Form.Item label="维护信息">
                  <div>
                    维护人：{currentRecord.maintainerName} |{' '}
                    维护时间：{formatDateTime(currentRecord.maintainTime)}
                  </div>
                </Form.Item>
              )}
              {currentRecord.submitterName && (
                <Form.Item label="提交信息">
                  <div>
                    提交人：{currentRecord.submitterName} |{' '}
                    提交时间：{formatDateTime(currentRecord.submitTime)}
                  </div>
                </Form.Item>
              )}
              {currentRecord.approverName && (
                <Form.Item label="审核信息">
                  <div>
                    审核人：{currentRecord.approverName} |{' '}
                    审核时间：{formatDateTime(currentRecord.approvalTime)}
                  </div>
                  {currentRecord.approvalComment && (
                    <div style={{ marginTop: 8 }}>
                      审核意见：{currentRecord.approvalComment}
                    </div>
                  )}
                </Form.Item>
              )}
              {currentRecord.actualCompleteDate && (
                <Form.Item label="实际完成日期">
                  <div>{currentRecord.actualCompleteDate}</div>
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default PatternRevisionManagement;
