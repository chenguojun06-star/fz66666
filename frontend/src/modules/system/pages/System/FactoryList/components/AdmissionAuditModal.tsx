/**
 * 供应商准入审核弹窗（D-126）
 * 补全准入流程闭环：此前后端有审核接口但前端无入口，供应商会永远卡在"待审核"
 */
import React, { useEffect } from 'react';
import { Form, Input, Modal, Radio } from 'antd';

export interface AdmissionAuditTarget {
  id: string;
  name: string;
  currentStatus: string;
}

interface AdmissionAuditModalProps {
  open: boolean;
  target: AdmissionAuditTarget | null;
  loading: boolean;
  onCancel: () => void;
  onOk: (action: string, reason: string) => Promise<void>;
}

/** action 值与后端 FactoryOrchestrator.approveAdmission 的 switch 分支一一对应 */
const AUDIT_ACTIONS = [
  { value: 'approve', label: '通过准入' },
  { value: 'probation', label: '试用合作' },
  { value: 'reject', label: '拒绝准入' },
  { value: 'suspend', label: '暂停合作' },
];

const AdmissionAuditModal: React.FC<AdmissionAuditModalProps> = ({ open, target, loading, onCancel, onOk }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, target, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onOk(values.action, String(values.reason || '').trim());
  };

  return (
    <Modal
      open={open}
      title={`准入审核${target?.name ? ` - ${target.name}` : ''}`}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认审核"
      cancelText="取消"
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" initialValues={{ action: 'approve' }}>
        <Form.Item name="action" label="审核结果" rules={[{ required: true, message: '请选择审核结果' }]}>
          <Radio.Group options={AUDIT_ACTIONS} optionType="button" buttonStyle="solid" />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.action !== cur.action}>
          {({ getFieldValue }) => {
            const action = getFieldValue('action');
            const required = action === 'reject' || action === 'suspend';
            return (
              <Form.Item
                name="reason"
                label="审核意见"
                rules={required ? [{ required: true, message: '拒绝或暂停必须填写原因' }] : []}
              >
                <Input.TextArea rows={3} placeholder={required ? '请填写原因（必填）' : '选填'} maxLength={200} showCount={required} />
              </Form.Item>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AdmissionAuditModal;
