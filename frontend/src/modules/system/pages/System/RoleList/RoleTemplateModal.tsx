import React from 'react';
import { Alert, Button, Modal } from 'antd';
import RoleTemplateSelector, { RoleTemplate } from './components/RoleTemplateSelector';

interface RoleTemplateModalProps {
  open: boolean;
  selectedTemplate?: RoleTemplate;
  onSelect: (id: number | undefined, template?: RoleTemplate) => void;
  onCancel: () => void;
  onApply: (template: RoleTemplate) => void;
}

/**
 * 角色模板选择弹窗
 */
const RoleTemplateModal: React.FC<RoleTemplateModalProps> = ({
  open,
  selectedTemplate,
  onSelect,
  onCancel,
  onApply,
}) => {
  const handleCancel = () => {
    onCancel();
  };

  return (
    <Modal
      title="选择角色模板"
      open={open}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>取消</Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!selectedTemplate}
          onClick={() => {
            if (selectedTemplate) {
              onApply(selectedTemplate);
            }
          }}
        >
          应用模板创建角色
        </Button>,
      ]}
      width={720}
      destroyOnClose
    >
      <RoleTemplateSelector
        value={selectedTemplate?.id}
        onChange={(id, template) => onSelect(id, template)}
      />
      {selectedTemplate && (
        <Alert
          message="提示"
          description={`已选择「${selectedTemplate.templateName}」模板。点击「下一步：编辑角色」继续创建角色，权限配置可在创建后编辑。`}
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </Modal>
  );
};

export default RoleTemplateModal;
