import React from 'react';
import { Form, Input, Row, Col } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import DictAutoComplete from '@/components/common/DictAutoComplete';

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
  return (
    <ResizableModal
      title="入库"
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      okText="入库"
      cancelText="取消"
      confirmLoading={loading}
      width="30vw"
      initialHeight={400}
      autoFontSize={false}
      destroyOnHidden
    >
      <Form layout="vertical">
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
          <Col span={24}>
            <Form.Item label="仓库" required>
              <DictAutoComplete
                dictType="warehouse_location"
                placeholder="请选择或输入仓库"
                value={warehouse || undefined}
                onChange={(v) => setWarehouse(String(v || '').trim())}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );
};

export default SimpleWarehousingModal;
