import React, { useState } from 'react';
import { Col, Form, Input, Row, Select, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import CustomerSelect from '@/components/common/CustomerSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import StaffSelect from '@/components/common/StaffSelect';
import SupplierSelect from '@/components/common/SupplierSelect';
import QuickManageModal from '@/components/common/QuickManageModal';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

interface BasicInfoSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
  /** 图片资产左栏（主图+缩略图+操作），合并进基础信息区展示 */
  coverSlot?: React.ReactNode;
}

/** 字段维护齿轮（统一入口，与 DictAutoComplete/SupplierSelect/CustomerSelect 内嵌齿轮同一形态）：
 *  用于 Select 类字段的输入框 suffix，点击弹通用维护弹窗，变更即时同步当前下拉 */
const MaintainGear: React.FC<{ dictType: string; fieldName: string; disabled?: boolean }> = ({
  dictType, fieldName, disabled,
}) => {
  const [open, setOpen] = useState(false);
  if (disabled) return null;
  return (
    <>
      <Tooltip title={`维护${fieldName}选项（新增 / 删除 / 改名）`}>
        <SettingOutlined
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'pointer' }}
        />
      </Tooltip>
      <QuickManageModal open={open} mode="dict" dictType={dictType} title={fieldName} onClose={() => setOpen(false)} />
    </>
  );
};

/**
 * 区1：基础信息
 * 按样衣详情页-基础信息 Tab 设计稿完全重写
 * 字段顺序：款名称 / 款式编码 / 商品分类(必填) / 季节分类 / 商品类型 / 设计师 / 商品主题 / 客户 / 供应商 / 备注 / 创建时间 / 完成时间 / 交板日期
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
      {/* 图片资产：置于表单最上方通栏（款名上方），一排方形卡片+➕上传（最多9张，拖拽/粘贴）。
          与下方字段行（Row gutter 负 margin 抵消后）左边缘一致，保证图片卡与字段上下整齐对齐 */}
      {coverSlot ? (
        <div style={{ padding: '0 0 10px', marginBottom: 12, borderBottom: '1px dashed rgba(0,0,0,0.06)' }}>
          {coverSlot}
        </div>
      ) : null}

      {/* 表单字段 */}
      <div style={{ minWidth: 0 }}>
        <Row gutter={[16, 8]}>
        {/* 款名称（必填，自由命名） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="styleName"
            label="款名称"
            rules={[{ required: true, message: '请输入款名称' }]}
            style={{ marginBottom: 8 }}
          >
            <Input
              id="styleName"
              placeholder="请输入款名称"
              disabled={editLocked}
              maxLength={100}
              style={{ width: '100%' }}
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
            label="商品分类"
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
              suffix={<MaintainGear dictType="category" fieldName="商品分类" disabled={editLocked} />}
            />
          </Form.Item>
        </Col>

        {/* 季节分类（原"虚拟分类"更名，season 字段复用） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="season"
            label="季节分类"
            style={{ marginBottom: 8 }}
          >
            <Select
              id="season"
              placeholder="请选择季节分类"
              disabled={isFieldLocked(currentStyle?.season)}
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={seasonOptions}
              suffix={<MaintainGear dictType="season" fieldName="季节分类" disabled={editLocked} />}
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
              enableQuickManage={!editLocked}
            />
          </Form.Item>
        </Col>

        {/* 设计师（内部人员，可搜索选择） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="designer"
            label="设计师"
            style={{ marginBottom: 8 }}
          >
            <StaffSelect
              id="designer"
              placeholder="搜索或选择设计师"
              disabled={editLocked}
            />
          </Form.Item>
        </Col>

        {/* 商品品牌（原"商品主题"更名，dictType 保持 style_theme 兼容历史数据） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="theme"
            label="商品品牌"
            style={{ marginBottom: 8 }}
          >
            <DictAutoComplete
              dictType="style_theme"
              quickManageTitle="商品品牌"
              placeholder="请输入或选择商品品牌"
              disabled={editLocked}
              style={{ width: '100%' }}
              id="theme"
              enableQuickManage={!editLocked}
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
            label="客户"
            style={{ marginBottom: 8 }}
          >
            <CustomerSelect
              id="customer"
              placeholder="搜索或输入客户名称"
              disabled={isFieldLocked(currentStyle?.customer)}
              enableQuickManage={!isFieldLocked(currentStyle?.customer)}
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
            label="供应商"
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

        {/* 备注（从 TimeRemarkSection 迁移至此，最多500字，showCount 显示计数）
            不用 autoSize（autoSize 会锁死高度导致拖拽失效），用固定 minRows + resize:vertical 让用户自由拉大缩小 */}
        <Col xs={24}>
          <Form.Item
            name="remark"
            label="备注"
            style={{ marginBottom: 8 }}
          >
            <Input.TextArea
              id="remark"
              rows={3}
              maxLength={500}
              showCount
              placeholder="请输入备注（面料/版型/特殊工艺说明等）"
              disabled={isFieldLocked(currentStyle?.remark)}
              style={{ resize: 'vertical' }}
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
    </SectionBox>
  );
};

export default BasicInfoSection;
