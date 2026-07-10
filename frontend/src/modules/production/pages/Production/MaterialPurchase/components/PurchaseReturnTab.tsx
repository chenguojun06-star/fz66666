import React, { useState, useCallback, useEffect } from 'react';
import { Form, Input, Select, Button, Space, Tag, App, Popconfirm } from 'antd';
import { RollbackOutlined, ReloadOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';

// 状态元数据：与后端 PurchaseReturn 实体保持一致
// PENDING=待审核 / APPROVED=已审核 / RETURNED=已退货 / REJECTED=已拒绝
const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待审核', color: 'orange' },
  APPROVED: { label: '已审核', color: 'blue' },
  RETURNED: { label: '已退货', color: 'green' },
  REJECTED: { label: '已拒绝', color: 'red' },
};

interface PurchaseReturnRecord {
  id: number;
  returnNo: string;
  originalPurchaseId: string;
  supplierName?: string;
  returnType: 'FULL' | 'PARTIAL';
  returnReason?: string;
  returnStatus: 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED';
  totalAmount: number;
  operatorName?: string;
  createTime: string;
  approveTime?: string;
  completeTime?: string;
  remark?: string;
}

const PurchaseReturnTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<PurchaseReturnRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();

  const fetchList = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const params: Record<string, unknown> = { page: p, pageSize: ps, ...values };
      const res = await api.get('/production/purchase-return/list', { params });
      const data = res?.data ?? res;
      const records = Array.isArray(data) ? data : (data?.records ?? []);
      setList(records);
      setTotal(data?.total ?? records.length);
    } catch {
      message.error('采购退货列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, form, message]);

  useEffect(() => { fetchList(); }, [page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = () => { setPage(1); fetchList(1); };
  const onReset = () => { form.resetFields(); setPage(1); fetchList(1); };

  // 修复 P0 Bug：审核需发送 { approved: true }，不能发空 body
  const handleApprove = async (record: PurchaseReturnRecord) => {
    try {
      await api.post(`/production/purchase-return/${record.id}/approve`, { approved: true });
      message.success('审核通过');
      fetchList();
    } catch {
      message.error('审核失败');
    }
  };

  // 拒绝退货单（后端支持 approved=false）
  const handleReject = async (record: PurchaseReturnRecord) => {
    modal.confirm({
      title: '拒绝退货单',
      content: '确定拒绝此退货单吗？',
      onOk: async () => {
        try {
          await api.post(`/production/purchase-return/${record.id}/approve`, { approved: false, reason: '管理员拒绝' });
          message.success('已拒绝');
          fetchList();
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const handleComplete = async (record: PurchaseReturnRecord) => {
    try {
      await api.post(`/production/purchase-return/${record.id}/complete`, {});
      message.success('退货已完成');
      fetchList();
    } catch {
      message.error('完成退货失败');
    }
  };

  const columns = [
    { title: '退货单号', dataIndex: 'returnNo', key: 'returnNo', width: 180, fixed: 'left' as const },
    { title: '原采购单号', dataIndex: 'originalPurchaseId', key: 'originalPurchaseId', width: 160, ellipsis: true },
    { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 150, ellipsis: true },
    {
      title: '退货类型', dataIndex: 'returnType', key: 'returnType', width: 90,
      render: (v: string) => v === 'FULL' ? <Tag>全部退货</Tag> : <Tag color="blue">部分退货</Tag>,
    },
    {
      title: '状态', dataIndex: 'returnStatus', key: 'returnStatus', width: 90,
      render: (v: string) => { const m = STATUS_META[v] ?? { label: v, color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
    {
      title: '退货金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 110, align: 'right' as const,
      render: (v: number) => formatMoney(Number(v) || 0),
    },
    { title: '退货原因', dataIndex: 'returnReason', key: 'returnReason', width: 180, ellipsis: true },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160 },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 90 },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: PurchaseReturnRecord) => {
        if (record.returnStatus === 'PENDING') {
          return (
            <Space size={0}>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>审核</Button>
              <Popconfirm title="确定拒绝此退货单？" onConfirm={() => handleReject(record)}>
                <Button type="link" size="small" danger icon={<CloseOutlined />}>拒绝</Button>
              </Popconfirm>
            </Space>
          );
        }
        if (record.returnStatus === 'APPROVED') {
          return <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => handleComplete(record)}>完成退货</Button>;
        }
        return <span style={{ color: '#999' }}>-</span>;
      },
    },
  ];

  return (
    <div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="keyword" label="关键词">
          <Input allowClear placeholder="退货单号/原采购单号/供应商" style={{ width: 240 }} onPressEnter={onSearch} />
        </Form.Item>
        <Form.Item name="returnStatus" label="状态">
          <Select allowClear placeholder="全部状态" style={{ width: 130 }}>
            <Select.Option value="PENDING">待审核</Select.Option>
            <Select.Option value="APPROVED">已审核</Select.Option>
            <Select.Option value="RETURNED">已退货</Select.Option>
            <Select.Option value="REJECTED">已拒绝</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" icon={<RollbackOutlined />} onClick={onSearch}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
      <ResizableTable
        dataSource={list}
        columns={columns}
        rowKey="id"
        loading={loading}
        emptyDescription="暂无采购退货记录"
        scroll={{ x: 1400 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />
    </div>
  );
};

export default PurchaseReturnTab;
