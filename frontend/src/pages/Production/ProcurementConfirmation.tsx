import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, InputNumber, message, Modal, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, CheckCircleOutlined, EyeOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import { ProductionOrder, ProductionQueryParams } from '../../types/production';
import api, { parseProductionOrderLines, unwrapApiData } from '../../utils/api';
import { formatDateTime } from '../../utils/datetime';
import { StyleCoverThumb } from '../../components/StyleAssets';
import { useNavigate } from 'react-router-dom';
import { isSupervisorOrAboveUser, useAuth } from '../../utils/authContext';
import { useSync } from '../../utils/syncManager';
import { useViewport } from '../../utils/useViewport';
import './styles.css';

const { Option } = Select;
const { TextArea } = Input;

/**
 * 采购确认页面
 * 用于物料到货率>=50%时，人工确认"回料完成"
 */
const ProcurementConfirmation: React.FC = () => {
  const { user } = useAuth();
  const { isMobile, modalWidth } = useViewport();
  const navigate = useNavigate();

  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // 状态管理
  const [visible, setVisible] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<ProductionOrder | null>(null);
  const [confirmForm] = Form.useForm();
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: 10,
    // 只显示当前工序为"采购"且物料到货率>=50%的订单
    currentProcessName: '采购',
  });

  // 数据状态
  const [orderList, setOrderList] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  // 轮询同步
  useSync(() => {
    fetchOrders();
  }, 30000);

  // 初始加载
  useEffect(() => {
    fetchOrders();
  }, [queryParams]);

  // 获取订单列表
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/production/order/list', { params: queryParams });
      const data = unwrapApiData(response);
      
      // 过滤：只显示物料到货率>=50%且未手动确认的订单
      const filteredRecords = (data.records || []).filter((order: ProductionOrder) => {
        const materialRate = Number(order.materialArrivalRate) || 0;
        const manuallyCompleted = Number(order.procurementManuallyCompleted) || 0;
        return materialRate >= 50 && manuallyCompleted !== 1;
      });

      setOrderList(filteredRecords);
      setTotal(filteredRecords.length);
    } catch (error: any) {
      console.error('获取订单列表失败:', error);
      message.error(error?.message || '获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 查看订单详情
  const handleViewDetail = (record: ProductionOrder) => {
    navigate(`/production/orders`, { 
      state: { 
        orderId: record.id,
        openDetail: true 
      } 
    });
  };

  // 打开确认对话框
  const handleOpenConfirm = (record: ProductionOrder) => {
    setCurrentOrder(record);
    confirmForm.resetFields();
    setVisible(true);
  };

  // 提交确认
  const handleConfirm = async () => {
    try {
      const values = await confirmForm.validateFields();
      
      if (!currentOrder?.id) {
        message.error('订单ID不存在');
        return;
      }

      setSubmitLoading(true);

      const response = await api.post('/api/production/order/confirm-procurement', {
        id: currentOrder.id,
        remark: values.remark,
      });

      const data = unwrapApiData(response);
      
      message.success('回料完成确认成功');
      setVisible(false);
      setCurrentOrder(null);
      confirmForm.resetFields();
      
      // 刷新列表
      fetchOrders();
    } catch (error: any) {
      console.error('确认失败:', error);
      message.error(error?.message || '确认失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  // 表格列定义
  const columns: ColumnsType<ProductionOrder> = [
    {
      title: 'PO号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 180,
      fixed: 'left',
      render: (text: string, record: ProductionOrder) => (
        <Button
          type="link"
          onClick={() => handleViewDetail(record)}
          style={{ padding: 0, height: 'auto' }}
        >
          {text}
        </Button>
      ),
    },
    {
      title: '款式封面',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 80,
      render: (text: string, record: ProductionOrder) => (
        <StyleCoverThumb
          src={text}
          styleNo={record.styleNo || ''}
          styleName={record.styleName || ''}
        />
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 150,
    },
    {
      title: '款式名称',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '订单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 120,
      align: 'right',
      render: (val: number) => val?.toLocaleString() || 0,
    },
    {
      title: '物料到货率',
      dataIndex: 'materialArrivalRate',
      key: 'materialArrivalRate',
      width: 120,
      align: 'center',
      render: (rate: number) => {
        const value = Number(rate) || 0;
        let color = 'default';
        if (value >= 100) color = 'success';
        else if (value >= 80) color = 'processing';
        else if (value >= 50) color = 'warning';
        else color = 'error';

        return (
          <Tag color={color}>
            {value}%
          </Tag>
        );
      },
    },
    {
      title: '当前工序',
      dataIndex: 'currentProcessName',
      key: 'currentProcessName',
      width: 120,
      render: (text: string) => text || '采购',
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '计划开始日期',
      dataIndex: 'plannedStartDate',
      key: 'plannedStartDate',
      width: 180,
      render: (val: string) => formatDateTime(val, 'YYYY-MM-DD'),
    },
    {
      title: '计划完成日期',
      dataIndex: 'plannedEndDate',
      key: 'plannedEndDate',
      width: 180,
      render: (val: string) => formatDateTime(val, 'YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 200,
      render: (_: any, record: ProductionOrder) => (
        <RowActions
          items={[
            {
              key: 'view',
              icon: <EyeOutlined />,
              label: '查看详情',
              onClick: () => handleViewDetail(record),
            },
            {
              key: 'confirm',
              icon: <CheckCircleOutlined />,
              label: '确认回料完成',
              onClick: () => handleOpenConfirm(record),
              type: 'primary',
            },
          ]}
        />
      ),
    },
  ];

  // 顶部搜索表单
  const renderSearchForm = () => (
    <Card style={{ marginBottom: 16 }}>
      <Form layout="inline" onFinish={() => fetchOrders()}>
        <Row gutter={[16, 16]} style={{ width: '100%' }}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item label="PO号" style={{ width: '100%' }}>
              <Input
                placeholder="请输入PO号"
                value={queryParams.orderNo}
                onChange={(e) => setQueryParams({ ...queryParams, orderNo: e.target.value, page: 1 })}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item label="款号" style={{ width: '100%' }}>
              <Input
                placeholder="请输入款号"
                value={queryParams.styleNo}
                onChange={(e) => setQueryParams({ ...queryParams, styleNo: e.target.value, page: 1 })}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item label="工厂" style={{ width: '100%' }}>
              <Input
                placeholder="请输入工厂名称"
                value={queryParams.factoryName}
                onChange={(e) => setQueryParams({ ...queryParams, factoryName: e.target.value, page: 1 })}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchOrders()}>
                搜索
              </Button>
              <Button
                onClick={() => {
                  setQueryParams({ page: 1, pageSize: 10, currentProcessName: '采购' });
                }}
              >
                重置
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </Card>
  );

  // 确认对话框
  const renderConfirmModal = () => (
    <ResizableModal
      title="确认回料完成"
      visible={visible}
      onCancel={() => {
        setVisible(false);
        setCurrentOrder(null);
        confirmForm.resetFields();
      }}
      onOk={handleConfirm}
      confirmLoading={submitLoading}
      defaultWidth={modalWidth}
      defaultHeight="auto"
    >
      <Form form={confirmForm} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="订单信息">
              <Card size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <strong>PO号：</strong>{currentOrder?.orderNo}
                  </div>
                  <div>
                    <strong>款号：</strong>{currentOrder?.styleNo}
                  </div>
                  <div>
                    <strong>款式名称：</strong>{currentOrder?.styleName}
                  </div>
                  <div>
                    <strong>订单数量：</strong>{currentOrder?.orderQuantity?.toLocaleString()}
                  </div>
                  <div>
                    <strong>物料到货率：</strong>
                    <Tag color={Number(currentOrder?.materialArrivalRate) >= 80 ? 'processing' : 'warning'}>
                      {currentOrder?.materialArrivalRate}%
                    </Tag>
                  </div>
                </Space>
              </Card>
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label={
                <Space>
                  <span>确认备注</span>
                  <Tooltip title="请说明物料到货情况和确认原因（至少10个字符）">
                    <span style={{ color: '#999', fontSize: 12 }}>（必填，至少10字）</span>
                  </Tooltip>
                </Space>
              }
              name="remark"
              rules={[
                { required: true, message: '请输入确认备注' },
                { min: 10, message: '备注至少需要10个字符，请详细说明确认原因' },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="请详细说明物料到货情况和确认原因，例如：&#10;- 物料已到货80%，剩余20%预计3天后到货&#10;- 供应商临时缺货，已与生产经理协商先开工&#10;- 关键物料已齐全，次要辅料可后续补充"
                showCount
                maxLength={500}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <div style={{ padding: '12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
              <Space direction="vertical" size={4}>
                <div style={{ fontWeight: 'bold', color: '#fa8c16' }}>⚠️ 重要提示</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  1. 物料到货率需≥50%才能确认
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  2. 确认后订单将进入下一生产阶段（裁剪）
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  3. 请务必确保关键物料已到位，避免影响生产进度
                </div>
              </Space>
            </div>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );

  return (
    <Layout
      title="采购确认"
      extra={
        <Space>
          <Button onClick={() => fetchOrders()}>刷新</Button>
        </Space>
      }
    >
      {renderSearchForm()}

      <Card>
        <div style={{ marginBottom: 16, color: '#666', fontSize: 14 }}>
          <Space direction="vertical">
            <div>
              当前显示：物料到货率 ≥ 50% 且尚未确认回料完成的订单（共 {total} 条）
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              说明：点击"确认回料完成"后，订单将进入下一生产阶段
            </div>
          </Space>
        </div>

        <ResizableTable
          columns={columns}
          dataSource={orderList}
          rowKey="id"
          loading={loading}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setQueryParams({ ...queryParams, page, pageSize });
            },
          }}
          scroll={{ x: 1600 }}
        />
      </Card>

      {renderConfirmModal()}
    </Layout>
  );
};

export default ProcurementConfirmation;
