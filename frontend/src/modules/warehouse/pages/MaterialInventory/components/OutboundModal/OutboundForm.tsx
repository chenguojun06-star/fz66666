import React, { useRef } from 'react';
import { Card, Form, Select, Row, Col, Input, AutoComplete, InputNumber, Typography } from 'antd';

const { Option } = Select;

interface OutboundFormProps {
  outboundForm: any;
  factoryOptions: any[];
  outboundOrderOptions: any[];
  handleOutboundOrderInput: (_value: string) => void;
  handleOutboundOrderSelect: (_value: string) => void;
  handleOutboundFactoryInput: (_value: string) => void;
  loadFactoryWorkers: (_factoryId: string) => void;
  loadReceivers: () => void;
  receiverOptions: any[];
  autoMatchOutboundContext: (_data: any, _context: any) => void;
  warehouseLocation?: string;
  modalData: any;
}

const OutboundForm: React.FC<OutboundFormProps> = ({
  outboundForm,
  factoryOptions,
  outboundOrderOptions,
  handleOutboundOrderInput,
  handleOutboundOrderSelect,
  handleOutboundFactoryInput,
  loadFactoryWorkers,
  loadReceivers,
  receiverOptions,
  autoMatchOutboundContext,
  warehouseLocation,
  modalData,
}) => {
  const factorySearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <Card title="出库流转信息">
      <Form form={outboundForm} layout="vertical">
        <div style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          生产订单/样衣开发领料形成的待出库单会自动带出订单、款号、工厂、内外部和用料场景；这里只是给单独出库补完整业务信息。
        </div>
        <Row gutter={12}>
          <Col span={6}>
            <Form.Item
              label="出库类型"
              name="pickupType"
              rules={[{ required: true, message: '请选择出库类型' }]}
            >
              <Select
                placeholder="请选择"
                showSearch
                optionFilterProp="label"
                onChange={(value) => {
                  const currentFactory = outboundForm.getFieldValue('factoryName');
                  if (currentFactory) {
                    const matched = factoryOptions.find(f => f.value === currentFactory || f.label === currentFactory);
                    if (matched?.factoryType && matched.factoryType !== value) {
                      outboundForm.setFieldsValue({ factoryName: undefined, factoryId: undefined, factoryType: undefined });
                    }
                  }
                  if (value === 'FREE') {
                    outboundForm.setFieldsValue({ usageType: 'OTHER', factoryName: undefined, factoryId: undefined, factoryType: undefined, orderNo: undefined });
                  }
                }}
              >
                <Option value="INTERNAL">内部</Option>
                <Option value="EXTERNAL">外部</Option>
                <Option value="FREE">自由出库</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label="用料场景"
              name="usageType"
              rules={[{ required: true, message: '请选择用料场景' }]}
            >
              <Select placeholder="请选择" showSearch optionFilterProp="children">
                <Option value="BULK">大货用料</Option>
                <Option value="SAMPLE">样衣用料</Option>
                <Option value="STOCK">备库/补库</Option>
                <Option value="OTHER">其他</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pickupType !== cur.pickupType}>
              {() => {
                const pickupType = outboundForm.getFieldValue('pickupType');
                return (
                  <Form.Item
                    label="关联订单"
                    name="orderNo"
                    rules={[{ required: pickupType !== 'FREE', message: '请输入关联订单' }]}
                  >
                    <AutoComplete
                      placeholder={pickupType === 'FREE' ? '自由出库无需关联订单' : '按工厂自动匹配或手填订单号'}
                      options={outboundOrderOptions}
                      filterOption={(inputValue, option) => String(option?.label || '').toLowerCase().includes(inputValue.toLowerCase())}
                      onSearch={(value) => { if (pickupType !== 'FREE') void handleOutboundOrderInput(value); }}
                      onSelect={(value) => { if (pickupType !== 'FREE') handleOutboundOrderSelect(String(value)); }}
                      onChange={(value) => { outboundForm.setFieldValue('orderNo', value); }}
                      disabled={pickupType === 'FREE'}
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="关联款号" name="styleNo">
              <Input placeholder="选填关联款号" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="领取人"
              name="receiverId"
              rules={[{ required: true, message: '请选择领取人' }]}
            >
              <Select
                showSearch
                placeholder="请选择领取人"
                options={receiverOptions}
                optionFilterProp="label"
                onChange={(value) => {
                  const matched = receiverOptions.find((item) => item.value === value);
                  outboundForm.setFieldValue('receiverName', matched?.name || '');
                  if (modalData) {
                    void autoMatchOutboundContext(modalData, {
                      receiverId: String(value || ''),
                      receiverName: matched?.name || '',
                    });
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="receiverName" hidden><Input /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pickupType !== cur.pickupType}>
              {() => {
                const pickupType = outboundForm.getFieldValue('pickupType');
                const isExternal = pickupType === 'EXTERNAL';
                const isFree = pickupType === 'FREE';
                const filteredFactoryOptions = pickupType && !isFree
                  ? factoryOptions.filter(f => f.factoryType === pickupType)
                  : factoryOptions;
                return (
                  <Form.Item
                    label="关联内外部生产方"
                    name="factoryName"
                    rules={[{ required: !isFree, message: '请选择关联生产方' }]}
                  >
                    <AutoComplete
                      placeholder={isFree ? '自由出库无需关联生产方' : isExternal ? '筛选选择外发工厂' : '可筛选选择，也可直接手填工厂'}
                      options={filteredFactoryOptions}
                      filterOption={(inputValue, option) => String(option?.label || '').toLowerCase().includes(inputValue.toLowerCase())}
                      onSearch={(value) => {
                        if (!isFree) {
                          if (factorySearchTimerRef.current) clearTimeout(factorySearchTimerRef.current);
                          factorySearchTimerRef.current = setTimeout(() => {
                            void handleOutboundFactoryInput(value);
                          }, 300);
                        }
                      }}
                      onSelect={(value) => {
                        if (isFree) return;
                        void handleOutboundFactoryInput(String(value));
                        const matched = factoryOptions.find((item) => item.value === String(value));
                        if (matched?.factoryType === 'EXTERNAL' && matched?.factoryId) {
                          outboundForm.setFieldsValue({ receiverId: undefined, receiverName: undefined });
                          void loadFactoryWorkers(matched.factoryId);
                        } else {
                          outboundForm.setFieldsValue({ receiverId: undefined, receiverName: undefined });
                          void loadReceivers();
                        }
                        if (modalData) {
                          void autoMatchOutboundContext(modalData, {
                            factoryName: String(value),
                            factoryType: matched?.factoryType,
                          });
                        }
                      }}
                      onChange={(value) => { outboundForm.setFieldValue('factoryName', value); }}
                      disabled={isFree}
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>
            <Form.Item name="factoryId" hidden><Input /></Form.Item>
            <Form.Item name="factoryType" hidden><Input /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="出库人" name="issuerName">
              <Input disabled />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pickupType !== cur.pickupType}>
              {() => {
                const pickupType = outboundForm.getFieldValue('pickupType');
                return (
                  <Form.Item
                    label="出库说明"
                    name="reason"
                    rules={[{ required: pickupType === 'FREE', message: '自由出库必须填写出库说明' }]}
                  >
                    <Input placeholder={pickupType === 'FREE' ? '请说明自由出库原因' : '如：车间补料 / 大货首批发料'} />
                  </Form.Item>
                );
              }}
            </Form.Item>
          </Col>
          <Col span={24}>
            <div style={{ background: '#f5f7fa', padding: '10px 12px', borderRadius: 6, marginBottom: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                当前库存位置：{warehouseLocation || '-'}（出库将自动从该位置扣减）
              </Typography.Text>
            </div>
          </Col>
        </Row>
      </Form>
    </Card>
  );
};

export default OutboundForm;
