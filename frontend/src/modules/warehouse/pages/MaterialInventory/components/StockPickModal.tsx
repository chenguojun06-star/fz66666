import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Descriptions, App, Divider, Tag } from 'antd';
import api from '@/utils/api';
import type { MaterialInventory } from '../types';

interface StockPickModalProps {
  open: boolean;
  record: MaterialInventory | null;
  onClose: () => void;
  onPicked: () => void;
}

/**
 * 库存领取弹窗 — 点击库存数量打开，填写领取信息即可出库。
 */
const StockPickModal: React.FC<StockPickModalProps> = ({ open, record, onClose, onPicked }) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [orderList, setOrderList] = useState<any[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    if (open && record) {
      form.resetFields();
      form.setFieldsValue({ quantity: 1 });
      fetchOrders();
    }
  }, [open, record]);

  const fetchOrders = async () => {
    setOrderLoading(true);
    try {
      const res = await api.get('/production/order/list', { params: { page: 1, pageSize: 50, status: 'production' } });
      const data = (res as any)?.data;
      setOrderList(data?.records || data || []);
    } catch { /* ignore */ }
    finally { setOrderLoading(false); }
  };

  const handlePick = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      // 通过物料库存ID领取
      await api.post('/production/material/picking/outbound', {
        stockId: record?.id,
        materialCode: record?.materialCode,
        materialName: record?.materialName,
        color: record?.color,
        size: record?.size,
        unit: record?.unit,
        quantity: values.quantity,
        orderId: values.orderId,
        orderNo: values.orderNo,
        receiverId: values.receiverId,
        receiverName: values.receiverName,
        pickupType: values.pickupType || 'INTERNAL',
        usageType: values.usageType || 'BULK',
        remark: values.remark || '',
      });
      message.success('领取成功，库存已更新');
      onPicked();
      onClose();
    } catch (err: any) {
      message.error(err?.message || '领取失败');
    } finally {
      setLoading(false);
    }
  };

  if (!record) return null;

  const availableQty = (record.quantity || 0) - (record.lockedQty || 0);

  return (
    <Modal
      title="库存领取"
      open={open}
      onOk={handlePick}
      onCancel={onClose}
      okText="确认领取"
      confirmLoading={loading}
      width={560}
    >
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="物料名称">{record.materialName}</Descriptions.Item>
        <Descriptions.Item label="物料编号">{record.materialCode}</Descriptions.Item>
        <Descriptions.Item label="颜色">{record.color || '-'}</Descriptions.Item>
        <Descriptions.Item label="尺码">{record.size || '-'}</Descriptions.Item>
        <Descriptions.Item label="可用库存">
          <Tag color="green">{availableQty} {record.unit}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="锁定库存">
          <Tag color="orange">{record.lockedQty || 0} {record.unit}</Tag>
        </Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      <Form form={form} layout="vertical">
        <Form.Item name="quantity" label="领取数量" rules={[
          { required: true, message: '请输入领取数量' },
          { type: 'number', min: 1, max: availableQty, message: `1-${availableQty} ${record.unit}` },
        ]}>
          <InputNumber style={{ width: '100%' }} min={1} max={availableQty}
            addonAfter={record.unit} placeholder="请输入领取数量" />
        </Form.Item>

        <Form.Item name="orderNo" label="关联订单" rules={[{ required: true, message: '请选择订单' }]}>
          <Select
            showSearch
            loading={orderLoading}
            placeholder="选择关联的生产订单"
            optionFilterProp="label"
            onChange={(_, option: any) => {
              form.setFieldsValue({ orderId: option?.key });
            }}
            options={orderList.map((o: any) => ({
              key: o.id,
              value: o.orderNo,
              label: `${o.orderNo} - ${o.styleNo || ''} (${o.factoryName || '本厂'})`,
            }))}
          />
        </Form.Item>
        <Form.Item name="orderId" hidden><Input /></Form.Item>

        <Form.Item name="receiverName" label="领取人" rules={[{ required: true, message: '请输入领取人' }]}>
          <Input placeholder="请输入领取人姓名" />
        </Form.Item>

        <Form.Item name="pickupType" label="领取类型" initialValue="INTERNAL">
          <Select options={[
            { value: 'INTERNAL', label: '内部领用' },
            { value: 'EXTERNAL', label: '外发工厂领用' },
          ]} />
        </Form.Item>

        <Form.Item name="usageType" label="用途" initialValue="BULK">
          <Select options={[
            { value: 'BULK', label: '大货用料' },
            { value: 'SAMPLE', label: '样衣用料' },
            { value: 'STOCK', label: '备库/补库' },
            { value: 'OTHER', label: '其他' },
          ]} />
        </Form.Item>

        <Form.Item name="receiverId" hidden><Input /></Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StockPickModal;
