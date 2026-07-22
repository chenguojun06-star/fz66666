import React from 'react';
import { Modal, Form, Input, Select, Switch, Row, Col, Tag } from 'antd';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { FIELD_TYPE_OPTIONS } from '@/services/system/fieldConfigApi';
import type { FormInstance } from 'antd';

interface EditFieldModalProps {
  open: boolean;
  editing: FieldConfigItem | null;
  form: FormInstance;
  onCancel: () => void;
  onOk: () => void;
}

const EditFieldModal: React.FC<EditFieldModalProps> = ({
  open,
  editing,
  form,
  onCancel,
  onOk,
}) => {
  const fieldType = Form.useWatch('fieldType', form);

  return (
    <Modal
      title={editing?.fieldKey ? '编辑字段' : '新增自定义字段'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      width={640}
      okText="确定"
      cancelText="取消"
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="label" label="字段名" rules={[{ required: true, message: '请输入字段名' }]}>
              <Input placeholder="如 样衣开发费" />
            </Form.Item>
            <Form.Item name="fieldType" label="字段类型" rules={[{ required: true }]}>
              <Select
                options={FIELD_TYPE_OPTIONS}
                disabled={editing?.isSystem === 1}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="required" label="是否必填" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="pcColSpan" label="显示宽度">
              <Select
                options={[
                  { label: '整行', value: 24 },
                  { label: '半行', value: 12 },
                  { label: '三分之一行', value: 8 },
                ]}
              />
            </Form.Item>
            {editing?.isSystem === 1 && (
              <Form.Item label="字段类型">
                <Tag color="blue">系统字段，不可改类型</Tag>
              </Form.Item>
            )}
          </Col>
        </Row>

        {(fieldType === 'select' || fieldType === 'multiselect') && (
          <Form.Item
            name="optionsText"
            label="下拉选项"
            extra="每行一个选项"
          >
            <Input.TextArea rows={4} placeholder={'选项1\n选项2\n选项3'} />
          </Form.Item>
        )}

        <Form.Item name="remark" label="备注说明">
          <Input.TextArea rows={2} placeholder="可选，字段用途说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditFieldModal;
