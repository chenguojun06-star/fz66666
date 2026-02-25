import React from 'react';
import { Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { TemplateLibrary } from '@/types/style';

interface ApplyToStyleModalProps {
  open: boolean;
  form: FormInstance;
  activeRow: TemplateLibrary | null;
  styleNoOptions: Array<{ value: string; label: string }>;
  styleNoLoading: boolean;
  modalWidth: string | number;
  typeLabel: (t: string) => string;
  onCancel: () => void;
  onOk: () => void;
  onStyleNoSearch: (keyword: string) => void;
  onStyleNoDropdownOpen: (open: boolean) => void;
}

const ApplyToStyleModal: React.FC<ApplyToStyleModalProps> = ({
  open,
  form,
  activeRow,
  styleNoOptions,
  styleNoLoading,
  modalWidth,
  typeLabel,
  onCancel,
  onOk,
  onStyleNoSearch,
  onStyleNoDropdownOpen,
}) => {
  return (
    <ResizableModal
      title="套用到目标款号"
      open={open}
      centered
      onCancel={onCancel}
      onOk={onOk}
      okText="套用"
      cancelText="取消"
      width={modalWidth}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="模板">
          <Input
            value={activeRow ? `${activeRow.templateName || ''}（${typeLabel(activeRow.templateType)}）` : ''}
            disabled
          />
        </Form.Item>
        <Form.Item
          name="targetStyleNo"
          label="目标款号"
          rules={[{ required: true, message: '请输入目标款号' }]}
        >
          <Select
            allowClear
            showSearch={{ filterOption: false, onSearch: onStyleNoSearch }}
            loading={styleNoLoading}
            placeholder="搜索/选择款号"
            options={styleNoOptions}
            onOpenChange={onStyleNoDropdownOpen}
          />
        </Form.Item>
        <Form.Item name="mode" label="套用方式" initialValue="overwrite">
          <Select
            options={[
              { value: 'overwrite', label: '覆盖' },
              { value: 'append', label: '追加' },
            ]}
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default ApplyToStyleModal;
