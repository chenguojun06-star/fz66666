import React, { useEffect } from 'react';
import { Button, Form, Input, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ExtFieldsSection, { flattenExtJson } from '@/components/common/SchemaForm/ExtFieldsSection';
import SchemaDescriptions from '@/components/common/SchemaDescriptions';
import SchemaPrint from '@/components/common/SchemaPrint';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { Customer } from '@/services/crm/customerApi';
import { CUSTOMER_LEVEL_OPTIONS, CUSTOMER_STATUS_OPTIONS, type DialogMode } from './customerHelpers';

interface CustomerDialogProps {
  open: boolean;
  mode: DialogMode;
  form: FormInstance;
  currentRecord: Customer | null;
  saving: boolean;
  modalWidth: number | string;
  isMobile: boolean;
  fieldConfigs: FieldConfigItem[];
  customFields: FieldConfigItem[];
  onCancel: () => void;
  onSave: () => void;
  onEdit: () => void;
}

const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open, mode, form, currentRecord, saving,
  modalWidth, isMobile, fieldConfigs, customFields,
  onCancel, onSave, onEdit,
}) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === 'create') {
      form.setFieldsValue({
        companyName: '',
        contactPerson: '',
        contactPhone: '',
        industry: '',
        source: '',
        customerLevel: 'NORMAL',
        status: 'ACTIVE',
        remark: '',
      });
      return;
    }

    form.setFieldsValue({
      companyName: currentRecord?.companyName,
      contactPerson: currentRecord?.contactPerson,
      contactPhone: currentRecord?.contactPhone,
      contactEmail: currentRecord?.contactEmail,
      address: currentRecord?.address,
      customerLevel: currentRecord?.customerLevel || 'NORMAL',
      industry: currentRecord?.industry,
      source: currentRecord?.source,
      status: currentRecord?.status || 'ACTIVE',
      remark: currentRecord?.remark,
      ...flattenExtJson(currentRecord?.extJson),
    });
  }, [currentRecord, mode, form, open, customFields]);

  const renderFooter = () => {
    if (mode !== 'view') return undefined;
    return (
      <div className="modal-footer-actions">
        <Space>
          <SchemaPrint
            mode="detail"
            fields={fieldConfigs}
            data={currentRecord as unknown as Record<string, unknown>}
            title={`客户详情 - ${currentRecord?.companyName || ''}`}
            subtitle="客户档案打印"
            column={2}
          />
          <Button onClick={onEdit} type="primary">
            编辑
          </Button>
          <Button onClick={onCancel}>关闭</Button>
        </Space>
      </div>
    );
  };

  return (
    <ResizableModal
      open={open}
      title={mode === 'create' ? '新增客户' : mode === 'edit' ? '编辑客户' : '客户详情'}
      onCancel={onCancel}
      onOk={mode === 'view' ? undefined : onSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      footer={renderFooter()}
      width={modalWidth}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.8 : 760}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
    >
      {mode === 'view' && currentRecord ? (
        <SchemaDescriptions
          fields={fieldConfigs}
          data={currentRecord as unknown as Record<string, unknown>}
          column={2}
          title="客户详情"
          filterEnabled
          size="default"
        />
      ) : (
        <Form form={form} layout="vertical" disabled={mode === 'view'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="companyName" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]}>
              <Input placeholder="请输入客户名称" />
            </Form.Item>
            <Form.Item name="customerLevel" label="客户标签" rules={[{ required: true, message: '请选择客户标签' }]}>
              <Select options={CUSTOMER_LEVEL_OPTIONS} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="contactPerson" label="联系人">
              <Input placeholder="请输入联系人" />
            </Form.Item>
            <Form.Item name="contactPhone" label="联系电话">
              <Input placeholder="请输入联系电话" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="industry" label="行业/品类">
              <Input placeholder="请输入行业或品类" />
            </Form.Item>
            <Form.Item name="source" label="客户来源">
              <Input placeholder="请输入客户来源" />
            </Form.Item>
          </div>
          <Form.Item name="address" label="地址">
            <Input placeholder="请输入地址" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={CUSTOMER_STATUS_OPTIONS} />
          </Form.Item>
          {customFields.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14, color: '#1f1f1f' }}>扩展字段</div>
              <ExtFieldsSection
                fields={customFields}
                disabled={mode === 'view'}
                colSpan={12}
              />
            </div>
          )}
        </Form>
      )}
    </ResizableModal>
  );
};

export default CustomerDialog;
