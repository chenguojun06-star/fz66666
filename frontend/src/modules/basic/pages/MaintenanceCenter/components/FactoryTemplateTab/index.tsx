import React, { useState } from 'react';
import { Button, Select, Input, Space, Dropdown } from 'antd';
import { PlusOutlined, CopyOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { typeLabel } from '../../../TemplateCenter/utils/templateUtils';
import TemplateInlineEditor from '../../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import TemplateViewContent from '../../../TemplateCenter/components/TemplateViewContent';
import './FactoryTemplateTab.css';
import { FACTORY_TEMPLATE_TYPES } from './constants';
import { useFactoryTemplate } from './useFactoryTemplate.tsx';
import CopyFromStyleModal from './CopyFromStyleModal';

const FactoryTemplateTab: React.FC = () => {
  const {
    data,
    loading,
    page,
    pageSize,
    setPageSize,
    total,
    templateType,
    setTemplateType,
    setKeyword,
    fetchList,
    editOpen,
    setEditOpen,
    editingRow,
    setEditingRow,
    createType,
    viewOpen,
    setViewOpen,
    viewingRow,
    setViewingRow,
    columns,
    createMenuItems,
  } = useFactoryTemplate();

  const [copyOpen, setCopyOpen] = useState(false);

  return (
    <div className="factory-template-tab">
      <div className="factory-template-tab__toolbar">
        <Space>
          <Select
            value={templateType}
            onChange={setTemplateType}
            options={FACTORY_TEMPLATE_TYPES}
            style={{ width: 130 }}
          />
          <Input.Search
            placeholder="搜索模板名称"
            allowClear
            enterButton={<SearchOutlined />}
            style={{ width: 240 }}
            onSearch={(val) => { setKeyword(val); }}
          />
        </Space>
        <Space>
          <Dropdown menu={{ items: createMenuItems }}>
            <Button type="primary" icon={<PlusOutlined />}>空白创建</Button>
          </Dropdown>
          <Button icon={<CopyOutlined />} onClick={() => setCopyOpen(true)}>从款式复制</Button>
        </Space>
      </div>

      <ResizableTable
        rowKey="id"
        dataSource={data}
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个模板`,
          onChange: (p, ps) => { setPageSize(ps); fetchList(p); },
        }}
        scroll={{ x: 960 }}
        emptyDescription="暂无模板数据"
      />

      <ResizableModal
        title={editingRow?.id ? `编辑模板 — ${editingRow.templateName || ''}` : `创建${typeLabel(createType)}`}
        open={editOpen}
        width="85vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => { setEditOpen(false); setEditingRow(null); }}
        footer={null}
        destroyOnHidden
      >
        {editingRow && (
          <TemplateInlineEditor
            row={editingRow}
            onSaved={async () => {
              setEditOpen(false);
              setEditingRow(null);
              fetchList(1);
            }}
            onCancel={() => { setEditOpen(false); setEditingRow(null); }}
          />
        )}
      </ResizableModal>

      <ResizableModal
        title={`查看模板 — ${viewingRow?.templateName || ''}`}
        open={viewOpen}
        width="85vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => { setViewOpen(false); setViewingRow(null); }}
        footer={null}
        destroyOnHidden
      >
        {viewingRow && (
          <TemplateViewContent
            activeRow={viewingRow as unknown as Record<string, unknown>}
            viewObj={(() => { try { return JSON.parse(viewingRow.templateContent || '{}'); } catch { return {}; } })()}
            viewContent={viewingRow.templateContent || '{}'}
          />
        )}
      </ResizableModal>

      <CopyFromStyleModal
        open={copyOpen}
        onCancel={() => setCopyOpen(false)}
        onSuccess={() => { setCopyOpen(false); fetchList(1); }}
      />
    </div>
  );
};

export default FactoryTemplateTab;
