import React from 'react';
import {
  Card, Select, Button, Space, Tabs, Alert,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, SaveOutlined,
} from '@ant-design/icons';
import { BIZ_TYPE_OPTIONS } from '@/services/system/fieldConfigApi';
import { useFieldConfig } from './useFieldConfig';
import FieldListTab from './FieldListTab';
import ListPreviewTab from './ListPreviewTab';
import FormPreviewTab from './FormPreviewTab';
import EditFieldModal from './EditFieldModal';

const { TabPane } = Tabs;

const FieldConfigPage: React.FC = () => {
  const {
    bizType,
    setBizType,
    rows,
    loading,
    editOpen,
    setEditOpen,
    editing,
    form,
    previewForm,
    saving,
    activeTab,
    setActiveTab,
    dirty,
    handleToggleEnabled,
    handleSortChange,
    handleEdit,
    handleAdd,
    handleEditSubmit,
    handleDelete,
    handleSaveAll,
    enabledFields,
    customFields,
    previewRecord,
  } = useFieldConfig();

  return (
    <Card
      title={`字段配置 - ${BIZ_TYPE_OPTIONS.find(o => o.value === bizType)?.label || bizType}`}
      extra={
        <Space>
          <Select
            value={bizType}
            onChange={setBizType}
            options={BIZ_TYPE_OPTIONS}
            style={{ width: 160 }}
          />
          <Button icon={<EyeOutlined />} onClick={() => setActiveTab(activeTab === 'list' ? 'preview' : 'list')}>
            {activeTab === 'list' ? '预览效果' : '返回配置'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增自定义字段
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAll}
            loading={saving}
            disabled={!dirty}
          >
            保存全部{dirty ? '*' : ''}
          </Button>
        </Space>
      }
    >
      {dirty && (
        <Alert
          type="warning"
          showIcon
          message="有未保存的修改"
          description="调整字段顺序/显隐/编辑后，需点击「保存全部」才会生效到数据库。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="字段列表" key="list">
          <FieldListTab
            rows={rows}
            loading={loading}
            onToggleEnabled={handleToggleEnabled}
            onSortChange={handleSortChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </TabPane>

        <TabPane tab="列表预览" key="preview">
          <ListPreviewTab
            bizType={bizType}
            enabledFields={enabledFields}
            previewRecord={previewRecord}
          />
        </TabPane>

        <TabPane tab="表单预览" key="form-preview">
          <FormPreviewTab
            customFields={customFields}
            previewForm={previewForm}
            previewRecord={previewRecord}
          />
        </TabPane>
      </Tabs>

      <EditFieldModal
        open={editOpen}
        editing={editing}
        form={form}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditSubmit}
      />
    </Card>
  );
};

export default FieldConfigPage;
