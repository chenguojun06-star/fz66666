import React, { useMemo } from 'react';
import { Form, Input, Select, Tag } from 'antd';
import SmallModal from './SmallModal';
import { UnifiedDatePicker, dayjs } from './UnifiedDatePicker';

interface QuickEditModalProps {
  visible: boolean;
  loading: boolean;
  initialValues?: {
    remarks?: string;
    remark?: string;
    expectedShipDate?: string | null;
    urgencyLevel?: 'normal' | 'urgent';
  };
  onSave: (values: { remarks: string; expectedShipDate: string | null; urgencyLevel: 'normal' | 'urgent' }) => Promise<void>;
  onCancel: () => void;
  title?: string;
}

const AI_INSPECTION_REGEX = /^\[AI巡检\]/;

const QuickEditModal: React.FC<QuickEditModalProps> = ({
  visible,
  loading,
  initialValues,
  onSave,
  onCancel,
  title = '编辑备注和预计出货',
}) => {
  const [form] = Form.useForm();

  const { aiRemarks, userRemarks } = useMemo(() => {
    const raw = initialValues?.remarks || initialValues?.remark || '';
    const lines = raw.split('\n');
    const aiLines: string[] = [];
    const userLines: string[] = [];
    for (const line of lines) {
      if (AI_INSPECTION_REGEX.test(line)) {
        aiLines.push(line);
      } else if (line.trim()) {
        userLines.push(line);
      }
    }
    return { aiRemarks: aiLines, userRemarks: userLines.join('\n') };
  }, [initialValues?.remarks, initialValues?.remark]);

  React.useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        remarks: userRemarks,
        expectedShipDate: initialValues?.expectedShipDate ? dayjs(initialValues.expectedShipDate) : null,
        urgencyLevel: initialValues?.urgencyLevel || 'normal',
      });
    }
  }, [visible, initialValues, form, userRemarks]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const newUserRemark = values.remarks?.trim() || '';
      const combined = aiRemarks.length > 0
        ? aiRemarks.join('\n') + (newUserRemark ? '\n' + newUserRemark : '')
        : newUserRemark;
      await onSave({
        remarks: combined,
        expectedShipDate: values.expectedShipDate ? dayjs(values.expectedShipDate).format('YYYY-MM-DD') : null,
        urgencyLevel: values.urgencyLevel || 'normal',
      });
      form.resetFields();
    } catch {
      // Intentionally empty
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <SmallModal
      title={title}
      open={visible}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleOk} style={{ marginTop: 16 }}>
        <Form.Item label="紧急程度" name="urgencyLevel">
          <Select
            options={[
              { label: '普通', value: 'normal' },
              { label: '急单', value: 'urgent' },
            ]}
            placeholder="请选择紧急程度"
          />
        </Form.Item>
        <Form.Item label="预计出货日期" name="expectedShipDate">
          <UnifiedDatePicker style={{ width: '100%' }} />
        </Form.Item>
        {aiRemarks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--color-text-tertiary, #999)' }}>
              AI巡检记录（不可编辑）
            </div>
            <div style={{
              background: 'var(--color-bg-layout, #f5f5f5)',
              borderRadius: 6,
              padding: '8px 12px',
              maxHeight: 120,
              overflowY: 'auto',
              fontSize: 12,
              lineHeight: '20px',
              color: 'var(--color-text-secondary, #666)',
            }}>
              {aiRemarks.map((line, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: i < aiRemarks.length - 1 ? 4 : 0 }}>
                  <Tag color="orange" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 4px', flexShrink: 0 }}>AI</Tag>
                  <span>{line.replace(/^\[AI巡检\]\s*/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Form.Item
          label="备注"
          name="remarks"
          rules={[{ max: 500, message: '备注不能超过500字' }]}
        >
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="请输入备注"
            maxLength={500}
            showCount
            autoFocus
          />
        </Form.Item>
      </Form>
    </SmallModal>
  );
};

export default QuickEditModal;
