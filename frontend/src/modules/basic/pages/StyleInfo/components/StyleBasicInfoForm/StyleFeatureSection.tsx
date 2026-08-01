import React from 'react';
import { Col, Form, Input, Row } from 'antd';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

interface StyleFeatureSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
}

const StyleFeatureSection: React.FC<StyleFeatureSectionProps> = ({
  _form,
  currentStyle: _currentStyle,
  editLocked,
  isFieldLocked: _isFieldLocked,
}) => {
  return (
    <SectionBox title="款式特征 · AI识别">
      <Row gutter={[16, 8]}>
        <Col xs={24} md={8}>
          <Form.Item
            name={['extJson', 'fabric']}
            label="面料"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-fabric"
              placeholder="AI识别自动填充"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['extJson', 'sleeveType']}
            label="袖型"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-sleeveType"
              placeholder="如：长袖/短袖/无袖"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['extJson', 'neckline']}
            label="领型"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-neckline"
              placeholder="如：圆领/V领/翻领"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['extJson', 'version']}
            label="版型"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-version"
              placeholder="如：修身/宽松/常规"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['extJson', 'pattern']}
            label="图案"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-pattern"
              placeholder="如：纯色/条纹/印花"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['extJson', 'craftStyle']}
            label="工艺风格"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-craftStyle"
              placeholder="如：简约/复古/街头"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
      </Row>
    </SectionBox>
  );
};

export default StyleFeatureSection;
