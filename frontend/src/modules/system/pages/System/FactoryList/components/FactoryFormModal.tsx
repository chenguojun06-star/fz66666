import React from 'react';
import { Button, Col, Form, Input, InputNumber, Row, Select, Space, Tooltip } from 'antd';
import type { FormInstance } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import type { OrganizationUnit, User } from '@/types/system';
import { getDepartmentLabel } from '../factoryListHelpers';

interface FactoryFormModalProps {
  open: boolean;
  mode: 'create' | 'view' | 'edit';
  form: FormInstance;
  submitLoading: boolean;
  modalWidth: string | string | number;
  isMobile: boolean;
  initialHeight: number;
  departmentOptions: OrganizationUnit[];
  userOptions: User[];
  businessLicenseUrl?: string;
  onCancel: () => void;
  onOk: () => void;
}

const FactoryFormModal: React.FC<FactoryFormModalProps> = ({
  open, mode, form, submitLoading, modalWidth, isMobile, initialHeight,
  departmentOptions, userOptions, businessLicenseUrl, onCancel, onOk,
}) => {
  return (
    <ResizableModal
      open={open}
      title={mode === 'create' ? '新增供应商' : mode === 'edit' ? '编辑供应商' : '供应商详情'}
      onCancel={onCancel}
      onOk={mode === 'view' ? undefined : onOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitLoading}
      footer={
        mode === 'view' ? (
          <div className="modal-footer-actions">
            <Button onClick={onCancel}>关闭</Button>
          </div>
        ) : undefined
      }
      width={modalWidth}
      initialHeight={initialHeight}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
    >
      <Form form={form} layout="vertical" disabled={mode === 'view'}>
        <Form.Item name="supplierType" label="供应商类型" rules={[{ required: true, message: '请选择供应商类型' }]}>
          <Select
            id="supplierType"
            options={[
              { value: 'MATERIAL', label: '面辅料供应商' },
              { value: 'OUTSOURCE', label: '外发供应商' },
            ]}
          />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item
            name="factoryType"
            label={
              <Space size={4}>
                <span>内外标签</span>
                <Tooltip
                  title={
                    <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                      <div><strong>内部工厂</strong>：组织内部产能，完成后按人员工序统计工资（<span style={{ color: '#ffd666' }}>工资结算</span>）</div>
                      <div><strong>外部工厂</strong>：外发加工厂，完成后按工厂结算加工费（<span style={{ color: '#95de64' }}>订单结算</span>）</div>
                    </div>
                  }
                >
                  <QuestionCircleOutlined style={{ color: 'var(--color-text-tertiary, #999)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            }
            rules={[{ required: true, message: '请选择内外标签' }]}
          >
            <Select
              id="factoryType"
              onChange={(val) => {
                if (val === 'INTERNAL') {
                  form.setFieldsValue({ contactPerson: '', contactPhone: '' });
                } else {
                  form.setFieldsValue({ managerId: undefined });
                }
              }}
              options={[
                { value: 'INTERNAL', label: '内部工厂（工资结算）' },
                { value: 'EXTERNAL', label: '外部工厂（订单结算）' }
              ]}
            />
          </Form.Item>
          <Form.Item name="parentOrgUnitId" label="归属部门">
            <Select
              id="parentOrgUnitId"
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder={departmentOptions.length === 0 ? '请先在系统设置中创建部门' : '请选择归属部门'}
              options={departmentOptions.map((item) => ({
                value: String(item.id || ''),
                label: getDepartmentLabel(item),
              }))}
            />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="factoryCode" label="供应商编码" rules={[{ required: true, message: '请输入供应商编码' }]}>
            <Input id="factoryCode" placeholder="请输入供应商编码" autoComplete="off" />
          </Form.Item>
          <Form.Item name="factoryName" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input id="factoryName" placeholder="请输入供应商名称" />
          </Form.Item>
        </div>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item noStyle dependencies={['factoryType']}>
              {({ getFieldValue }) => {
                const factoryType = getFieldValue('factoryType');
                const isInternal = factoryType === 'INTERNAL';
                return (
                  <>
                    {isInternal ? (
                      <Form.Item name="managerId" label="负责人">
                        <Select
                          id="managerId"
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择系统用户"
                          options={userOptions.map(u => ({ label: `${u.name} (${u.phone || '-'})`, value: String(u.id) }))}
                          onChange={(val) => {
                            const user = userOptions.find(u => String(u.id) === val);
                            if (user) {
                              form.setFieldsValue({
                                contactPerson: user.name,
                                contactPhone: user.phone,
                              });
                            }
                          }}
                        />
                      </Form.Item>
                    ) : (
                      <Form.Item name="contactPerson" label="联系人">
                        <Input id="contactPerson" placeholder="请输入联系人" />
                      </Form.Item>
                    )}
                    {isInternal && <Form.Item name="contactPerson" hidden><Input id="contactPersonHidden" /></Form.Item>}
                  </>
                );
              }}
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="contactPhone" label="联系电话">
              <Input id="contactPhone" placeholder="请输入联系电话" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="address" label="地址">
              <Input id="address" placeholder="请输入地址" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="dailyCapacity"
          label="日产能（件/天）"
          extra="填写实际日均可生产件数，直接影响排产建议评分的准确性"
        >
          <InputNumber
            id="dailyCapacity"
            min={1}
            max={99999}
            precision={0}
            placeholder="请输入日产能，如：200"
            style={{ width: '100%' }}
            suffix="件/天"
          />
        </Form.Item>
        <Form.Item name="businessLicense" label="营业执照" hidden>
          <Input id="businessLicense" />
        </Form.Item>
        <Form.Item label="营业执照图片">
          <ImageUploadBox
            label="营业执照"
            maxSizeMB={10}
            disabled={mode === 'view'}
            value={businessLicenseUrl || null}
            onChange={(url) => form.setFieldsValue({ businessLicense: url ?? undefined })}
          />
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)', marginTop: 4 }}>支持jpg、png格式，最大10MB（非必填）</div>
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea id="remark" rows={3} placeholder="请输入备注" />
        </Form.Item>
        <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
          <Select
            id="status"
            options={[
              { value: 'active', label: '营业中' },
              { value: 'inactive', label: '停业' },
            ]}
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default FactoryFormModal;
