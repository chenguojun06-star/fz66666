import React from 'react';
import { Col, Form, Input, Row } from 'antd';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

/**
 * 区3：版次与版型信息（板类 / 纸样师 / 车板师）
 */
const PlateInfoSection: React.FC<SectionFormContextProps> = ({
  currentStyle,
  isFieldLocked,
}) => {
  return (
    <SectionBox title="版次与版型信息">
      <Row gutter={[16, 8]}>
        <Col xs={24} md={8}>
          <Form.Item name="plateType" label="板类" style={{ marginBottom: 8 }}>
            <DictAutoComplete dictType="plate_type" placeholder="请选择板类" disabled={isFieldLocked(currentStyle?.plateType)} style={{ width: '100%' }} id="plateType" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="sampleSupplier" label="纸样师" style={{ marginBottom: 8 }}>
            <Input id="sampleSupplier" placeholder="请输入纸样师" disabled={isFieldLocked(currentStyle?.sampleSupplier)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="plateWorker" label="车板师" style={{ marginBottom: 8 }}>
            <Input id="plateWorker" placeholder="请输入车板师" disabled={isFieldLocked(currentStyle?.plateWorker)} />
          </Form.Item>
        </Col>
      </Row>
    </SectionBox>
  );
};

export default PlateInfoSection;
