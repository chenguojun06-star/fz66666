import React, { useState, useCallback, useEffect } from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { DistributorProfile, DistributorLevel } from '../useDistributor';
import { SETTLEMENT_CYCLE_OPTIONS, DISTRIBUTOR_STATUS_OPTIONS } from '../distributorHelpers';

export interface ProfileModalProps {
  open: boolean;
  record: DistributorProfile | null;
  levels: DistributorLevel[];
  onClose: () => void;
  onOk: (profile: DistributorProfile) => Promise<void>;
}

/** 分销商档案编辑弹窗 */
const ProfileModal: React.FC<ProfileModalProps> = ({ open, record, levels, onClose, onOk }) => {
  const [form] = Form.useForm<DistributorProfile>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      form.setFieldsValue(record ?? {
        settlementCycle: 'CASH', status: 'ACTIVE', creditLimit: 0,
      });
    }
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk({ ...record, ...val }); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑分销商' : '新增分销商'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="分销商名称" name="distributorName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="公司/品牌名称" />
        </Form.Item>
        <Form.Item label="等级" name="distributorLevel">
          <Select allowClear placeholder="选择等级" options={levels.map(l => ({ label: l.levelName, value: l.levelCode }))} />
        </Form.Item>
        <Form.Item label="联系人" name="contactPerson"><Input /></Form.Item>
        <Form.Item label="联系电话" name="contactPhone"><Input /></Form.Item>
        <Form.Item label="地址" name="address"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item label="结算周期" name="settlementCycle" rules={[{ required: true }]}>
          <Select options={SETTLEMENT_CYCLE_OPTIONS} />
        </Form.Item>
        <Form.Item label="信用额度（0=不限）" name="creditLimit">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="状态" name="status">
          <Select options={DISTRIBUTOR_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item label="备注" name="remark"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default ProfileModal;
