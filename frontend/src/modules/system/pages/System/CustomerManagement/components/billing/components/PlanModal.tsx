import React from 'react';
import { Button, Space, Form, InputNumber, Select, Radio, Row, Col, Alert } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { TenantInfo, PlanDefinition } from '@/services/tenantService';
import { formatStorageSize } from '../helpers';

export interface PlanModalProps {
  open: boolean;
  data: TenantInfo | null | undefined;
  plans: PlanDefinition[];
  form: FormInstance;
  planSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onPlanTypeChange: (value: string) => void;
  onBillingCycleChange: () => void;
}

const PlanModal: React.FC<PlanModalProps> = ({
  open,
  data,
  plans,
  form,
  planSaving,
  onCancel,
  onSave,
  onPlanTypeChange,
  onBillingCycleChange,
}) => {
  return (
    <ResizableModal
      open={open}
      title={`设置套餐 - ${data?.tenantName || ''}`}
      onCancel={() => { onCancel(); form.resetFields(); }}
      width="40vw"
      footer={
        <Space>
          <Button onClick={() => { onCancel(); form.resetFields(); }}>取消</Button>
          <Button type="primary" loading={planSaving} onClick={onSave}>保存</Button>
        </Space>
      }
    >
      <Alert
        title="选择预设套餐会自动填充默认配置，也可手动调整各项参数。年付享8.3折优惠（买10个月送2个月）。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item label="计费周期" name="billingCycle" rules={[{ required: true }]}>
          <Radio.Group onChange={onBillingCycleChange}>
            <Radio.Button value="MONTHLY">月付</Radio.Button>
            <Radio.Button value="YEARLY">年付（8.3折）</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="套餐类型" name="planType" rules={[{ required: true }]}>
          <Select onChange={onPlanTypeChange}>
            {plans.map(p => {
              const cycle = form.getFieldValue('billingCycle');
              const priceLabel = cycle === 'YEARLY'
                ? `¥${p.yearlyFee}/年（省¥${p.monthlyFee * 12 - p.yearlyFee}）`
                : `¥${p.monthlyFee}/月`;
              return (
                <Select.Option key={p.code} value={p.code}>
                  {p.label}（{priceLabel}，{formatStorageSize(p.storageQuotaMb)}，{p.maxUsers}用户）
                </Select.Option>
              );
            })}
          </Select>
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="月费(元)" name="monthlyFee" rules={[{ required: true }]}>
              <InputNumber min={0} step={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="存储配额(MB)" name="storageQuotaMb" rules={[{ required: true }]}>
              <InputNumber min={100} step={1024} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="最大用户数" name="maxUsers" rules={[{ required: true }]}>
              <InputNumber min={1} max={9999} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );
};

export default PlanModal;
