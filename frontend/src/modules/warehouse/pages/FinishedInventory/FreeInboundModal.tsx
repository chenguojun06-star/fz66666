import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Card, Row, Col, Tag, message, Descriptions } from 'antd';
import { InboxOutlined, SearchOutlined } from '@ant-design/icons';
import { warehouseOperationApi } from '../../../../services/warehouse/inventoryCheckApi';
import DictAutoComplete from '@/components/common/DictAutoComplete';

interface FreeInboundModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FreeInboundModal: React.FC<FreeInboundModalProps> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [skuCode, setSkuCode] = useState('');
  const [skuInfo, setSkuInfo] = useState<any>(null);
  const [querying, setQuerying] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleQuerySku = async () => {
    if (!skuCode.trim()) {
      message.warning('请输入SKU编码');
      return;
    }
    setQuerying(true);
    try {
      const res = await warehouseOperationApi.scanQuery(skuCode.trim(), 'finished');
      const data = res.data?.data || res.data;
      if (data.found) {
        setSkuInfo(data);
      } else {
        message.warning('SKU不存在');
        setSkuInfo(null);
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
      setSkuInfo(null);
    } finally {
      setQuerying(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!skuCode.trim()) {
        message.warning('请输入SKU编码');
        return;
      }
      setLoading(true);
      await warehouseOperationApi.freeInbound({
        skuCode: skuCode.trim(),
        quantity: values.quantity,
        warehouseLocation: values.warehouseLocation || '默认仓',
        sourceType: values.sourceType,
        remark: values.remark,
        supplierName: values.supplierName,
        unitPrice: values.unitPrice,
      });
      message.success('入库成功');
      onSuccess();
      form.resetFields();
      setSkuCode('');
      setSkuInfo(null);
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setSkuCode('');
    setSkuInfo(null);
    onClose();
  };

  return (
    <Modal
      title={<Space><InboxOutlined />自由入库</Space>}
      open={open}
      onCancel={handleClose}
      width={580}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="ok" type="primary" loading={loading} onClick={handleSubmit}>确认入库</Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>SKU编码</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="输入SKU编码（款号-颜色-尺码）" onPressEnter={handleQuerySku} size="large" allowClear />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={querying} onClick={handleQuerySku}>查询</Button>
          </Space.Compact>
        </div>

        {skuInfo && (
          <Card size="small" style={{ background: '#f6f8fa' }}>
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="款号">{skuInfo.styleNo}</Descriptions.Item>
              <Descriptions.Item label="款名">{skuInfo.styleName}</Descriptions.Item>
              <Descriptions.Item label="当前库存"><Tag color={skuInfo.stockQuantity > 0 ? 'green' : 'red'}>{skuInfo.stockQuantity} 件</Tag></Descriptions.Item>
              <Descriptions.Item label="颜色">{skuInfo.color}</Descriptions.Item>
              <Descriptions.Item label="尺码">{skuInfo.size}</Descriptions.Item>
              <Descriptions.Item label="成本价">¥{skuInfo.costPrice}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="quantity" label="入库数量" rules={[{ required: true, message: '请输入数量' }]}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder="数量" size="large" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sourceType" label="入库来源" initialValue="free_inbound">
                <Select size="large">
                  <Select.Option value="external_purchase">外采入库</Select.Option>
                  <Select.Option value="free_inbound">自由入库</Select.Option>
                  <Select.Option value="transfer_in">调拨入库</Select.Option>
                  <Select.Option value="return_in">退货入库</Select.Option>
                  <Select.Option value="other_in">其他入库</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="warehouseLocation" label="仓位">
                <DictAutoComplete dictType="finished_warehouse_location" placeholder="默认仓" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="supplierName" label="供应商（选填）">
                <Input placeholder="外采时填写供应商" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitPrice" label="单价（选填）">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="入库单价" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
};

export default FreeInboundModal;
