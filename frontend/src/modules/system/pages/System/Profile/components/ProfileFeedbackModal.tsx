import React from 'react';
import { Form, Input, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

type Props = {
  open: boolean;
  feedbackForm: ReturnType<typeof Form.useForm>[0];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
};

const ProfileFeedbackModal: React.FC<Props> = ({
  open,
  feedbackForm,
  submitting,
  onCancel,
  onSubmit,
}) => {
  return (
    <ResizableModal
      open={open}
      title="提交问题反馈"
      onCancel={onCancel}
      width="40vw"
      onOk={() => feedbackForm.submit()}
      confirmLoading={submitting}
      okText="提交"
    >
      <Form form={feedbackForm} layout="vertical" requiredMark={false} onFinish={onSubmit}>
        <Form.Item label="分类" name="category" initialValue="BUG" rules={[{ required: true }]}>
          <Select options={[
            { value: 'BUG', label: ' 系统缺陷' },
            { value: 'SUGGESTION', label: ' 功能建议' },
            { value: 'QUESTION', label: ' 使用咨询' },
            { value: 'OTHER', label: ' 其他' },
          ]} />
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="简要描述您遇到的问题" maxLength={100} />
        </Form.Item>
        <Form.Item label="详细描述" name="content" rules={[{ required: true, message: '请描述问题详情' }]}>
          <Input.TextArea rows={5} placeholder="请详细描述问题现象、操作步骤、期望结果等" maxLength={2000} showCount />
        </Form.Item>
        <Form.Item label="联系方式（选填）" name="contact">
          <Input placeholder="手机号或微信号，方便我们与您联系" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default ProfileFeedbackModal;
