import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Radio, Space, Tag, Descriptions } from 'antd';
import { SendOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import ResizableModal from '@/components/common/ResizableModal';
import type { FactoryShipment } from '@/types/production';
import { factoryShipmentApi, type ShipParams, type ShippableInfo } from '@/services/production/factoryShipmentApi';
import { productionOrderApi } from '@/services/production/productionApi';
import type { ProductionOrder } from '@/types/production';

interface FactoryShipmentTabProps {
  selectedFactoryId: string | null;
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待收货' },
  received: { color: 'green', label: '已收货' },
};

const FactoryShipmentTab: React.FC<FactoryShipmentTabProps> = ({ selectedFactoryId }) => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<FactoryShipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 发货弹窗
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipForm] = Form.useForm();
  const [shipLoading, setShipLoading] = useState(false);
  const [shippableInfo, setShippableInfo] = useState<ShippableInfo | null>(null);
  const [, setShippableLoading] = useState(false);

  // 订单选择（用于发货弹窗）
  const [orderList, setOrderList] = useState<ProductionOrder[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (selectedFactoryId) params.factoryId = selectedFactoryId;
      const res = await factoryShipmentApi.list(params);
      if (res?.data) {
        setShipments(res.data.records || []);
        setTotal(res.data.total || 0);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '获取发货记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedFactoryId, message]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // 获取外发工厂订单列表（发货弹窗用）
  const fetchFactoryOrders = useCallback(async () => {
    setOrderLoading(true);
    try {
      const res = await productionOrderApi.list({
        page: 1,
        pageSize: 200,
        factoryType: 'EXTERNAL',
        excludeTerminal: true,
      });
      if (res?.data) {
        let records = (res.data.records || []) as ProductionOrder[];
        if (selectedFactoryId) {
          records = records.filter(o => o.factoryId === selectedFactoryId);
        }
        setOrderList(records);
      }
    } catch {
      // 非关键错误，静默处理
    } finally {
      setOrderLoading(false);
    }
  }, [selectedFactoryId]);

  // 打开发货弹窗
  const handleOpenShip = useCallback(() => {
    shipForm.resetFields();
    setShippableInfo(null);
    setShipModalOpen(true);
    fetchFactoryOrders();
  }, [shipForm, fetchFactoryOrders]);

  // 选择订单后加载可发货信息
  const handleOrderSelect = useCallback(async (orderId: string) => {
    shipForm.setFieldsValue({ orderId });
    setShippableLoading(true);
    try {
      const res = await factoryShipmentApi.shippable(orderId);
      if (res?.data) {
        setShippableInfo(res.data);
      }
    } catch {
      setShippableInfo(null);
    } finally {
      setShippableLoading(false);
    }
  }, [shipForm]);

  // 提交发货
  const handleShip = useCallback(async () => {
    try {
      const values = await shipForm.validateFields();
      setShipLoading(true);
      const params: ShipParams = {
        orderId: values.orderId,
        shipQuantity: values.shipQuantity,
        shipMethod: values.shipMethod || 'EXPRESS',
        trackingNo: values.shipMethod === 'EXPRESS' ? (values.trackingNo || undefined) : undefined,
        expressCompany: values.shipMethod === 'EXPRESS' ? (values.expressCompany || undefined) : undefined,
        remark: values.remark || undefined,
      };
      await factoryShipmentApi.ship(params);
      message.success('发货成功');
      setShipModalOpen(false);
      fetchShipments();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '发货失败');
    } finally {
      setShipLoading(false);
    }
  }, [shipForm, message, fetchShipments]);

  // 收货
  const handleReceive = useCallback(async (record: FactoryShipment) => {
    modal.confirm({
      title: '确认收货',
      content: `确认收货发货单 ${record.shipmentNo}？数量：${record.shipQuantity} 件`,
      onOk: async () => {
        try {
          await factoryShipmentApi.receive(record.id!);
          message.success('收货成功');
          fetchShipments();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '收货失败');
        }
      },
    });
  }, [modal, message, fetchShipments]);

  // 删除
  const handleDelete = useCallback(async (record: FactoryShipment) => {
    try {
      await factoryShipmentApi.delete(record.id!);
      message.success('已删除');
      fetchShipments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  }, [message, fetchShipments]);

  const columns: ColumnsType<FactoryShipment> = [
    {
      title: '发货单号',
      dataIndex: 'shipmentNo',
      key: 'shipmentNo',
      width: 160,
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 130,
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
    },
    {
      title: '发货数量',
      dataIndex: 'shipQuantity',
      key: 'shipQuantity',
      width: 100,
      align: 'right',
    },
    {
      title: '发货时间',
      dataIndex: 'shipTime',
      key: 'shipTime',
      width: 160,
      render: (val: string) => val ? new Date(val).toLocaleString('zh-CN') : '-',
    },
    {
      title: '发货方式',
      dataIndex: 'shipMethod',
      key: 'shipMethod',
      width: 100,
      render: (val: string) => val === 'SELF_DELIVERY' ? <Tag color="green">自发货</Tag> : <Tag color="blue">快递</Tag>,
    },
    {
      title: '物流单号',
      dataIndex: 'trackingNo',
      key: 'trackingNo',
      width: 140,
      render: (val: string) => val || '-',
    },
    {
      title: '状态',
      dataIndex: 'receiveStatus',
      key: 'receiveStatus',
      width: 100,
      render: (val: string) => {
        const info = STATUS_MAP[val] || { color: 'default', label: val };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '收货时间',
      dataIndex: 'receiveTime',
      key: 'receiveTime',
      width: 160,
      render: (val: string) => val ? new Date(val).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: FactoryShipment) => {
        const isPending = record.receiveStatus === 'pending';
        const actions: RowAction[] = [
          ...(isPending ? [{
            key: 'receive',
            label: '收货',
            primary: true,
            onClick: () => handleReceive(record),
          }] : []),
          ...(isPending ? [{
            key: 'delete',
            label: '删除',
            danger: true,
            onClick: () => handleDelete(record),
          }] : []),
        ];
        if (actions.length === 0) return <Tag color="green">已完成</Tag>;
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Tag color="blue">共 {total} 条记录</Tag>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchShipments}>刷新</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={handleOpenShip}>
            新建发货
          </Button>
        </Space>
      </div>

      <ResizableTable<FactoryShipment>
        columns={columns}
        dataSource={shipments}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
        }}
      />

      {/* 发货弹窗 */}
      <ResizableModal
        title="新建发货单"
        open={shipModalOpen}
        onCancel={() => setShipModalOpen(false)}
        onOk={handleShip}
        confirmLoading={shipLoading}
        width="40vw"
      >
        <Form form={shipForm} layout="vertical" initialValues={{ shipMethod: 'EXPRESS' }}>
          <Form.Item
            name="orderId"
            label="选择订单"
            rules={[{ required: true, message: '请选择订单' }]}
          >
            <select
              style={{ width: '100%', height: 32, borderRadius: 6, border: '1px solid #d9d9d9', padding: '0 8px' }}
              onChange={e => handleOrderSelect(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>{orderLoading ? '加载中...' : '请选择订单'}</option>
              {orderList.map(o => (
                <option key={o.id} value={o.id}>
                  {o.orderNo} - {o.styleNo} ({o.factoryName || '未知工厂'})
                </option>
              ))}
            </select>
          </Form.Item>

          {shippableInfo && (
            <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="裁剪总数">{shippableInfo.cuttingTotal}</Descriptions.Item>
              <Descriptions.Item label="已发货">{shippableInfo.shippedTotal}</Descriptions.Item>
              <Descriptions.Item label="可发货">
                <span style={{ color: shippableInfo.remaining > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                  {shippableInfo.remaining}
                </span>
              </Descriptions.Item>
            </Descriptions>
          )}

          <Form.Item
            name="shipQuantity"
            label="发货数量"
            rules={[
              { required: true, message: '请输入发货数量' },
              {
                validator: (_, value) => {
                  if (value && shippableInfo && value > shippableInfo.remaining) {
                    return Promise.reject(`发货数量不能超过可发货数量 (${shippableInfo.remaining})`);
                  }
                  if (value && value <= 0) {
                    return Promise.reject('发货数量必须大于0');
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={shippableInfo?.remaining}
              placeholder="请输入发货数量"
            />
          </Form.Item>

          <Form.Item name="shipMethod" label="发货方式" rules={[{ required: true, message: '请选择发货方式' }]}>
            <Radio.Group>
              <Radio value="SELF_DELIVERY">自发货</Radio>
              <Radio value="EXPRESS">快递</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.shipMethod !== cur.shipMethod}>
            {({ getFieldValue }) => getFieldValue('shipMethod') === 'EXPRESS' ? (
              <>
                <Form.Item name="trackingNo" label="物流单号">
                  <Input placeholder="填写物流单号（选填）" />
                </Form.Item>
                <Form.Item name="expressCompany" label="快递公司">
                  <Input placeholder="填写快递公司（选填）" />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注（选填）" />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

export default FactoryShipmentTab;
