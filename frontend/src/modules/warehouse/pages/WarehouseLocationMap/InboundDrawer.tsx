// 入库抽屉 - 物料入库表单
import React from 'react';
import { Drawer, Button, Form, Input, Select, Row, Col, InputNumber } from 'antd';
import type { FormInstance } from 'antd';
import { MATERIAL_TYPE_OPTIONS } from './types';
import type { LocationItem } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  selectedLocation: LocationItem | null;
  inboundForm: FormInstance;
}

const InboundDrawer: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  loading,
  selectedLocation,
  inboundForm,
}) => {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`入库 - 库位 ${selectedLocation?.locationCode || ''}`}
      styles={{ wrapper: { width: 420, zIndex: 2000 } }}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={onConfirm} loading={loading}>
          确认入库
        </Button>
      }
    >
      <div style={{ padding: '8px 0' }}>
        <Form form={inboundForm} layout="vertical">
          <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '请输入物料编码' }]}>
            <Input placeholder="请输入物料编码" />
          </Form.Item>
          <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
            <Input placeholder="请输入物料名称" />
          </Form.Item>
          <Form.Item name="materialType" label="物料类型" initialValue="fabricA">
            <Select options={MATERIAL_TYPE_OPTIONS} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="color" label="颜色">
                <Input placeholder="颜色" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="size" label="尺码">
                <Input placeholder="尺码" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="数量" />
          </Form.Item>
          <Form.Item name="warehouseLocation" label="库位">
            <Input placeholder="库位编码" disabled />
          </Form.Item>
          <Form.Item name="supplierName" label="供应商">
            <Input placeholder="供应商（选填）" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注（选填）" />
          </Form.Item>
        </Form>
      </div>
    </Drawer>
  );
};

export default InboundDrawer;
