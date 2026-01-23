import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Row, Col, Space, Statistic, Tag, Table, message, App, Select } from 'antd';
import { CheckOutlined, CloseCircleOutlined, DollarOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import api from '../../utils/api';
import { useAuth } from '../../utils/authContext';
import { useViewport } from '../../utils/useViewport';
import { formatDateTime } from '../../utils/datetime';

const { Option } = Select;

interface SettlementData {
  id: string;
  factoryName: string;
  processName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  settlementPeriod: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
}

interface PayrollSettlement {
  id: string;
  settlementNo: string;
  settlementPeriod: string;
  factoryName: string;
  totalAmount: number;
  approvedAmount?: number;
  status: 'submitted' | 'approved' | 'completed';
  submittedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

const getStatusConfig = (status: string) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待审批', color: 'blue' },
    approved: { text: '已批准', color: 'green' },
    rejected: { text: '已驳回', color: 'red' },
    submitted: { text: '待审批', color: 'blue' },
    completed: { text: '已完成', color: 'green' },
  };
  return statusMap[status] || { text: '未知', color: 'default' };
};

const PayrollSettlementPage: React.FC = () => {
  const { message: msg } = App.useApp();
  const { user } = useAuth();
  const { isMobile, modalWidth } = useViewport();
  const [form] = Form.useForm();

  const [tab, setTab] = useState<'data' | 'settlement'>('data');
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<SettlementData[]>([]);
  const [settlementSource, setSettlementSource] = useState<PayrollSettlement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 审批弹窗
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalRecord, setApprovalRecord] = useState<SettlementData | PayrollSettlement | null>(null);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalForm] = Form.useForm();

  // 加载结算数据
  const fetchSettlementData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/payroll/settlement-data/pending', {
        params: { page, pageSize }
      });
      setDataSource(res.data?.records || []);
      setTotal(res.data?.total || 0);
    } catch (error) {
      msg.error('加载结算数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载结算单
  const fetchPayrollSettlements = async () => {
    setLoading(true);
    try {
      const res = await api.get('/payroll/settlement', {
        params: { page, pageSize }
      });
      setSettlementSource(res.data?.records || []);
      setTotal(res.data?.total || 0);
    } catch (error) {
      msg.error('加载结算单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'data') {
      fetchSettlementData();
    } else {
      fetchPayrollSettlements();
    }
  }, [tab, page, pageSize]);

  // 打开审批弹窗
  const handleApprove = (record: SettlementData | PayrollSettlement) => {
    setApprovalRecord(record);
    setApprovalOpen(true);
    approvalForm.resetFields();
  };

  // 提交审批
  const handleApprovalSubmit = async () => {
    const values = await approvalForm.validateFields();
    if (!approvalRecord) return;

    setApprovalSubmitting(true);
    try {
      const isApproved = values.action === 'approve';
      const endpoint = tab === 'data' 
        ? `/payroll/settlement-data/${approvalRecord.id}/approve`
        : `/payroll/settlement/${approvalRecord.id}/approve`;

      await api.post(endpoint, {
        approved: isApproved,
        approvedAmount: values.approvedAmount,
        remark: values.remark
      });

      msg.success(isApproved ? '审批通过' : '已驳回');
      setApprovalOpen(false);
      
      if (tab === 'data') {
        fetchSettlementData();
      } else {
        fetchPayrollSettlements();
      }
    } catch (error) {
      msg.error('审批失败');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  // 执行支付
  const handlePayment = async (settlement: PayrollSettlement) => {
    Modal.confirm({
      title: '确认支付',
      content: `确认支付 ${settlement.factoryName} ${settlement.approvedAmount || settlement.totalAmount} 元？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post('/payroll/payment/execute', {
            settlementId: settlement.id,
            paymentMethod: 'transfer'
          });
          msg.success('支付成功');
          fetchPayrollSettlements();
        } catch (error) {
          msg.error('支付失败');
        }
      }
    });
  };

  const dataColumns = [
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
    },
    {
      title: '工序',
      dataIndex: 'processName',
      key: 'processName',
      width: 100,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      render: (val: number) => `¥${val?.toFixed(2) || 0}`,
    },
    {
      title: '合计',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 120,
      render: (val: number) => `¥${val?.toFixed(2) || 0}`,
    },
    {
      title: '周期',
      dataIndex: 'settlementPeriod',
      key: 'settlementPeriod',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: SettlementData) => (
        <Space>
          {record.status === 'pending' && (
            <Button type="primary" size="small" onClick={() => handleApprove(record)}>
              审批
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const settlementColumns = [
    {
      title: '结算单号',
      dataIndex: 'settlementNo',
      key: 'settlementNo',
      width: 140,
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
    },
    {
      title: '周期',
      dataIndex: 'settlementPeriod',
      key: 'settlementPeriod',
      width: 100,
    },
    {
      title: '应付金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      render: (val: number) => `¥${val?.toFixed(2) || 0}`,
    },
    {
      title: '实付金额',
      dataIndex: 'approvedAmount',
      key: 'approvedAmount',
      width: 120,
      render: (val: number, record: PayrollSettlement) => 
        `¥${(val || record.totalAmount)?.toFixed(2) || 0}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: PayrollSettlement) => (
        <Space>
          {record.status === 'submitted' && (
            <Button type="primary" size="small" onClick={() => handleApprove(record)}>
              审批
            </Button>
          )}
          {record.status === 'approved' && (
            <Button type="primary" size="small" danger onClick={() => handlePayment(record)}>
              支付
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Layout>
      <Card
        title="工资结算管理"
        extra={
          <Space>
            <Button onClick={() => setTab(tab === 'data' ? 'settlement' : 'data')}>
              {tab === 'data' ? '查看结算单' : '查看结算数据'}
            </Button>
            <Button onClick={() => setTab('data')}>刷新</Button>
          </Space>
        }
      >
        {tab === 'data' ? (
          <>
            <ResizableTable
              columns={dataColumns}
              dataSource={dataSource}
              loading={loading}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: setPage,
                onShowSizeChange: (_, size) => {
                  setPage(1);
                  setPageSize(size);
                },
              }}
              rowKey="id"
            />
          </>
        ) : (
          <>
            <ResizableTable
              columns={settlementColumns}
              dataSource={settlementSource}
              loading={loading}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: setPage,
                onShowSizeChange: (_, size) => {
                  setPage(1);
                  setPageSize(size);
                },
              }}
              rowKey="id"
            />
          </>
        )}
      </Card>

      {/* 审批弹窗 */}
      <ResizableModal
        title={tab === 'data' ? '审批结算数据' : '审批结算单'}
        visible={approvalOpen}
        onCancel={() => setApprovalOpen(false)}
        onOk={handleApprovalSubmit}
        confirmLoading={approvalSubmitting}
        defaultWidth="600px"
        defaultHeight="400px"
      >
        <Form form={approvalForm} layout="vertical">
          <Form.Item
            label="审批意见"
            name="action"
            rules={[{ required: true, message: '请选择审批意见' }]}
          >
            <Select placeholder="请选择">
              <Option value="approve">批准</Option>
              <Option value="reject">驳回</Option>
            </Select>
          </Form.Item>

          {tab === 'settlement' && (
            <Form.Item
              label="实付金额"
              name="approvedAmount"
              initialValue={
                approvalRecord && 'totalAmount' in approvalRecord
                  ? (approvalRecord as PayrollSettlement).totalAmount
                  : 0
              }
            >
              <Input type="number" step={0.01} placeholder="输入实付金额" />
            </Form.Item>
          )}

          <Form.Item label="备注" name="remark">
            <Input.TextArea placeholder="输入审批备注（可选）" rows={3} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default PayrollSettlementPage;
