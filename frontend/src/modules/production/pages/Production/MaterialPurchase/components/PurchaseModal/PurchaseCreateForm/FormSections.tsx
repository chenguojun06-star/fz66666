import React from 'react';
import { Form, Input, InputNumber, Row, Col, Select } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import SupplierSelect from '@/components/common/SupplierSelect';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import StockInfoDisplay from './StockInfoDisplay';
import type { StockInfo } from './useStockCheck';
import { formatReferenceKilograms } from '../../../utils';

const { Option } = Select;

interface StyleInfoSectionProps {
  form: any;
  styleCover: string | undefined;
}

export const StyleInfoSection: React.FC<StyleInfoSectionProps> = ({ form, styleCover }) => (
  <Row gutter={[16, 0]}>
    <Col xs={24} md={6}>
      <Form.Item label="图片">
        <ImageUploadBox
          value={styleCover}
          onChange={(url) => form.setFieldsValue({ styleCover: url })}
          size={104}
          enableDrop
          accept="image/jpeg,image/jpg,image/png"
          maxSizeMB={5}
          label="款式图片"
        />
        <Form.Item name="styleCover" hidden>
          <Input />
        </Form.Item>
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="orderNo" label="订单号">
        <Input disabled />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="purchaseNo" label="采购单号">
        <Input disabled placeholder="自动生成" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="styleNo" label="款号">
        <Input disabled />
      </Form.Item>
    </Col>
  </Row>
);

interface MaterialInfoSectionProps {
  form: any;
  materialDbOptions: Array<{ label: string; value: string; record?: any }>;
  materialDbLoading: boolean;
  onSearchMaterialDb: (keyword: string) => void;
  onMaterialDbSelect: (value: string, option: any) => void;
}

export const MaterialInfoSection: React.FC<MaterialInfoSectionProps> = ({
  form: _form,
  materialDbOptions,
  materialDbLoading,
  onSearchMaterialDb,
  onMaterialDbSelect,
}) => (
  <Row gutter={[16, 0]}>
    <Col xs={24} md={6}>
      <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '必填' }]}>
        <Select id="materialType">
          <Option value="fabricA">面料A</Option>
          <Option value="fabricB">面料B</Option>
          <Option value="fabricC">面料C</Option>
          <Option value="fabricD">面料D</Option>
          <Option value="fabricE">面料E</Option>
          <Option value="liningA">里料A</Option>
          <Option value="liningB">里料B</Option>
          <Option value="liningC">里料C</Option>
          <Option value="liningD">里料D</Option>
          <Option value="liningE">里料E</Option>
          <Option value="accessoryA">辅料A</Option>
          <Option value="accessoryB">辅料B</Option>
          <Option value="accessoryC">辅料C</Option>
          <Option value="accessoryD">辅料D</Option>
          <Option value="accessoryE">辅料E</Option>
        </Select>
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '必填' }]}>
        <Select
          id="materialCode"
          showSearch
          filterOption={false}
          loading={materialDbLoading}
          options={materialDbOptions}
          onSearch={onSearchMaterialDb}
          onSelect={onMaterialDbSelect}
          placeholder="输入编码/名称搜索"
          allowClear
          notFoundContent={materialDbLoading ? '搜索中...' : '暂无结果'}
        />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
        <Input id="materialName" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
        <Input id="unit" />
      </Form.Item>
    </Col>
  </Row>
);

interface MaterialDetailSectionProps {
  form: any;
  colorOptions: Array<{ label: string; value: string }> | null;
  materialCode: string | undefined;
  stockInfo: StockInfo | null;
  unit: string | undefined;
}

export const MaterialDetailSection: React.FC<MaterialDetailSectionProps> = ({
  form: _form,
  colorOptions,
  materialCode,
  stockInfo,
  unit,
}) => (
  <Row gutter={[16, 0]}>
    <Col xs={24} md={6}>
      <Form.Item
        name="color"
        label="颜色"
        rules={colorOptions && colorOptions.length > 1 ? [{ required: true, message: '多颜色订单必须选择颜色' }] : undefined}
      >
        {colorOptions && colorOptions.length > 1 ? (
          <Select id="color" placeholder="选择颜色" options={colorOptions} allowClear />
        ) : (
          <Input id="color" placeholder="输入颜色" />
        )}
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="size" label="尺码">
        <Input id="size" placeholder="输入尺码" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="specifications" label="规格">
        <Input id="specifications" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="fabricComposition" label="成分">
        <Input id="fabricComposition" placeholder="如：棉100%" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="fabricWidth" label="幅宽">
        <Input id="fabricWidth" placeholder="如：150cm" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="fabricWeight" label="克重">
        <Input id="fabricWeight" placeholder="如：280g/m²" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <StockInfoDisplay materialCode={materialCode} stockInfo={stockInfo} unit={unit} />
    </Col>
  </Row>
);

