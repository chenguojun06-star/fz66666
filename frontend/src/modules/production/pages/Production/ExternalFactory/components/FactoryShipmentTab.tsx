import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Popconfirm, Radio, Space, Tag, Descriptions } from 'antd';
import { SendOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import ResizableModal from '@/components/common/ResizableModal';
import type { FactoryShipment, FactoryShipmentDetail } from '@/types/production';
import { factoryShipmentApi, type ShipDetailItem, type ShipParams, type ShippableInfo } from '@/services/production/factoryShipmentApi';
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
  const { message, modal: _modal } = App.useApp();
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
  const [shipDetails, setShipDetails] = useState<ShipDetailItem[]>([{ color: '', sizeName: '', quantity: 0 }]);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, FactoryShipmentDetail[]>>({});
  const [expandedLoading, setExpandedLoading] = useState<Record<string, boolean>>({});

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
    const details = shipDetails.filter(d => d.color && d.sizeName && d.quantity > 0);
    if (details.length === 0) {
      message.warning('请至少填写一行发货明细（颜色、尺码、数量均不能为空）');
      return;
    }
    try {
      const values = await shipForm.validateFields();
      setShipLoading(true);
      const params: ShipParams = {
        orderId: values.orderId,
        details,
        shipMethod: values.shipMethod || 'EXPRESS',
        trackingNo: values.shipMethod === 'EXPRESS' ? (values.trackingNo || undefined) : undefined,
        expressCompany: values.shipMethod === 'EXPRESS' ? (values.expressCompany || undefined) : undefined,
        remark: values.remark || undefined,
      };
      await factoryShipmentApi.ship(params);
      message.success('发货成功');
      setShipModalOpen(false);
      setShipDetails([{ color: '', sizeName: '', quantity: 0 }]);
      fetchShipments();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '发货失败');
    } finally {
      setShipLoading(false);
    }
  }, [shipForm, message, fetchShipments, shipDetails]);

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState<FactoryShipment | null>(null);
  const [receiveQty, setReceiveQty] = useState<number>(0);
  const [receiveLoading, setReceiveLoading] = useState(false);

  const handleReceiveClick = useCallback((record: FactoryShipment) => {
    setReceiveRecord(record);
    setReceiveQty(record.shipQuantity);
    setReceiveModalOpen(true);
  }, []);

  const handleReceiveConfirm = useCallback(async () => {
    if (!receiveRecord) return;
    if (receiveQty <= 0) {
      message.warning('实际到货数量必须大于0');
      return;
    }
    if (receiveQty > receiveRecord.shipQuantity) {
      message.warning('实际到货数量不能超过发货数量');
      return;
    }
    setReceiveLoading(true);
    try {
      await factoryShipmentApi.receive(receiveRecord.id!, receiveQty === receiveRecord.shipQuantity ? undefined : receiveQty);
      message.success('收货成功');
      setReceiveModalOpen(false);
      fetchShipments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '收货失败');
    } finally {
      setReceiveLoading(false);
    }
  }, [receiveRecord, receiveQty, message, fetchShipments]);

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
      title: '实际到货',
      dataIndex: 'receivedQuantity',
      key: 'receivedQuantity',
      width: 100,
      align: 'right',
      render: (val: number | undefined, record: FactoryShipment) => {
        if (record.receiveStatus !== 'received') return '-';
        return val != null ? val : record.shipQuantity;
      },
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
            onClick: () => handleReceiveClick(record),
          }] : []),
          ...(isPending ? [{
            key: 'delete',
            label: (
              <Popconfirm title="确认删除此发货记录？" onConfirm={() => handleDelete(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                <span style={{ color: '#ff4d4f' }}>删除</span>
              </Popconfirm>
            ),
            danger: true,
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
        expandable={{
          expandedRowRender: (record) => {
            const details = expandedDetails[record.id!] || [];
            const isLoading = expandedLoading[record.id!];
            if (isLoading) return <span style={{ color: '#999', fontSize: 12 }}>加载中...</span>;
            if (details.length === 0) return <span style={{ color: '#999', fontSize: 12 }}>无明细</span>;
            return (
              <table style={{ fontSize: 12, borderCollapse: 'collapse' as const }}>
                <thead><tr>
                  <th style={{ padding: '2px 12px', borderBottom: '1px solid #eee' }}>颜色</th>
                  <th style={{ padding: '2px 12px', borderBottom: '1px solid #eee' }}>尺码</th>
                  <th style={{ padding: '2px 12px', borderBottom: '1px solid #eee' }}>数量</th>
                </tr></thead>
                <tbody>{details.map((d: FactoryShipmentDetail) => (
                  <tr key={d.id}>
                    <td style={{ padding: '2px 12px' }}>{d.color}</td>
                    <td style={{ padding: '2px 12px' }}>{d.sizeName}</td>
                    <td style={{ padding: '2px 12px' }}>{d.quantity}</td>
                  </tr>
                ))}</tbody>
              </table>
            );
          },
          onExpand: (expanded: boolean, record: FactoryShipment) => {
            if (expanded && record.id && !expandedDetails[record.id]) {
              setExpandedLoading(prev => ({ ...prev, [record.id!]: true }));
              factoryShipmentApi.getDetails(record.id).then(res => {
                setExpandedDetails(prev => ({ ...prev, [record.id!]: res?.data ?? [] }));
              }).finally(() => {
                setExpandedLoading(prev => ({ ...prev, [record.id!]: false }));
              });
            }
          },
        }}
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

          <Form.Item label="发货明细（颜色/尺码/数量）" required>
            {shipDetails.map((detail, idx) => (
              <Space key={idx} style={{ marginBottom: 8, display: 'flex' }} align="baseline">
                <Input
                  placeholder="颜色"
                  value={detail.color}
                  style={{ width: 90 }}
                  onChange={e => {
                    const next = [...shipDetails];
                    next[idx] = { ...next[idx], color: e.target.value };
                    setShipDetails(next);
                  }}
                />
                <Input
                  placeholder="尺码"
                  value={detail.sizeName}
                  style={{ width: 70 }}
                  onChange={e => {
                    const next = [...shipDetails];
                    next[idx] = { ...next[idx], sizeName: e.target.value };
                    setShipDetails(next);
                  }}
                />
                <InputNumber
                  placeholder="数量"
                  value={detail.quantity || undefined}
                  min={1}
                  style={{ width: 80 }}
                  onChange={val => {
                    const next = [...shipDetails];
                    next[idx] = { ...next[idx], quantity: Number(val) || 0 };
                    setShipDetails(next);
                  }}
                />
                {shipDetails.length > 1 && (
                  <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setShipDetails(shipDetails.filter((_, i) => i !== idx))} />
                )}
              </Space>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setShipDetails([...shipDetails, { color: '', sizeName: '', quantity: 0 }])}>
              添加行
            </Button>
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

      {/* 收货确认弹窗 */}
      <ResizableModal
        title="确认收货"
        open={receiveModalOpen}
        onCancel={() => setReceiveModalOpen(false)}
        onOk={handleReceiveConfirm}
        confirmLoading={receiveLoading}
        width={420}
      >
        {receiveRecord && (
          <div style={{ padding: '8px 0' }}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="发货单号">{receiveRecord.shipmentNo}</Descriptions.Item>
              <Descriptions.Item label="订单号">{receiveRecord.orderNo}</Descriptions.Item>
              <Descriptions.Item label="款号">{receiveRecord.styleNo}</Descriptions.Item>
              <Descriptions.Item label="工厂">{receiveRecord.factoryName || '-'}</Descriptions.Item>
              <Descriptions.Item label="发货数量">{receiveRecord.shipQuantity} 件</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>实际到货数量（点货数量）</div>
              <InputNumber
                value={receiveQty}
                min={1}
                max={receiveRecord.shipQuantity}
                onChange={val => setReceiveQty(Number(val) || 0)}
                style={{ width: '100%' }}
                addonAfter="件"
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                默认等于发货数量，如实际到货数量不同请修改
              </div>
            </div>
          </div>
        )}
      </ResizableModal>
    </div>
  );
};

export default FactoryShipmentTab;
