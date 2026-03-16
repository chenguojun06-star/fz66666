import React from 'react';
import { Form, Input, Modal } from 'antd';

export interface RejectReasonModalProps {
  /** 是否显示 */
  open: boolean;
  /** 弹窗标题，如 "退回修改 - 尺寸表" */
  title?: string;
  /** 标题下方的说明文字（可选，支持 ReactNode） */
  description?: React.ReactNode;
  /** 确认按钮文字，默认 "确认退回" */
  okText?: string;
  /** 取消按钮文字，默认 "取消" */
  cancelText?: string;
  /** 退回原因输入框占位符 */
  placeholder?: string;
  /** 表单字段标签，默认 "退回原因" */
  fieldLabel?: string;
  /** 是否必填，默认 true */
  required?: boolean;
  /** 确认按钮是否显示 danger 样式，默认 true */
  okDanger?: boolean;
  /** 确认时的回调，参数为输入的原因文本 */
  onOk: (reason: string) => Promise<void> | void;
  /** 关闭/取消回调 */
  onCancel: () => void;
  /** 确认按钮加载状态 */
  loading?: boolean;
}

/**
 * 退回原因确认弹窗 —— 通用组件
 *
 * 替代各处 modal.confirm() 内嵌 TextArea 的方案。
 * 根本原因：modal.confirm() 对 autoSize TextArea 的高度计算是静态的，
 * textarea 内容增长后会把底部按钮顶出去，导致按钮被遮挡/点不到。
 * 本组件使用真正的 <Modal> + Form 来解决此问题。
 */
const RejectReasonModal: React.FC<RejectReasonModalProps> = ({
  open,
  title = '退回修改',
  description,
  okText = '确认退回',
  cancelText = '取消',
  placeholder = '请输入退回原因（必填）',
  fieldLabel = '退回原因',
  required = true,
  okDanger = true,
  onOk,
  onCancel,
  loading = false,
}) => {
  const [form] = Form.useForm<{ reason: string }>();

  const handleOk = async () => {
    const values = await form.validateFields();
    const reason = String(values.reason || '').trim();
    await onOk(reason);
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  // 关闭时重置表单
  React.useEffect(() => {
    if (open) {
      form.resetFields();
    }
  }, [open, form]);

  return (
    <Modal
      open={open}
      title={title}
      width="30vw"
      style={{ minWidth: 380 }}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{ danger: okDanger, type: 'default', loading }}
      onOk={handleOk}
      onCancel={handleCancel}
      destroyOnHidden
      
    >
      {description && (
        <div style={{ marginBottom: 16, color: 'var(--text-secondary, #888)' }}>
          {description}
        </div>
      )}
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="reason"
          label={fieldLabel}
          rules={required ? [{ required: true, message: `请输入${fieldLabel}` }] : []}
        >
          <Input.TextArea
            placeholder={placeholder}
            rows={4}
            maxLength={200}
            showCount
            autoFocus
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RejectReasonModal;
