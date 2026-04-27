import React from 'react';
import { Button, Dropdown, Input, Modal, Popover, Select, Space } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { sortSizeNames } from '@/utils/api';
import { TemplateLibrary } from '@/types/style';

interface Props {
  editMode: boolean;
  readOnly?: boolean;
  loading: boolean;
  saving: boolean;
  templateLoading: boolean;
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  openBatchGradingConfig: () => void;
  enterEdit: () => void;
  exitEdit: () => void;
  saveAll: () => void;
  sizeTemplates: TemplateLibrary[];
  sizeTemplateKey: string | undefined;
  setSizeTemplateKey: (v: string | undefined) => void;
  applySizeTemplate: (templateId: string, mode: 'merge' | 'overwrite') => void;
  newGroupName: string;
  setNewGroupName: (v: string) => void;
  confirmAddGroup: () => void;
  sizeOptions: Array<{ value: string; label: string }>;
  setSizeOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>;
  sizeColumns: string[];
  mergeSizeColumns: (additions: string[]) => void;
  fetchSizeDictOptions: () => void;
  message: { error: (msg: string) => void };
}

const StyleSizeToolbar: React.FC<Props> = ({
  editMode, readOnly, loading, saving, templateLoading,
  selectedRowKeys, setSelectedRowKeys, openBatchGradingConfig,
  enterEdit, exitEdit, saveAll,
  sizeTemplates, sizeTemplateKey, setSizeTemplateKey, applySizeTemplate,
  newGroupName, setNewGroupName, confirmAddGroup,
  sizeOptions, setSizeOptions, sizeColumns, mergeSizeColumns, fetchSizeDictOptions, message,
}) => {
  const isReadonly = Boolean(readOnly);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {editMode && !readOnly && selectedRowKeys.length > 0 && (
          <Button type="primary" onClick={openBatchGradingConfig}>
            批量配置跳码区 ({selectedRowKeys.length})
          </Button>
        )}
        {editMode && !readOnly && selectedRowKeys.length > 0 && (
          <Button onClick={() => setSelectedRowKeys([])}>取消选择</Button>
        )}
      </div>
      <Space>
        {!editMode || readOnly ? (
          <Button type="primary" onClick={enterEdit} disabled={loading || saving || isReadonly}>
            编辑
          </Button>
        ) : (
          <>
            <Button type="primary" onClick={saveAll} loading={saving}>保存</Button>
            <Button
              disabled={saving}
              onClick={() => {
                Modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit });
              }}
            >取消</Button>
          </>
        )}
        <Select
          allowClear
          style={{ width: 220 }}
          placeholder="导入尺寸模板"
          value={sizeTemplateKey}
          onChange={(v) => setSizeTemplateKey(v)}
          options={sizeTemplates.map((t) => ({
            value: String(t.id || ''),
            label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName,
          }))}
          disabled={loading || saving || isReadonly || templateLoading}
        />
        <Dropdown
          disabled={loading || saving || isReadonly || templateLoading}
          menu={{
            items: [
              { key: 'overwrite', label: '覆盖导入（清除现有数据）' },
              { key: 'merge', label: '追加导入（保留现有数据）' },
            ],
            onClick: ({ key }) => {
              if (!sizeTemplateKey) { message.error('请选择模板'); return; }
              applySizeTemplate(sizeTemplateKey, key as 'merge' | 'overwrite');
            },
          }}
        >
          <Button disabled={loading || saving || isReadonly || templateLoading}>
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
                onChange={(e) => setNewGroupName(e.target.value)}
                onPressEnter={confirmAddGroup}
                style={{ width: 160 }}
              />
              <Button type="primary" onClick={confirmAddGroup}>确定</Button>
            </Space.Compact>
          }
        >
          <Button disabled={loading || saving || isReadonly}>新增分组</Button>
        </Popover>
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="新增尺码(多选)"
          style={{ minWidth: 160 }}
          disabled={loading || saving || isReadonly}
          options={sizeOptions.filter((opt) => !sizeColumns.includes(opt.value))}
          value={[]}
          onChange={(values) => {
            if (!values.length) return;
            mergeSizeColumns(values);
          }}
          filterOption={(input, option) =>
            String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
          }
          onSearch={(value) => {
            const trimmed = value && value.trim();
            if (trimmed && !sizeOptions.some((opt) => opt.value === trimmed) && !sizeColumns.includes(trimmed)) {
              setSizeOptions((prev) => [...prev, { value: trimmed, label: trimmed }]);
            }
          }}
          popupRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                <Input
                  placeholder="输入新码数后回车添加"
                  size="small"
                  onPressEnter={(e) => {
                    const input = e.target as HTMLInputElement;
                    const val = input.value.trim();
                    if (val && !sizeColumns.includes(val) && !sizeOptions.some((opt) => opt.value === val)) {
                      mergeSizeColumns(sortSizeNames([val]).filter((s) => !sizeColumns.includes(s)));
                      input.value = '';
                    }
                  }}
                />
              </div>
            </>
          )}
          onOpenChange={(open) => { if (open) fetchSizeDictOptions(); }}
        />
      </Space>
    </div>
  );
};

export default StyleSizeToolbar;
