import React from 'react';
import { Col, Row, Space, Tag } from 'antd';
import { DICT_TYPES } from '../helpers';

export interface DictTypeSelectorProps {
  selectedType: string;
  onSelect: (type: string) => void;
}

const DictTypeSelector: React.FC<DictTypeSelectorProps> = ({
  selectedType,
  onSelect,
}) => {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={24}>
        <Space size="large">
          <span style={{ fontWeight: 500 }}>字典类型：</span>
          {DICT_TYPES.map(type => (
            <Tag
              key={type.value}
              color={selectedType === type.value ? 'blue' : 'default'}
              style={{ cursor: 'pointer', fontSize: "var(--font-size-base)", padding: '4px 12px' }}
              onClick={() => onSelect(type.value)}
            >
              {type.label} ({type.description})
            </Tag>
          ))}
        </Space>
      </Col>
    </Row>
  );
};

export default DictTypeSelector;
