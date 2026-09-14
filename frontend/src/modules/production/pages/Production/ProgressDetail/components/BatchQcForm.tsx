// BatchQcForm — 批量不合格质检表单
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

import React from 'react';
import {
  Button, Col, Divider, Form, Input, InputNumber, Row, Select,
  Space, Switch,
} from 'antd';
import {
  ArrowLeftOutlined, CloseCircleOutlined, LockOutlined, UnlockOutlined,
} from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { DEFECT_CATEGORIES, STAGE_DEFECT_PROBLEMS } from './ProcessKanbanDrawer.constants';

interface BatchQcFormProps {
  batchQcForm: FormInstance;
  selectedCount: number;
  batchLoading: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

const BatchQcForm: React.FC<BatchQcFormProps> = ({
  batchQcForm, selectedCount, batchLoading, onBack, onSubmit,
}) => {
  return (
    <div>
      <div className="u-d-flex u-ai-center u-gap-8 u-mb-16">
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ padding: 0 }}>
          返回菲号列表
        </Button>
        <Divider orientation="vertical" />
        <span className="u-fw-600 u-fs-15" style={{ color: 'var(--color-error)' }}>
          <CloseCircleOutlined style={{ marginRight: 4 }} />批量不合格 — 已选 {selectedCount} 条菲号
        </span>
      </div>
      <div className="u-mb-12 u-br-8" style={{ padding: '10px 14px', background: 'var(--status-success-bg)', border: '1px solid var(--status-error-border)' }}>
        <span className="u-fw-500" style={{ color: 'var(--color-error)' }}>
          将对选中的 {selectedCount} 条菲号统一标记为不合格，请填写次品信息：
        </span>
      </div>
      <Form form={batchQcForm} layout="vertical">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="defectQuantity" label="每条次品数量" rules={[{ required: true, message: '请输入' }]}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="每条菲号的次品数" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="defectCategory" label="缺陷分类" rules={[{ required: true, message: '请选择' }]}>
              <Select placeholder="选择分类" options={DEFECT_CATEGORIES} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="defectProblems" label="具体次品问题" rules={[{ required: true, message: '请选择' }]}>
              <Select
                mode="multiple"
                placeholder="选择次品问题"
                options={Object.values(STAGE_DEFECT_PROBLEMS).flat()}
                maxTagCount={3}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Col>
        </Row>
        <div className="u-p-8px12px u-br-6 u-mb-12" style={{ border: '1px solid var(--status-error-border)' }}>
          <Form.Item name="lockBundle" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Space>
              <Switch checkedChildren={<LockOutlined />} unCheckedChildren={<UnlockOutlined />} />
              <span className="u-fw-500" style={{ color: 'var(--color-error)' }}>锁定菲号，阻止下游扫码</span>
            </Space>
          </Form.Item>
        </div>
        <Form.Item name="qualityRemark" label="备注" extra="备注将同步到订单备注">
          <Input.TextArea rows={3} placeholder="可选，记录质检情况" />
        </Form.Item>
        <div className="u-d-flex u-jc-end u-gap-8 u-mt-8">
          <Button onClick={onBack}>取消</Button>
          <Button danger type="primary" onClick={onSubmit} loading={batchLoading}>
            确认批量不合格 ({selectedCount})
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default BatchQcForm;
