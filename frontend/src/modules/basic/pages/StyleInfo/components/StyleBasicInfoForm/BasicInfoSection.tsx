import React from 'react';
import { Col, Form, Input, Row, Select } from 'antd';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { SectionFormContextProps } from './types';
import { SALES_CHANNEL_OPTIONS } from './constants';
import SectionBox from './SectionBox';

interface BasicInfoSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
}

/**
 * 区1：基础信息（款号 / SKC / 款名 / 品类 / 季节 / 销售渠道）
 */
const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  _form,
  currentStyle,
  editLocked,
  isFieldLocked,
  isNewPage,
}) => {
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const { options: seasonOptions } = useDictOptions('season', SEASON_CODE_OPTIONS);

  return (
    <SectionBox title="基础信息 · 款号 / SKC / 款名" usePrimaryHighlight>
      <Row gutter={[16, 8]}>
        <Col xs={24} md={8}>
          <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]} style={{ marginBottom: 8 }}>
            <Input id="styleNo" placeholder="请输入款号" disabled={editLocked || Boolean(currentStyle?.id)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="skc" label="SKC" style={{ marginBottom: 8 }}>
            {currentStyle?.skc && !isNewPage ? (
              <span style={{ fontWeight: 500, fontSize: 14, lineHeight: '32px' }}>
                {currentStyle.skc}
              </span>
            ) : (
              <Input id="skc" placeholder="不填将自动生成" disabled={editLocked || Boolean(currentStyle?.id)} />
            )}
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]} style={{ marginBottom: 8 }}>
            <DictAutoComplete dictType="style_name" placeholder="请输入或选择" disabled={editLocked} style={{ width: '100%' }} id="styleName" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="category" label="品类" style={{ marginBottom: 8 }}>
            <Select
              id="category"
              placeholder="选择"
              disabled={isFieldLocked(currentStyle?.category)}
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={categoryOptions}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="season" label="季节" style={{ marginBottom: 8 }}>
            <Select
              id="season"
              placeholder="选择"
              disabled={isFieldLocked(currentStyle?.season)}
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={seasonOptions}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
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
      </Row>
    </SectionBox>
  );
};

export default BasicInfoSection;
