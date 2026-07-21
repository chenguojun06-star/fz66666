import React from 'react';
import { Col, Form, Input, Row, Select } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import { DICT_TYPES } from '../helpers';
import type { DictItem } from '../types';

const { Option } = Select;

export interface DictFormModalProps {
  visible: boolean;
  data: DictItem | null;
  form: ReturnType<typeof Form.useForm>[0];
  onCancel: () => void;
  onOk: () => void;
}

const DictFormModal: React.FC<DictFormModalProps> = ({
  visible,
  data,
  form,
  onCancel,
  onOk,
}) => {
  return (
    <StandardModal
      key={visible ? 'open' : 'closed'}
      title={data ? '编辑字典项' : '新建字典项'}
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      size="md"
      centered
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="dictType"
          label="字典类型"
          rules={[{ required: true, message: '请选择字典类型' }]}
        >
          <Select placeholder="请选择字典类型" disabled={Boolean(data)}>
            {DICT_TYPES.map(type => (
              <Option key={type.value} value={type.value}>
                {type.label} - {type.description}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="dictCode"
              label="字典编码"
              rules={[
                { required: true, message: '请输入字典编码' },
                { pattern: /^[A-Za-z0-9_()/-]+$/, message: '编码只能包含字母、数字、下划线、括号、斜杠和连字符' }
              ]}
            >
              <Input id="dictCode" placeholder="如：XS(155/80A)、S、160/84A" disabled={Boolean(data)} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="dictLabel"
              label="字典标签"
              rules={[{ required: true, message: '请输入字典标签' }]}
            >
              <Input id="dictLabel" placeholder="显示名称" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="sort"
          label="排序"
        >
          <Input id="sort" type="number" placeholder="数字越小越靠前" />
        </Form.Item>

        <Form.Item
          name="description"
          label="备注"
        >
          <Input.TextArea id="description" rows={3} placeholder="请输入备注信息" />
        </Form.Item>
      </Form>
    </StandardModal>
  );
};

export default DictFormModal;
