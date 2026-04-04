import React from 'react';
import { Button, Select, Space } from 'antd';
import type { TemplateLibrary } from '@/types/style';
import StyleBomAddRowsDropdown from './StyleBomAddRowsDropdown';

interface StyleBomToolbarProps {
  dataLength: number;
  locked: boolean;
  loading: boolean;
  checkingStock: boolean;
  tableEditable: boolean;
  templateLoading: boolean;
  editingKey: string;
  bomTemplateId?: string;
  bomTemplates: TemplateLibrary[];
  onBomTemplateIdChange: (value?: string) => void;
  onTemplateOpenChange: (open: boolean) => void;
  onApplyTemplate: (mode: 'overwrite' | 'append') => void;
  onCheckStock: () => void;
  onGeneratePurchase: () => void;
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onAddRows: (count: number) => void;
}

const toolbarStyle = {
  marginBottom: 16,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
} as const;

const StyleBomToolbar: React.FC<StyleBomToolbarProps> = ({
  dataLength,
  locked,
  loading,
  checkingStock,
  tableEditable,
  templateLoading,
  editingKey,
  bomTemplateId,
  bomTemplates,
  onBomTemplateIdChange,
  onTemplateOpenChange,
  onApplyTemplate,
  onCheckStock,
  onGeneratePurchase,
  onToggleEdit,
  onCancelEdit,
  onAddRows,
}) => {
  const hasEditingRow = Boolean(editingKey);
  const templateOptions = bomTemplates.map((template) => ({
    value: String(template.id || ''),
    label: template.sourceStyleNo ? `${template.templateName}（${template.sourceStyleNo}）` : template.templateName,
  }));

  return (
    <div style={toolbarStyle}>
      <Space>
        <Button onClick={onCheckStock} disabled={!dataLength || loading} loading={checkingStock}>
          🔍 检查库存
        </Button>
        <Button
          type="primary"
          onClick={onGeneratePurchase}
          disabled={locked || !dataLength || loading}
          loading={loading}
        >
          📦 生成采购单
        </Button>
      </Space>

      <Space wrap>
        <Button
          type={tableEditable ? 'primary' : 'default'}
          onClick={onToggleEdit}
          disabled={locked || loading || templateLoading || hasEditingRow || (!tableEditable && !dataLength)}
          loading={loading}
        >
          {tableEditable ? '保存' : '编辑'}
        </Button>
        {tableEditable ? <Button onClick={onCancelEdit} disabled={loading}>取消</Button> : null}

        <Select
          allowClear
          placeholder="导入BOM模板"
          value={bomTemplateId}
          style={{ width: 240 }}
          options={templateOptions}
          onChange={(value) => onBomTemplateIdChange(value)}
          disabled={locked || hasEditingRow || loading || templateLoading}
          onOpenChange={onTemplateOpenChange}
        />

        <Button
          disabled={locked || hasEditingRow || loading || templateLoading || tableEditable || !bomTemplateId}
          onClick={() => onApplyTemplate('overwrite')}
        >
          覆盖导入
        </Button>
        <Button
          disabled={locked || hasEditingRow || loading || templateLoading || tableEditable || !bomTemplateId}
          onClick={() => onApplyTemplate('append')}
        >
          追加导入
        </Button>

        <StyleBomAddRowsDropdown
          onAddRows={onAddRows}
          disabled={locked || hasEditingRow || loading || templateLoading}
        />
      </Space>
    </div>
  );
};

export default StyleBomToolbar;