interface SupplierSectionProps {
  form: any;
}

export const SupplierSection: React.FC<SupplierSectionProps> = ({ form }) => (
  <Row gutter={[16, 0]}>
    <Col xs={24} md={6}>
      <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
        <SupplierSelect
          id="supplierName"
          onChange={(value, option) => {
            form.setFieldsValue({
              supplierName: value,
              supplierId: option?.supplierId,
              supplierContactPerson: option?.supplierContactPerson,
              supplierContactPhone: option?.supplierContactPhone,
            });
          }}
        />
      </Form.Item>
      <Form.Item name="supplierId" hidden>
        <Input id="supplierId" />
      </Form.Item>
      <Form.Item name="supplierContactPerson" hidden>
        <Input id="supplierContactPerson" />
      </Form.Item>
      <Form.Item name="supplierContactPhone" hidden>
        <Input id="supplierContactPhone" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '必填' }]}>
        <InputNumber id="unitPrice" style={{ width: '100%' }} min={0} step={0.01} />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="totalAmount" label="金额(元)">
        <InputNumber id="totalAmount" disabled style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="status" label="状态" rules={[{ required: true, message: '必填' }]}>
        <Select id="status">
          <Option value="pending">待采购</Option>
          <Option value="partial">部分到货</Option>
          <Option value="completed">全部到货</Option>
          <Option value="cancelled">已取消</Option>
        </Select>
      </Form.Item>
    </Col>
  </Row>
);

interface QuantitySectionProps {
  form: any;
  purchaseQuantity: number | undefined;
  conversionRate: number | undefined;
  unit: string | undefined;
}

export const QuantitySection: React.FC<QuantitySectionProps> = ({ form: _form, purchaseQuantity, conversionRate, unit }) => (
  <Row gutter={[16, 0]}>
    <Col xs={24} md={6}>
      <Form.Item name="purchaseQuantity" label="采购数量" rules={[{ required: true, message: '必填' }]}>
        <InputNumber id="purchaseQuantity" style={{ width: '100%' }} min={0} />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="arrivedQuantity" label="到货数量">
        <InputNumber id="arrivedQuantity" style={{ width: '100%' }} min={0} />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item name="conversionRate" label="换算">
        <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={4} placeholder="如：3" />
      </Form.Item>
    </Col>
    <Col xs={24} md={6}>
      <Form.Item label="参考公斤数">
        <Input
          value={formatReferenceKilograms(purchaseQuantity, conversionRate, unit)}
          readOnly
          placeholder="-"
        />
      </Form.Item>
    </Col>
  </Row>
);

interface DocumentSectionProps {
  form: any;
}

export const DocumentSection: React.FC<DocumentSectionProps> = ({ form }) => (
  <Row gutter={[16, 0]}>
    <Col span={24}>
      <Form.Item name="invoiceUrls" hidden>
        <Input id="invoiceUrls" />
      </Form.Item>
      <Form.Item label="采购单据" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }}>
        <MultiImageUploadBox
          value={(() => {
            const urlsStr = form.getFieldValue('invoiceUrls');
            if (!urlsStr) return [];
            try { return JSON.parse(urlsStr); } catch { return []; }
          })()}
          onChange={(urls) => form.setFieldsValue({ invoiceUrls: JSON.stringify(urls) })}
          maxCount={10}
          size={80}
          accept="image/jpeg,image/jpg,image/png,application/pdf"
          maxSizeMB={10}
          label="单据"
        />
      </Form.Item>
    </Col>
  </Row>
);

interface RemarkSectionProps {}

export const RemarkSection: React.FC<RemarkSectionProps> = () => (
  <Form.Item name="remark" label="备注" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }}>
    <Input.TextArea id="remark" autoSize={{ minRows: 4 }} />
  </Form.Item>
);
