import React from 'react';
import { Button, Descriptions, Form, Input, InputNumber, Radio, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { ShipModalProps } from './types';

/**
 * 发货弹窗：选择订单 + 填写明细 + 物流信息
 */
const ShipModal: React.FC<ShipModalProps> = ({
  open,
  loading,
  form,
  orderList,
  orderLoading,
  shippableInfo,
  shipDetails,
  onCancel,
  onOk,
  onOrderSelect,
  onShipDetailsChange,
}) => {
  return (
    <ResizableModal
      title="新建发货单"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={loading}
      width="40vw"
    >
      <Form form={form} layout="vertical" initialValues={{ shipMethod: 'EXPRESS' }}>
        <Form.Item
          name="orderId"
          label="选择订单"
          rules={[{ required: true, message: '请选择订单' }]}
        >
          <select
            style={{ width: '100%', height: 32, borderRadius: 6, border: '1px solid var(--color-border-antd)', padding: '0 8px' }}
            onChange={e => onOrderSelect(e.target.value)}
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
          <Descriptions column={3} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="裁剪总数">{shippableInfo.cuttingTotal}</Descriptions.Item>
            <Descriptions.Item label="已发货">{shippableInfo.shippedTotal}</Descriptions.Item>
            <Descriptions.Item label="可发货">
              <span style={{ color: shippableInfo.remaining > 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
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
                  onShipDetailsChange(next);
                }}
              />
              <Input
                placeholder="尺码"
                value={detail.sizeName}
                style={{ width: 70 }}
                onChange={e => {
                  const next = [...shipDetails];
                  next[idx] = { ...next[idx], sizeName: e.target.value };
                  onShipDetailsChange(next);
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
                  onShipDetailsChange(next);
                }}
              />
              {shipDetails.length > 1 && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onShipDetailsChange(shipDetails.filter((_, i) => i !== idx))}
                />
              )}
            </Space>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => onShipDetailsChange([...shipDetails, { color: '', sizeName: '', quantity: 0 }])}
          >
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
  );
};

export default ShipModal;
