import React, { useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button, Space, Tag, Tooltip, Statistic, Card, Row, Col, Input, Select, Modal, message } from 'antd';
import { CreditCardOutlined, ClockCircleOutlined, CheckCircleOutlined, ThunderboltOutlined, RobotOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import { useRequest } from '@/hooks/useRequest';

interface RefundRequest {
  id: number;
  orderNo: string;
  platformOrderNo: string;
  platform: string;
  skuCode: string;
  quantity: number;
  payAmount: number;
  status: number;
  sellerRemark: string;
  createTime: string;
  hasShipped: boolean;
  aiDecision: string;
  aiReason: string;
}

interface RefundStats {
  totalRequests: number;
  pendingCount: number;
  autoApprovedCount: number;
  manualReviewCount: number;
  totalRefundAmount: number;
}

const SmartRefundTab: React.FC = () => {
  const [searchOrder, setSearchOrder] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<RefundRequest | null>(null);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const { data: refunds, loading: refundsLoading, run: fetchRefunds, refresh } = useRequest<RefundRequest[]>(
    () => axios.get('/api/ecommerce/refund/list').then(res => res.data?.data || []),
    { manual: false }
  );

  const { data: stats, run: fetchStats } = useRequest<RefundStats>(
    () => axios.get('/api/ecommerce/refund/stats').then(res => res.data?.data || {}),
    { manual: false }
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleAutoProcess = useCallback(async () => {
    setAutoProcessing(true);
    try {
      const res = await axios.post('/api/ecommerce/refund/auto-process');
      const msg = res.data?.message || '自动退款处理完成';
      message.success(msg);
      await fetchRefunds();
      await fetchStats();
    } catch {
      message.error('处理失败');
    } finally {
      setAutoProcessing(false);
    }
  }, [fetchRefunds, fetchStats]);

  const handleApprove = useCallback(async (record: RefundRequest) => {
    setCurrentRecord(record);
    setModalOpen(true);
  }, []);

  const handleConfirmApprove = useCallback(async () => {
    if (!currentRecord) return;
    setApproving(true);
    try {
      const res = await axios.post(`/api/ecommerce/refund/${currentRecord.orderNo}/approve`);
      const msg = res.data?.message || '退款已执行';
      message.success(msg);
      setModalOpen(false);
      setCurrentRecord(null);
      await fetchRefunds();
      await fetchStats();
    } catch {
      message.error('处理失败');
    } finally {
      setApproving(false);
    }
  }, [currentRecord, fetchRefunds, fetchStats]);

  const handleReject = useCallback(async (record: RefundRequest) => {
    setRejecting(true);
    try {
      const res = await axios.post(`/api/ecommerce/refund/${record.orderNo}/reject`);
      const msg = res.data?.message || '已拒绝退款';
      message.success(msg);
      await fetchRefunds();
      await fetchStats();
    } catch {
      message.error('操作失败');
    } finally {
      setRejecting(false);
    }
  }, [fetchRefunds, fetchStats]);

  const handleRefresh = useCallback(() => {
    refresh();
    fetchStats();
  }, [refresh, fetchStats]);

  const filteredData = useMemo(() => {
    let result = refunds || [];
    if (searchOrder) {
      result = result.filter(r => r.orderNo?.includes(searchOrder) || r.platformOrderNo?.includes(searchOrder));
    }
    if (selectedPlatform) {
      result = result.filter(r => r.platform === selectedPlatform);
    }
    return result;
  }, [refunds, searchOrder, selectedPlatform]);

  const columns: ColumnsType<RefundRequest> = [
    { title: '订单号', dataIndex: 'orderNo', width: 140 },
    { title: '平台订单号', dataIndex: 'platformOrderNo', width: 160 },
    { title: '平台', dataIndex: 'platform', width: 80, render: (v) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: 'SKU编码', dataIndex: 'skuCode', width: 130 },
    { title: '数量', dataIndex: 'quantity', width: 70, align: 'center' as const },
    {
      title: '退款金额', dataIndex: 'payAmount', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>¥{Number(v).toFixed(2)}</span>,
    },
    {
      title: '发货状态', dataIndex: 'hasShipped', width: 80,
      render: (v: boolean) => <Tag color={v ? 'warning' : 'success'}>{v ? '已发货' : '未发货'}</Tag>,
    },
    {
      title: 'AI决策', dataIndex: 'aiDecision', width: 100,
      render: (v: string) => {
        const colorMap: Record<string, string> = { APPROVE: 'success', REJECT: 'error', REVIEW: 'warning' };
        const labelMap: Record<string, string> = { APPROVE: '自动通过', REJECT: '自动拒绝', REVIEW: '人工审核' };
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>;
      },
    },
    {
      title: 'AI理由', dataIndex: 'aiReason', width: 200, ellipsis: true,
      render: (v?: string) => <Tooltip title={v || '-'}><span>{v || '-'}</span></Tooltip>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: number) => {
        const statusMap: Record<number, { color: string; label: string }> = {
          5: { color: 'warning', label: '退款中' },
          4: { color: 'default', label: '已取消' },
          2: { color: 'processing', label: '已发货' },
          1: { color: 'processing', label: '待发货' },
        };
        const s = statusMap[v] || { color: 'default', label: String(v) };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '操作', width: 180, render: (_: unknown, r: RefundRequest) => {
        if (r.status === 5) {
          return (
            <Space>
              <Button size="small" type="primary" loading={approving} onClick={() => handleApprove(r)}>确认退款</Button>
              <Button size="small" danger loading={rejecting} onClick={() => handleReject(r)}>拒绝</Button>
            </Space>
          );
        }
        if (r.status === 4) {
          return <Tag color="default">已取消</Tag>;
        }
        return <Tag color="processing">{r.status}</Tag>;
      },
    },
  ];

  const pendingRefunds = (refunds || []).filter(r => r.status === 5);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-processing-bg) 0%, #f0f5ff 100%)', borderRadius: 12 }}>
            <Statistic
              title="退款申请"
              value={stats?.totalRequests || 0}
              suffix="单"
              prefix={<CreditCardOutlined style={{ color: 'var(--color-primary)' }} />}
              styles={{ content: { color: 'var(--color-primary)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-warning-bg) 0%, #FFFBE6 100%)', borderRadius: 12 }}>
            <Statistic
              title="待处理"
              value={stats?.pendingCount || 0}
              suffix="单"
              prefix={<ClockCircleOutlined style={{ color: 'var(--color-warning)' }} />}
              styles={{ content: { color: 'var(--color-warning)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-success-bg) 0%, #fcffe6 100%)', borderRadius: 12 }}>
            <Statistic
              title="自动通过"
              value={stats?.autoApprovedCount || 0}
              suffix="单"
              prefix={<CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
              styles={{ content: { color: 'var(--color-success)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #FFF1F0 0%, var(--status-error-border) 100%)', borderRadius: 12 }}>
            <Statistic
              title="退款总额"
              value={Number(stats?.totalRefundAmount || 0)}
              prefix={<CreditCardOutlined style={{ color: 'var(--color-danger)' }} />}
              suffix="元"
              styles={{ content: { color: 'var(--color-danger)' } }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
          AI 退款顾问自动审核退款请求：≤100元且未发货自动通过，大额/已发货需人工审核
        </span>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新数据</Button>
          <Button icon={<ThunderboltOutlined />} loading={autoProcessing} onClick={handleAutoProcess}>
            自动处理 ({pendingRefunds.length})
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Input
          placeholder="搜索订单号"
          prefix={<SearchOutlined />}
          value={searchOrder}
          onChange={(e) => setSearchOrder(e.target.value)}
          style={{ width: 280 }}
        />
        <Select
          placeholder="选择平台"
          value={selectedPlatform || undefined}
          onChange={setSelectedPlatform}
          allowClear
          style={{ width: 140 }}
          options={[
            { value: 'taobao', label: '淘宝' },
            { value: 'pinduoduo', label: '拼多多' },
            { value: 'jd', label: '京东' },
            { value: 'douyin', label: '抖音' },
          ]}
        />
      </div>

      <ResizableTable<RefundRequest>
        dataSource={filteredData}
        columns={columns}
        rowKey="id"
        size="small"
        loading={refundsLoading}
        emptyDescription="暂无退款数据"
      />

      <Modal
        title="确认退款"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleConfirmApprove}
        okText="确认退款"
        cancelText="取消"
        confirmLoading={approving}
      >
        {currentRecord && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>订单号: {currentRecord.orderNo}</div>
              <div style={{ color: 'var(--color-text-secondary)' }}>平台订单号: {currentRecord.platformOrderNo || '-'}</div>
            </div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>退款金额</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-danger)' }}>¥{Number(currentRecord.payAmount).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>发货状态</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: currentRecord.hasShipped ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {currentRecord.hasShipped ? '已发货' : '未发货'}
                </div>
              </div>
            </div>
            {currentRecord.sellerRemark && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>备注</div>
                <div>{currentRecord.sellerRemark}</div>
              </div>
            )}
            <div style={{ padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
              <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>AI 审核建议</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Tag color={currentRecord.aiDecision === 'APPROVE' ? 'success' : 'warning'}>
                  {currentRecord.aiDecision === 'APPROVE' ? '自动通过' : '人工审核'}
                </Tag>
              </div>
              <div>{currentRecord.aiReason}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SmartRefundTab;
