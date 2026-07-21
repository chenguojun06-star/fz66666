import React from 'react';
import { Col, Form, Input, InputNumber, Row, Select, Switch } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { FormInstance } from 'antd';
import type { OrganizationUnit } from '@/types/system';
import { categoryOptions, ownerTypeOptions } from '../helpers';
import type { DialogMode } from '../hooks/useOrganizationModals';

interface DepartmentDialogProps {
  open: boolean;
  mode: DialogMode;
  form: FormInstance<any>;
  currentRecord: OrganizationUnit | null;
  submitLoading: boolean;
  departmentOptions: { value: string; label: string }[];
  onClose: () => void;
  onOk: () => void;
}

/** 部门新增/编辑弹窗 */
const DepartmentDialog: React.FC<DepartmentDialogProps> = ({
  open, mode, form, currentRecord, submitLoading, departmentOptions, onClose, onOk,
}) => (
  <ResizableModal
    open={open}
    title={mode === 'edit' ? '编辑部门' : '新增部门'}
    onCancel={onClose}
    onOk={onOk}
    confirmLoading={submitLoading}
    okText="保存"
    cancelText="取消"
    width="30vw"
    initialHeight={320}
  >
    <Form form={form} layout="vertical" style={{ padding: '4px 0' }}>
      <Form.Item name="id" hidden><Input /></Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="unitName" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input placeholder="例如：版房中心" maxLength={50} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="parentId" label="上级部门">
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="不选则为顶级部门"
              options={departmentOptions}
              notFoundContent={departmentOptions.length === 0 ? '暂无部门' : '无匹配'}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item name="ownerType" label="内外标签" rules={[{ required: true, message: '请选择' }]}>
            <Select options={ownerTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="category" label="部门分类">
            <Select
              allowClear
              showSearch
              placeholder="选择分类"
              options={categoryOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} precision={0} placeholder="默认 0" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      {mode === 'edit' && (
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="status" label="状态" valuePropName="checked" getValueFromEvent={(checked: boolean) => checked ? 'active' : 'inactive'} getValueProps={(v: string) => ({ checked: v !== 'inactive' })}>
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Col>
        </Row>
      )}
      {currentRecord?.pathNames && (
        <div style={{ color: 'var(--neutral-text-secondary)', padding: '0 16px', marginTop: 8 }}>
          当前路径：{currentRecord.pathNames}
        </div>
      )}
    </Form>
  </ResizableModal>
);

export default DepartmentDialog;
