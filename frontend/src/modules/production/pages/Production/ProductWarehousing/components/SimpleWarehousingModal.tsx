import React from 'react';
import { Form, Input, Row, Col, Select } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';

interface SimpleWarehousingModalProps {
  open: boolean;
  loading: boolean;
  orderNo: string;
  warehousingNo: string;
  warehouse: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  onClose: () => void;
  onSubmit: () => void;
  setWarehouse: (val: string) => void;
  width?: number;
}

const SimpleWarehousingModal: React.FC<SimpleWarehousingModalProps> = ({
  open,
  loading,
  orderNo,
  warehousingNo,
  warehouse,
  styleNo,
  color,
  size,
  quantity,
  onClose,
  onSubmit,
  setWarehouse,
  width: _width,
}) => {
  const [form] = Form.useForm();
  const { selectOptions: finishedWarehouseOptions } = useWarehouseAreaOptions('FINISHED');
  return (
    <SmallModal
      title="入库"
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      okText="入库"
      cancelText="取消"
      confirmLoading={loading}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="订单号">
              <Input value={orderNo || '-'} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="质检入库号">
              <Input value={warehousingNo || '-'} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="款号">
              <Input value={styleNo || '-'} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="颜色">
              <Input value={color || '-'} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="尺码">
              <Input value={size || '-'} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="数量">
              <Input value={quantity?.toString() || '-'} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="仓库" required>
              <Select
                placeholder="请选择仓库"
                value={finishedWarehouseOptions[0]?.label || '成品仓'}
                onChange={() => {}}
                style={{ width: '100%' }}
              >
                {finishedWarehouseOptions.length > 0
                  ? finishedWarehouseOptions.map(opt => (
                    <Select.Option key={opt.value} value={opt.label as string}>{opt.label}</Select.Option>
                  ))
                  : <Select.Option value="成品仓">成品仓</Select.Option>
                }
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="库位" required>
              <WarehouseLocationAutoComplete
                warehouseType="FINISHED"
                placeholder="请选择或输入库位"
                value={warehouse || undefined}
                onChange={(v) => setWarehouse(String(v || '').trim())}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </SmallModal>
  );
};

export default SimpleWarehousingModal;
