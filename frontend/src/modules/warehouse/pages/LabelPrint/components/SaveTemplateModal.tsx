import React from 'react';
import { Modal, Input } from 'antd';

interface SaveTemplateModalProps {
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  open,
  value,
  onChange,
  onOk,
  onCancel,
}) => (
  <Modal
    title="保存为模板"
    open={open}
    onOk={() => void onOk()}
    onCancel={onCancel}
    okText="保存"
    destroyOnHidden
  >
    <Input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="请输入模板名称"
      maxLength={50}
      autoFocus
      onPressEnter={() => void onOk()}
    />
  </Modal>
);

export default SaveTemplateModal;
