import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tag, Space, Form, Input, Select, Card, Descriptions, Row, Col, Statistic } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import feedbackService from '@/services/feedbackService';
import type { UserFeedback, FeedbackStats } from '@/services/feedbackService';
import type { ColumnsType } from 'antd/es/table';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';

const FEEDBACK_CATEGORY: Record<string, { label: string; color: string }> = {
  BUG: { label: '缺陷', color: 'red' },
  SUGGESTION: { label: '建议', color: 'blue' },
  QUESTION: { label: '咨询', color: 'orange' },
  OTHER: { label: '其他', color: 'default' },
};

const FEEDBACK_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'default' },
  PROCESSING: { label: '处理中', color: 'processing' },
  RESOLVED: { label: '已解决', color: 'success' },
  CLOSED: { label: '已关闭', color: 'default' },
};

// ========== 用户反馈管理 Tab ==========
const FeedbackTab: React.FC = () => {
  const [data, setData] = useState<UserFeedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [queryParams, setQueryParams] = useState({ page: 1, pageSize: readPageSize(20), status: '', tenantName: '', category: '' });
  const replyModal = useModal<UserFeedback>();
  const detailModal = useModal<UserFeedback>();
  const [replyForm] = Form.useForm();
  const [replying, setReplying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await feedbackService.list(queryParams);
      const d = res?.data || res;
      setData(d?.records || []);
      setTotal(d?.total || 0);
    } catch { message.error('加载反馈列表失败'); } finally { setLoading(false); }
  }, [queryParams]);

  const fetchStats = async () => {
    try {
      const res: any = await feedbackService.stats();
      const d = res?.data || res;
      setStats(d);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchData(); fetchStats(); }, [fetchData]);

  useEffect(() => {
    if (!replyModal.visible || !replyModal.data) {
      replyForm.resetFields();
      return;
    }
    replyForm.setFieldsValue({
      reply: replyModal.data.reply || '',
      status: 'RESOLVED',
    });
  }, [replyForm, replyModal.data, replyModal.visible]);

  const handleReply = async () => {
    const record = replyModal.data;
    if (!record?.id) return;
    try {
      const values = await replyForm.validateFields();
      setReplying(true);
      await feedbackService.reply(record.id, values.reply, values.status || 'RESOLVED');
      message.success('回复成功');
      replyModal.close();
      replyForm.resetFields();
      fetchData();
      fetchStats();
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '回复失败');
    } finally { setReplying(false); }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await feedbackService.updateStatus(id, status);
      message.success('状态已更新');
      fetchData();
      fetchStats();
    } catch { message.error('操作失败'); }
  };

  const columns: ColumnsType<UserFeedback> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '租户', dataIndex: 'tenantName', width: 120, ellipsis: true },
    { title: '提交人', dataIndex: 'userName', width: 80 },
    { title: '来源', dataIndex: 'source', width: 70,
      render: (v: string) => <Tag color={v === 'MINIPROGRAM' ? 'green' : 'blue'}>{v === 'MINIPROGRAM' ? '小程序' : 'PC'}</Tag>,
    },
    { title: '分类', dataIndex: 'category', width: 70,
      render: (v: string) => <Tag color={FEEDBACK_CATEGORY[v]?.color}>{FEEDBACK_CATEGORY[v]?.label || v}</Tag>,
    },
    { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={FEEDBACK_STATUS[v]?.color}>{FEEDBACK_STATUS[v]?.label || v}</Tag>,
    },
    { title: '提交时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: UserFeedback) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '查看', primary: true, onClick: () => detailModal.open(record) },
          { key: 'reply', label: '回复', onClick: () => { replyModal.open(record); } },
        ];
        if (record.status === 'PENDING') {
          actions.push({ key: 'processing', label: '处理中', onClick: () => handleUpdateStatus(record.id!, 'PROCESSING') });
        }
        if (record.status !== 'CLOSED') {
          actions.push({ key: 'close', label: '关闭', onClick: () => handleUpdateStatus(record.id!, 'CLOSED') });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="总反馈" value={stats.total} /></Card></Col>
          <Col span={6}><Card><Statistic title="待处理" value={stats.pending} styles={{ content: { color: stats.pending > 0 ? '#ff4d4f' : undefined } }} /></Card></Col>
          <Col span={6}><Card><Statistic title="处理中" value={stats.processing} styles={{ content: { color: '#1890ff' } }} /></Card></Col>
          <Col span={6}><Card><Statistic title="已解决" value={stats.resolved} styles={{ content: { color: '#52c41a' } }} /></Card></Col>
        </Row>
      )}

      {/* 筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select id="feedbackStatusFilter" style={{ width: 120 }} placeholder="状态" allowClear value={queryParams.status || undefined}
            onChange={v => setQueryParams(p => ({ ...p, page: 1, status: v || '' }))}
            options={[
              { value: 'PENDING', label: '待处理' },
              { value: 'PROCESSING', label: '处理中' },
              { value: 'RESOLVED', label: '已解决' },
              { value: 'CLOSED', label: '已关闭' },
            ]}
          />
          <Select id="feedbackCategoryFilter" style={{ width: 120 }} placeholder="分类" allowClear value={queryParams.category || undefined}
            onChange={v => setQueryParams(p => ({ ...p, page: 1, category: v || '' }))}
            options={[
              { value: 'BUG', label: '缺陷' },
              { value: 'SUGGESTION', label: '建议' },
              { value: 'QUESTION', label: '咨询' },
              { value: 'OTHER', label: '其他' },
            ]}
          />
          <Input.Search style={{ width: 200 }} placeholder="搜索租户名称" allowClear
            onSearch={v => setQueryParams(p => ({ ...p, page: 1, tenantName: v }))}
          />
          <Button onClick={() => { fetchData(); fetchStats(); }}>刷新</Button>
        </Space>
      </Card>

      <ResizableTable
        storageKey="customer-feedback-list"
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: queryParams.page,
          pageSize: queryParams.pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => setQueryParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}
       
      />

      {/* 详情弹窗 */}
      <ResizableModal open={detailModal.visible} title="反馈详情" onCancel={detailModal.close} width="40vw"
        footer={<Button onClick={detailModal.close}>关闭</Button>}
      >
        {detailModal.data && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="ID">{detailModal.data.id}</Descriptions.Item>
            <Descriptions.Item label="来源">
              <Tag color={detailModal.data.source === 'MINIPROGRAM' ? 'green' : 'blue'}>
                {detailModal.data.source === 'MINIPROGRAM' ? '小程序' : 'PC'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="租户">{detailModal.data.tenantName || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交人">{detailModal.data.userName || '-'}</Descriptions.Item>
            <Descriptions.Item label="分类">
              <Tag color={FEEDBACK_CATEGORY[detailModal.data.category]?.color}>
                {FEEDBACK_CATEGORY[detailModal.data.category]?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={FEEDBACK_STATUS[detailModal.data.status || 'PENDING']?.color}>
                {FEEDBACK_STATUS[detailModal.data.status || 'PENDING']?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="标题" span={2}>{detailModal.data.title}</Descriptions.Item>
            <Descriptions.Item label="详细描述" span={2}>
              <div style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{detailModal.data.content}</div>
            </Descriptions.Item>
            <Descriptions.Item label="联系方式" span={2}>{detailModal.data.contact || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交时间">{detailModal.data.createTime}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{detailModal.data.updateTime}</Descriptions.Item>
            {detailModal.data.reply && (
              <>
                <Descriptions.Item label="管理员回复" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#1890ff' }}>{detailModal.data.reply}</div>
                </Descriptions.Item>
                <Descriptions.Item label="回复时间" span={2}>{detailModal.data.replyTime}</Descriptions.Item>
              </>
            )}
          </Descriptions>
        )}
      </ResizableModal>

      {/* 回复弹窗 */}
      <ResizableModal open={replyModal.visible} title={`回复反馈 - ${replyModal.data?.title || ''}`}
        onCancel={replyModal.close} width="40vw" onOk={handleReply} confirmLoading={replying} okText="提交回复"
      >
        {replyModal.data && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{replyModal.data.title}</div>
            <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap' }}>{replyModal.data.content}</div>
          </div>
        )}
        <Form form={replyForm} layout="vertical">
          <Form.Item label="回复内容" name="reply" rules={[{ required: true, message: '请输入回复内容' }]}>
            <Input.TextArea rows={4} placeholder="请输入回复内容" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="设置状态" name="status" initialValue="RESOLVED">
            <Select options={[
              { value: 'PROCESSING', label: '处理中' },
              { value: 'RESOLVED', label: '已解决' },
              { value: 'CLOSED', label: '已关闭' },
            ]} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

export default FeedbackTab;
