import React from 'react';
import { Form, Input, Select } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import { REVIEW_STATUS_OPTIONS } from './helpers';

interface Props {
  open: boolean;
  saving: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onOk: () => void;
  onCancel: () => void;
}

const SampleReviewModal: React.FC<Props> = ({
  open,
  saving,
  form,
  onOk,
  onCancel,
}) => {
  return (
    <SmallModal
      title="记录样衣审核结论"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={saving}
      okText="保存结论"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="reviewStatus"
          label="审核结论"
          rules={[{ required: true, message: '请选择审核结论' }]}
        >
          <Select placeholder="请选择审核结论" options={REVIEW_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="reviewComment"
          label="审核评语（选填）"
        >
          <Input.TextArea
            rows={4}
            placeholder="可填写审核意见、改进建议等（不填写也可保存）"
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </SmallModal>
  );
};

export default SampleReviewModal;
