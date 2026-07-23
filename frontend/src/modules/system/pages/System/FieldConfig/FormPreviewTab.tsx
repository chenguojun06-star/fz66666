import React from 'react';
import { Typography, Card, Divider, Form } from 'antd';
import ExtFieldsSection, { flattenExtJson } from '@/components/common/SchemaForm/ExtFieldsSection';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { FormInstance } from 'antd';

const { Text } = Typography;

interface FormPreviewTabProps {
  customFields: FieldConfigItem[];
  previewForm: FormInstance;
  previewRecord: Record<string, unknown>;
}

const FormPreviewTab: React.FC<FormPreviewTabProps> = ({
  customFields,
  previewForm,
  previewRecord,
}) => {
  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        实时预览配置后的表单效果（扩展字段区）
      </Text>
      <Card size="small" style={{ background: 'var(--color-bg-container)' }}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: '#1f1f1f' }}>
          标准字段（固定）
        </div>
        <div style={{ color: '#8c8c8c', marginBottom: 16 }}>
          （业务表单的标准字段区域，此处省略）
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ fontWeight: 600, marginBottom: 12, color: '#1f1f1f' }}>
          扩展字段（{customFields.length} 个自定义字段）
        </div>
        <Form form={previewForm} layout="vertical" initialValues={flattenExtJson(previewRecord.extJson as string | undefined)}>
          <ExtFieldsSection
            fields={customFields}
            colSpan={12}
          />
        </Form>
      </Card>
    </>
  );
};

export default FormPreviewTab;
