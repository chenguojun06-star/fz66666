import React, { useState } from 'react';
import { App, Col, Form, Input, Row, Select, Tooltip } from 'antd';
import CustomerSelect from '@/components/common/CustomerSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictQuickManageModal from '@/components/common/DictQuickManageModal';
import ResizableModal from '@/components/common/ResizableModal';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import CustomerFormModal from '@/modules/crm/pages/CrmDashboard/components/CustomerFormModal';
import factoryApi from '@/services/system/factoryApi';
import { notifyDataUpdated } from '@/utils/dataEvents';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

interface BasicInfoSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
  /** 图片资产左栏（主图+缩略图+操作），合并进基础信息区展示 */
  coverSlot?: React.ReactNode;
}

/** 字段维护链接：点击直接弹窗维护，无需跳转字典管理/基础资料页 */
const MaintainLink: React.FC<{ tooltip: string; onClick: () => void }> = ({ tooltip, onClick }) => (
  <Tooltip title={tooltip}>
    <a
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{ marginLeft: 6, color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
    >
      维护
    </a>
  </Tooltip>
);

/** 字典字段维护：点击弹出快捷维护弹窗（增/删/改名词条），变更即时同步当前下拉 */
const DictMaintainHint: React.FC<{ dictType: string; fieldName: string }> = ({ dictType, fieldName }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MaintainLink tooltip={`点击弹窗维护${fieldName}选项`} onClick={() => setOpen(true)} />
      <DictQuickManageModal open={open} dictType={dictType} title={fieldName} onClose={() => setOpen(false)} />
    </>
  );
};

/** 客户字段维护：复用 CRM 客户表单弹窗就地新建，成功后同页客户下拉即时刷新 */
const CustomerMaintainHint: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MaintainLink tooltip="点击弹窗新增客户" onClick={() => setOpen(true)} />
      <CustomerFormModal
        open={open}
        editData={null}
        onClose={() => setOpen(false)}
        onSuccess={() => notifyDataUpdated('customer')}
      />
    </>
  );
};

