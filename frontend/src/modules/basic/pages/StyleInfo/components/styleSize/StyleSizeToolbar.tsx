import React from 'react';
import { Button, Dropdown, Input, Popover, Select, Space } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { TemplateLibrary } from '@/types/style';

interface Props {
  editMode: boolean;
  readOnly?: boolean;
  loading: boolean;
  saving: boolean;
  templateLoading: boolean;
  selectedRowCount: number;
  sizeTemplateKey?: string;
  sizeTemplates: TemplateLibrary[];
  newGroupName: string;
  sizeOptions: Array<{ value: string; label: string }>;
  sizeColumns: string[];
  onOpenBatchGradingConfig: () => void;
  onClearSelection: () => void;
  onEnterEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onSizeTemplateChange: (value?: string) => void;
  onImportTemplate: (mode: 'merge' | 'overwrite') => void;
  onGroupNameChange: (value: string) => void;
  onConfirmAddGroup: () => void;
  onOpenSizeOptions: () => void;
  onSearchSizeOption: (value: string) => void;
  onAddSizes: (values: string[]) => void;
  onAddCustomSize: (value: string) => boolean;
}

const StyleSizeToolbar: React.FC<Props> = ({
  editMode,
  readOnly,
  loading,
  saving,
  templateLoading,
  selectedRowCount,
  sizeTemplateKey,
  sizeTemplates,
  newGroupName,
  sizeOptions,
  sizeColumns,
  onOpenBatchGradingConfig,
  onClearSelection,
  onEnterEdit,
  onSave,
  onCancelEdit,
  onSizeTemplateChange,
  onImportTemplate,
  onGroupNameChange,
  onConfirmAddGroup,
  onOpenSizeOptions,
  onSearchSizeOption,
  onAddSizes,
  onAddCustomSize,
}) => {
  const disabled = loading || saving || Boolean(readOnly);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {editMode && !readOnly && selectedRowCount > 0 && (
          <Button type="primary" onClick={onOpenBatchGradingConfig}>
            批量配置跳码区 ({selectedRowCount})
          </Button>
        )}
        {editMode && !readOnly && selectedRowCount > 0 && (
          <Button onClick={onClearSelection}>
            取消选择
          </Button>
        )}
      </div>
      <Space>
        {!editMode || readOnly ? (
          <Button type="primary" onClick={onEnterEdit} disabled={disabled}>
            编辑
          </Button>
        ) : (
          <>
            <Button type="primary" onClick={onSave} loading={saving}>
              保存
            </Button>
            <Button disabled={saving} onClick={onCancelEdit}>
              取消
            </Button>
          </>
        )}
        <Select
          allowClear
          style={{ width: 220 }}
          placeholder="导入尺寸模板"
          value={sizeTemplateKey}
          onChange={onSizeTemplateChange}
          options={sizeTemplates.map((template) => ({
            value: String(template.id || ''),
            label: template.sourceStyleNo ? `${template.templateName}（${template.sourceStyleNo}）` : template.templateName,
          }))}
          disabled={disabled || templateLoading}
        />
        <Dropdown
          disabled={disabled || templateLoading}
          menu={{
            items: [
              { key: 'overwrite', label: '覆盖导入（清除现有数据）' },
              { key: 'merge', label: '追加导入（保留现有数据）' },
            ],
            onClick: ({ key }) => onImportTemplate(key as 'merge' | 'overwrite'),
          }}
        >
          <Button disabled={disabled || templateLoading}>
            导入模板 <DownOutlined />
          </Button>
        </Dropdown>
        <Popover
          trigger="click"
          placement="bottom"
          content={
            <Space.Compact style={{ width: 220 }}>
              <Input
                placeholder="如：上装区 / 下装区"
                value={newGroupName}
                onChange={(e) => onGroupNameChange(e.target.value)}
                onPressEnter={onConfirmAddGroup}
                style={{ width: 160 }}
              />
              <Button type="primary" onClick={onConfirmAddGroup}>
                确定
              </Button>
            </Space.Compact>
          }
        >
          <Button disabled={disabled}>
            新增分组
          </Button>
        </Popover>
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="新增尺码(多选)"
          style={{ minWidth: 160 }}
          disabled={disabled}
          options={sizeOptions.filter((option) => !sizeColumns.includes(option.value))}
          value={[]}
          onChange={(values) => {
            if (values.length === 0) return;
            onAddSizes(values);
          }}
          filterOption={(input, option) =>
            String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
          }
          onSearch={onSearchSizeOption}
          popupRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                <Input
                  placeholder="输入新码数后回车添加"
                  size="small"
                  onPressEnter={(e) => {
                    const input = e.target as HTMLInputElement;
                    const value = input.value.trim();
                    if (!value) return;
                    const added = onAddCustomSize(value);
                    if (added) {
                      input.value = '';
                    }
                  }}
                />
              </div>
            </>
          )}
          onOpenChange={(open) => {
            if (open) {
              onOpenSizeOptions();
            }
          }}
        />
      </Space>
    </div>
  );
};

export default StyleSizeToolbar;
