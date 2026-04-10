import React from 'react';
import { Modal, Form, Radio, InputNumber, Input, Button, Table } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import type { ShippableInfo, ShipDetailItem } from '@/services/production/factoryShipmentApi';

interface FactoryShipModalProps {
  open: boolean;
  orderNo?: string;
  shippableInfo: ShippableInfo | null;
  form: FormInstance;
  loading: boolean;
  shipDetails: ShipDetailItem[];
  onShipDetailsChange: (details: ShipDetailItem[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const FactoryShipModal: React.FC<FactoryShipModalProps> = ({
  open,
  orderNo,
  shippableInfo,
  form,
  loading,
  shipDetails,
  onShipDetailsChange,
  onSubmit,
  onCancel,
}) => (
  <Modal
    title={`发货 - ${orderNo || ''}`}
    open={open}
    onOk={onSubmit}
    onCancel={onCancel}
    confirmLoading={loading}
    destroyOnClose
    width={560}
  >
    <Form form={form} layout="vertical" initialValues={{ shipMethod: 'EXPRESS' }}>
      {shippableInfo && (
        <div style={{ marginBottom: 16, color: '#666' }}>
          裁片总数: {shippableInfo.cuttingTotal} | 已发: {shippableInfo.shippedTotal} | 剩余可发: {shippableInfo.remaining}
        </div>
      )}
      <Form.Item name="shipMethod" label="发货方式" rules={[{ required: true, message: '请选择发货方式' }]}>
        <Radio.Group>
          <Radio value="SELF_DELIVERY">自发货</Radio>
          <Radio value="EXPRESS">快递</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item label="发货明细（按颜色/尺码）" required>
        <Table<ShipDetailItem>
          size="small"
          dataSource={shipDetails}
          rowKey={(_, idx) => String(idx)}
          pagination={false}
          columns={[
            {
              title: '颜色',
              dataIndex: 'color',
              render: (val: string, _: ShipDetailItem, idx: number) => (
                <Input
                  value={val}
                  onChange={e => {
                    const d = [...shipDetails];
                    d[idx] = { ...d[idx], color: e.target.value };
                    onShipDetailsChange(d);
                  }}
                  placeholder="颜色"
                  size="small"
                />
              ),
            },
            {
              title: '尺码',
              dataIndex: 'sizeName',
              render: (val: string, _: ShipDetailItem, idx: number) => (
                <Input
                  value={val}
                  onChange={e => {
                    const d = [...shipDetails];
                    d[idx] = { ...d[idx], sizeName: e.target.value };
                    onShipDetailsChange(d);
                  }}
                  placeholder="尺码"
                  size="small"
                />
              ),
            },
            {
              title: '数量',
              dataIndex: 'quantity',
              width: 100,
              render: (val: number, _: ShipDetailItem, idx: number) => (
                <InputNumber
                  min={0}
                  value={val}
                  onChange={v => {
                    const d = [...shipDetails];
                    d[idx] = { ...d[idx], quantity: v ?? 0 };
                    onShipDetailsChange(d);
                  }}
                  size="small"
                  style={{ width: '100%' }}
                />
              ),
            },
            {
              title: '',
              width: 40,
              render: (_: unknown, __: ShipDetailItem, idx: number) => (
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => onShipDetailsChange(shipDetails.filter((_, i) => i !== idx))}
                  disabled={shipDetails.length <= 1}
                />
              ),
            },
          ]}
          footer={() => (
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onShipDetailsChange([...shipDetails, { color: '', sizeName: '', quantity: 0 }])}
            >
              添加明细
            </Button>
          )}
        />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.shipMethod !== cur.shipMethod}>
        {({ getFieldValue }) => getFieldValue('shipMethod') === 'EXPRESS' ? (
          <>
            <Form.Item name="trackingNo" label="快递单号">
              <Input placeholder="选填" />
            </Form.Item>
            <Form.Item name="expressCompany" label="快递公司">
              <Input placeholder="选填" />
            </Form.Item>
          </>
        ) : null}
      </Form.Item>
      <Form.Item name="remark" label="备注">
        <Input.TextArea rows={2} placeholder="选填" />
      </Form.Item>
    </Form>
  </Modal>
);

export default FactoryShipModal;