/** 供应商快捷新增弹窗（名称+联系人+电话，物料供应商） */
const SupplierQuickAddModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await factoryApi.create({
        factoryName: values.factoryName.trim(),
        contactPerson: values.contactPerson?.trim() || undefined,
        contactPhone: values.contactPhone?.trim() || undefined,
        supplierType: 'MATERIAL',
        factoryType: 'EXTERNAL',
        status: 'active',
      });
      message.success(`供应商"${values.factoryName}"已创建`);
      notifyDataUpdated('supplier');
      form.resetFields();
      onClose();
    } catch {
      message.error('创建供应商失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResizableModal
      title="新增供应商"
      open={open}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={submitting}
      width={420}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="factoryName" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
          <Input placeholder="请输入供应商名称" maxLength={100} />
        </Form.Item>
        <Form.Item name="contactPerson" label="联系人">
          <Input placeholder="请输入联系人（选填）" maxLength={50} />
        </Form.Item>
        <Form.Item name="contactPhone" label="联系电话">
          <Input placeholder="请输入联系电话（选填）" maxLength={30} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

/** 供应商字段维护：就地新建供应商，成功后同页供应商下拉即时刷新 */
const SupplierMaintainHint: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MaintainLink tooltip="点击弹窗新增供应商" onClick={() => setOpen(true)} />
      <SupplierQuickAddModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/**
 * 区1：基础信息
 * 按样衣详情页-基础信息 Tab 设计稿完全重写
 * 字段顺序：款名称 / 款式编码 / 商品分类(必填) / 虚拟分类 / 商品类型 / 设计师 / 商品主题 / 客户 / 供应商 / 备注 / 创建时间 / 完成时间 / 交板日期
 *
 * 注意：
 *  - 客户字段从原 CustomerInfoSection 迁移至此，使用 CustomerSelect 组件（同步 customerId）
 *  - 备注字段从原 TimeRemarkSection 迁移至此，最多500字
 *  - 时间信息（创建/完成/交板日期）从原独立时间区块合并至此，减少分区数量
 *  - 设计师独立使用 designer 字段，与原 sampleNo 解耦（sampleNo 仍保留向后兼容）
 *  - 商品类型 / 商品主题 / 供应商 为本次新增字段
 */
const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  _form,
  currentStyle,
  editLocked,
  isFieldLocked,
  isNewPage,
  coverSlot,
}) => {
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const { options: seasonOptions } = useDictOptions('season', SEASON_CODE_OPTIONS);

  return (
    <SectionBox title="基础信息" usePrimaryHighlight>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 左栏：图片资产（主图180px+缩略图+操作，与基础信息合并为一个区块） */}
        {coverSlot ? (
          <div style={{ width: 188, flexShrink: 0, minWidth: 0 }}>{coverSlot}</div>
        ) : null}

        {/* 右栏：基础信息表单字段 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <Row gutter={[16, 8]}>
        {/* 款名称（必填，全宽） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="styleName"
            label={
              <span>
                款名称
                <DictMaintainHint dictType="style_name" fieldName="款名称" />
              </span>
            }
            rules={[{ required: true, message: '请输入款名称' }]}
            style={{ marginBottom: 8 }}
          >
            <DictAutoComplete
              dictType="style_name"
              placeholder="请输入或选择款名称"
              disabled={editLocked}
              style={{ width: '100%' }}
              id="styleName"
            />
          </Form.Item>
        </Col>

        {/* 款式编码（必填，新建可填，编辑锁定） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="styleNo"
            label="款式编码"
            rules={[{ required: true, message: '请输入款式编码' }]}
            style={{ marginBottom: 8 }}
          >
            <Input
              id="styleNo"
              placeholder="请输入款式编码"
              disabled={editLocked || Boolean(currentStyle?.id)}
              maxLength={64}
              suffix={
                isNewPage || !currentStyle?.id ? (
                  <Tooltip title="点击重新生成编码">
                    <span
                      style={{ color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => {
                        // 重新同步：清空当前编码，由后端保存时自动生成
                        _form.setFieldValue('styleNo', '');
                      }}
                    >
                      重新同步
                    </span>
                  </Tooltip>
                ) : null
              }
            />
          </Form.Item>
        </Col>

        {/* 商品分类（必填） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="category"
            label={
              <span>
                <span style={{ color: 'var(--color-danger)' }}>*</span> 商品分类
                <DictMaintainHint dictType="category" fieldName="商品分类" />
              </span>
            }
            rules={[{ required: true, message: '请选择商品分类' }]}
            style={{ marginBottom: 8 }}
          >
            <Select
              id="category"
              placeholder="请选择商品分类"
              disabled={isFieldLocked(currentStyle?.category)}
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={categoryOptions}
            />
          </Form.Item>
        </Col>

        {/* 虚拟分类（季节字段复用） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="season"
            label={
              <span>
                虚拟分类
                <DictMaintainHint dictType="season" fieldName="虚拟分类" />
              </span>
            }
            style={{ marginBottom: 8 }}
          >
            <Select
              id="season"
              placeholder="请选择虚拟分类"
              disabled={isFieldLocked(currentStyle?.season)}
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={seasonOptions}
            />
          </Form.Item>
        </Col>

        {/* 商品类型（默认成品/半成品，支持字典维护扩展自定义类型） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="productType"
            label="商品类型"
            style={{ marginBottom: 8 }}
          >
            <DictAutoComplete
              dictType="product_type"
              quickManageTitle="商品类型"
              fallbackOptions={['成品', '半成品']}
              placeholder="请选择或输入商品类型..."
              disabled={editLocked}
            />
          </Form.Item>
        </Col>

        {/* 设计师 */}
        <Col xs={24} md={12}>
          <Form.Item
            name="designer"
            label={
              <span>
                设计师
                <DictMaintainHint dictType="designer" fieldName="设计师" />
              </span>
            }
            style={{ marginBottom: 8 }}
          >
            <DictAutoComplete
              dictType="designer"
              placeholder="请输入或选择设计师"
              disabled={editLocked}
              style={{ width: '100%' }}
              id="designer"
            />
          </Form.Item>
        </Col>

        {/* 商品主题 */}
        <Col xs={24} md={12}>
          <Form.Item
            name="theme"
            label={
              <span>
                商品主题
                <DictMaintainHint dictType="style_theme" fieldName="商品主题" />
              </span>
            }
            style={{ marginBottom: 8 }}
          >
            <DictAutoComplete
              dictType="style_theme"
              placeholder="请输入或选择商品主题"
              disabled={editLocked}
              style={{ width: '100%' }}
              id="theme"
            />
          </Form.Item>
        </Col>

        {/* 客户（从 CustomerInfoSection 迁移至此） */}
        <Col xs={24} md={12}>
          <Form.Item name="customerId" noStyle hidden>
            <Input id="customerId" />
          </Form.Item>
          <Form.Item
            name="customer"
            label={
              <span>
                客户
                <CustomerMaintainHint />
              </span>
            }
            style={{ marginBottom: 8 }}
          >
            <CustomerSelect
              id="customer"
              placeholder="搜索或输入客户名称"
              disabled={isFieldLocked(currentStyle?.customer)}
              onChange={(_value, option) => {
                const cid = option?.customerId;
                if (cid) {
                  _form.setFieldsValue({ customerId: String(cid) });
                } else {
                  _form.setFieldsValue({ customerId: undefined });
                }
              }}
            />
          </Form.Item>
        </Col>

        {/* 供应商（新增字段） */}
        <Col xs={24} md={12}>
          <Form.Item name="supplierId" noStyle hidden>
            <Input id="supplierId" />
          </Form.Item>
          <Form.Item name="supplierContactPerson" noStyle hidden>
            <Input id="supplierContactPerson" />
          </Form.Item>
          <Form.Item name="supplierContactPhone" noStyle hidden>
            <Input id="supplierContactPhone" />
          </Form.Item>
          <Form.Item
            name="supplier"
            label={
              <span>
                供应商
                <SupplierMaintainHint />
              </span>
            }
            style={{ marginBottom: 8 }}
          >
            <SupplierSelect
              id="supplier"
              placeholder="请选择或输入供应商"
              disabled={editLocked}
              style={{ width: '100%' }}
              onChange={(_value, option) => {
                if (option?.supplierId) {
                  _form.setFieldsValue({
                    supplierId: String(option.supplierId),
                    supplierContactPerson: option.supplierContactPerson || undefined,
                    supplierContactPhone: option.supplierContactPhone || undefined,
                  });
                } else {
                  _form.setFieldsValue({
                    supplierId: undefined,
                    supplierContactPerson: undefined,
                    supplierContactPhone: undefined,
                  });
                }
              }}
            />
          </Form.Item>
        </Col>

        {/* 备注（从 TimeRemarkSection 迁移至此，最多500字，showCount 显示计数） */}
        <Col xs={24}>
          <Form.Item
            name="remark"
            label="备注"
            style={{ marginBottom: 8 }}
          >
            <Input.TextArea
              id="remark"
              autoSize={{ minRows: 3, maxRows: 6 }}
              maxLength={500}
              showCount
              placeholder="请输入备注（面料/版型/特殊工艺说明等）"
              disabled={isFieldLocked(currentStyle?.remark)}
            />
          </Form.Item>
        </Col>

        {/* 时间信息（从 TimeRemarkSection 迁移至此：创建/完成为系统字段，交板日期必填） */}
        <Col xs={24} md={8}>
          <Form.Item name="createTime" label="创建时间" style={{ marginBottom: 8 }}>
            <UnifiedDatePicker
              id="createTime"
              disabled
              allowClear={false}
              placeholder="系统自动生成"
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="completedTime" label="完成时间" style={{ marginBottom: 8 }}>
            <UnifiedDatePicker
              id="completedTime"
              disabled
              allowClear={false}
              placeholder="全部环节入库完成后自动生成"
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="deliveryDate" label="交板日期" rules={[{ required: true, message: '请选择交板日期' }]} style={{ marginBottom: 8 }}>
            <UnifiedDatePicker
              id="deliveryDate"
              disabled={isFieldLocked(currentStyle?.deliveryDate)}
              allowClear
              placeholder="请选择交板日期"
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
        </div>
      </div>
    </SectionBox>
  );
};

export default BasicInfoSection;
