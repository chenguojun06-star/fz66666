import React from 'react';
import { Col, Form, Input, Radio, Row, Select, Tooltip } from 'antd';
import CustomerSelect from '@/components/common/CustomerSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';
import { PRODUCT_TYPE_OPTIONS } from './constants';

interface BasicInfoSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
  /** 图片资产左栏（主图+缩略图+操作），合并进基础信息区展示 */
  coverSlot?: React.ReactNode;
}

/**
 * 字段维护按钮：截图中的"维护"占位按钮，鼠标 hover 显示"前往字典管理"提示。
 * 当前为视觉占位，不绑定点击事件（避免与字典管理页跳转逻辑耦合）。
 */
const FieldMaintainHint: React.FC = () => (
  <Tooltip title="前往系统管理-字典管理维护选项">
    <span style={{ marginLeft: 6, color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
      维护
    </span>
  </Tooltip>
);

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
            label="款名称"
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
                <FieldMaintainHint />
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
                <FieldMaintainHint />
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

        {/* 商品类型（成品/半成品 单选） */}
        <Col xs={24} md={12}>
          <Form.Item
            name="productType"
            label="商品类型"
            style={{ marginBottom: 8 }}
          >
            <Radio.Group
              id="productType"
              options={PRODUCT_TYPE_OPTIONS}
              optionType="button"
              buttonStyle="solid"
              disabled={editLocked}
            />
          </Form.Item>
        </Col>

        {/* 设计师 */}
        <Col xs={24} md={12}>
          <Form.Item
            name="designer"
            label="设计师"
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
                <FieldMaintainHint />
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
            label="客户"
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
