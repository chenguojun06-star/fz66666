import React from 'react';
import { Col, Form, Input, InputNumber, Row } from 'antd';
import CustomerSelect from '@/components/common/CustomerSelect';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

/**
 * 区2：客户跟进信息（客户 / 跟单员 / 设计师 / 打板价 / 吊牌价 / 销售价）
 */
const CustomerInfoSection: React.FC<SectionFormContextProps> = ({
  _form,
  currentStyle,
  editLocked,
  isFieldLocked,
}) => {
  return (
    <SectionBox title="客户跟进信息">
      <Row gutter={[16, 8]}>
        <Col xs={24} md={8}>
          <Form.Item name="customerId" noStyle hidden>
            <Input id="customerId" />
          </Form.Item>
          <Form.Item name="customer" label="客户" style={{ marginBottom: 8 }}>
            <CustomerSelect
              id="customer"
              placeholder="搜索或输入客户名称"
              disabled={isFieldLocked(currentStyle?.customer)}
              onChange={(_value, option) => {
                // customerId 已改为 String 类型以匹配 Customer.id（UUID）
                const cid = option?.customerId;
                if (cid) {
                  _form.setFieldsValue({ customerId: String(cid) });
                } else {
                  _form.setFieldsValue({ customerId: undefined });
                }
              }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="orderType" label="跟单员" style={{ marginBottom: 8 }}>
            <Input id="orderType" placeholder="请输入跟单员" disabled={isFieldLocked(currentStyle?.orderType)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="sampleNo" label="设计师" style={{ marginBottom: 8 }}>
            <Input id="sampleNo" placeholder="请输入设计师" disabled={editLocked} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="price" label="打板价" style={{ marginBottom: 8 }}>
            <InputNumber id="price" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="tagPrice" label="吊牌价" style={{ marginBottom: 8 }}>
            <InputNumber id="tagPrice" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled={editLocked} placeholder="选填" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="salesPrice" label="销售价" style={{ marginBottom: 8 }}>
            <InputNumber id="salesPrice" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled={editLocked} placeholder="选填" />
          </Form.Item>
        </Col>
      </Row>
    </SectionBox>
  );
};

export default CustomerInfoSection;
