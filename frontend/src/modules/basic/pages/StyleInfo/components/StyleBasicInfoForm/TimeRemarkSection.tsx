import React from 'react';
import { Col, Form, Row } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

/**
 * 区4：时间信息（创建时间 / 完成时间 / 交板日期）
 * 备注字段已迁移至 BasicInfoSection，本区仅保留系统时间和交板日期。
 */
const TimeRemarkSection: React.FC<SectionFormContextProps> = ({
  currentStyle,
  isFieldLocked,
}) => {
  return (
    <SectionBox title="时间信息">
      <Row gutter={[16, 8]}>
        <Col xs={24} md={8}>
          <Form.Item name="createTime" label="创建时间" style={{ marginBottom: 8 }}>
            <UnifiedDatePicker
              id="createTime"
              disabled
              allowClear={false}
              placeholder="系统自动生成"
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="completedTime" label="完成时间" style={{ marginBottom: 8 }}>
            <UnifiedDatePicker
              id="completedTime"
              disabled
              allowClear={false}
              placeholder="全部环节入库完成后自动生成"
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="deliveryDate" label="交板日期" rules={[{ required: true, message: '请选择交板日期' }]} style={{ marginBottom: 8 }}>
            <UnifiedDatePicker
              id="deliveryDate"
              disabled={isFieldLocked(currentStyle?.deliveryDate)}
              allowClear
              placeholder="请选择交板日期"
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
    </SectionBox>
  );
};

export default TimeRemarkSection;
