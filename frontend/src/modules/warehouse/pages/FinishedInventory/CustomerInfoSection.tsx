import React from 'react';
import { Card, Col, Input, Row, Space, Typography } from 'antd';

interface CustomerInfoSectionProps {
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  shippingAddress: string;
  onShippingAddressChange: (value: string) => void;
  variant: 'card' | 'inline';
}

const CustomerInfoSection: React.FC<CustomerInfoSectionProps> = ({
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  shippingAddress,
  onShippingAddressChange,
  variant,
}) => {
  if (variant === 'inline') {
    return (
      <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>客户信息</Typography.Text>
        <Space wrap style={{ width: '100%' }}>
          <span>
            <span style={{ color: '#ff4d4f' }}>*</span> 客户名称：
            <Input
              value={customerName}
              onChange={e => onCustomerNameChange(e.target.value)}
              placeholder="必填：输入客户/公司名称"
              style={{ width: 180 }}
              status={customerName.trim() ? undefined : 'warning'}
            />
          </span>
          <span>
            联系电话：
            <Input
              value={customerPhone}
              onChange={e => onCustomerPhoneChange(e.target.value)}
              placeholder="选填"
              style={{ width: 140 }}
            />
          </span>
          <span>
            收货地址：
            <Input
              value={shippingAddress}
              onChange={e => onShippingAddressChange(e.target.value)}
              placeholder="选填"
              style={{ width: 200 }}
            />
          </span>
        </Space>
      </div>
    );
  }

  return (
    <Card style={{ background: '#f0f5ff', border: '1px solid #adc6ff' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#1d39c4' }}>
        👤 客户信息 —— 出库发送给哪个客户
      </div>
      <Row gutter={12}>
        <Col span={8}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}><span style={{ color: '#ff4d4f' }}>*</span> 客户名称</div>
          <Input
           
            placeholder="必填：输入客户/公司名称"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            status={customerName.trim() ? undefined : 'warning'}
          />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>联系电话</div>
          <Input
           
            placeholder="输入联系电话"
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
          />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>收货地址</div>
          <Input
           
            placeholder="输入收货地址"
            value={shippingAddress}
            onChange={(e) => onShippingAddressChange(e.target.value)}
          />
        </Col>
      </Row>
    </Card>
  );
};

export default CustomerInfoSection;
