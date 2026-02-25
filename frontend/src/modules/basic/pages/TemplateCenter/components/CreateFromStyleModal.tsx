import React from 'react';
import { Form, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

interface CreateFromStyleModalProps {
  open: boolean;
  form: FormInstance;
  styleNoOptions: Array<{ value: string; label: string }>;
  styleNoLoading: boolean;
  modalWidth: string | number;
  onCancel: () => void;
  onOk: () => void;
  onStyleNoSearch: (keyword: string) => void;
  onStyleNoDropdownOpen: (open: boolean) => void;
}

const CreateFromStyleModal: React.FC<CreateFromStyleModalProps> = ({
  open,
  form,
  styleNoOptions,
  styleNoLoading,
  modalWidth,
  onCancel,
  onOk,
  onStyleNoSearch,
  onStyleNoDropdownOpen,
}) => {
  return (
    <ResizableModal
      title="按款号生成模板"
      open={open}
      centered
      onCancel={onCancel}
      onOk={onOk}
      okText="生成"
      cancelText="取消"
      width={modalWidth}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="sourceStyleNo"
          label="来源款号"
          rules={[{ required: true, message: '请输入来源款号' }]}
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
        <Form.Item name="templateTypes" label="生成类型">
          <Select
            mode="multiple"
            options={[
              { value: 'bom', label: 'BOM' },
              { value: 'size', label: '尺寸' },
              { value: 'process', label: '工序进度单价' },
            ]}
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default CreateFromStyleModal;
