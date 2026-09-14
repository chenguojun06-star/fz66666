import React from 'react';
import { Typography } from 'antd';
import SchemaTable from '@/components/common/SchemaTable';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

const { Text } = Typography;

interface ListPreviewTabProps {
  bizType: string;
  enabledFields: FieldConfigItem[];
  previewRecord: Record<string, unknown>;
}

const ListPreviewTab: React.FC<ListPreviewTabProps> = ({
  bizType,
  enabledFields,
  previewRecord,
}) => {
  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        实时预览配置后的列表效果（模拟数据）
      </Text>
      <SchemaTable
        pageKey="field-config-preview"
        bizType={bizType}
        fields={enabledFields}
        defaultHidden={[]}
        dataSource={[previewRecord as any]}
        rowKey="id"
        pagination={false}
        scroll={{ x: 'max-content' }}
        enableColumnSettings={false}
        settingsPosition="none"
      />
    </>
  );
};

export default ListPreviewTab;
