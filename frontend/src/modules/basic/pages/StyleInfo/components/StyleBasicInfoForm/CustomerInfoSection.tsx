import React from 'react';
import { Col, Form, Input, InputNumber, Row, Select } from 'antd';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import type { SectionFormContextProps } from './types';
import { SALES_CHANNEL_OPTIONS } from './constants';
import SectionBox from './SectionBox';

/**
 * 区2：客户跟进信息（跟单员 / 销售渠道 / 板类 / 打板价 / 吊牌价 / 销售价）
 * 客户字段已迁移至 BasicInfoSection，本区保留跟进与定价信息。
 * 板类从原"版次与版型信息"合并至此，减少分区数量
 *
 * 注：customerId 仍保留 hidden Input，避免后端保存时丢失已选客户ID
 * （customer 文本字段已在 BasicInfoSection 维护，customerId 需要随表单一起提交）
 */
const CustomerInfoSection: React.FC<SectionFormContextProps> = ({
  currentStyle,
  editLocked,
  isFieldLocked,
}) => {
  return (
    <SectionBox title="客户信息">
      <Form.Item name="customerId" noStyle hidden>
        <Input id="customerId" />
      </Form.Item>
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12}>
          <Form.Item name="orderType" label="跟单员" style={{ marginBottom: 8 }}>
            <Input id="orderType" placeholder="请输入跟单员" disabled={isFieldLocked(currentStyle?.orderType)} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="salesChannel" label="销售渠道" style={{ marginBottom: 8 }}>
            <Select
              id="salesChannel"
              placeholder="选择销售渠道"
              disabled={editLocked}
              allowClear
              style={{ width: '100%' }}
              options={SALES_CHANNEL_OPTIONS}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="plateType" label="板类" style={{ marginBottom: 8 }}>
            <DictAutoComplete dictType="plate_type" placeholder="请选择板类" disabled={isFieldLocked(currentStyle?.plateType)} style={{ width: '100%' }} id="plateType" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="price" label="打板价" style={{ marginBottom: 8 }}>
            <InputNumber id="price" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="tagPrice" label="吊牌价" style={{ marginBottom: 8 }}>
            <InputNumber id="tagPrice" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled={editLocked} placeholder="选填" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="salesPrice" label="销售价" style={{ marginBottom: 8 }}>
            <InputNumber id="salesPrice" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled={editLocked} placeholder="选填" />
          </Form.Item>
        </Col>
      </Row>
    </SectionBox>
  );
};

export default CustomerInfoSection;
