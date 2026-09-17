import React from 'react';
import { Form, Input, Select, InputNumber, Row, Col, Radio } from 'antd';
import type { FormInstance } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import api from '@/utils/api';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { StyleInfo } from '@/types/style';

interface ProductInfoFormProps {
  form: FormInstance;
  coverUrl: string | null;
  setCoverUrl: (v: string | null) => void;
  editingItem: StyleInfo | null;
  isMobile: boolean;
}

const PRODUCT_NATURE_OPTIONS = [
  { value: 'finished', label: '成品' },
  { value: 'semi_finished', label: '半成品' },
  { value: 'raw_material', label: '原材料' },
  { value: 'packaging', label: '包材' },
];

/** 封面图上传（基础信息弹窗置顶；分区编辑态放在「图片附件」区） */
export const ProductCoverUpload: React.FC<{
  coverUrl: string | null;
  setCoverUrl: (v: string | null) => void;
  editingItem: StyleInfo | null;
}> = ({ coverUrl, setCoverUrl, editingItem }) => (
  <div className="u-mb-16 u-d-flex u-ai-start u-gap-16">
    <ImageUploadBox
      value={coverUrl}
      onChange={setCoverUrl}
      width={100}
      height={100}
      label="封面图"
      uploadFn={async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        if (editingItem?.id) formData.append('styleId', String(editingItem.id));
        const res = await api.post('/style/attachment/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if ((res as any).code === 200 && (res as any).data?.fileUrl) {
          return (res as any).data.fileUrl;
        }
        throw new Error((res as any).message || '上传失败');
      }}
    />
    <div className="u-flex-1 u-fs-14" style={{ color: 'var(--color-text-tertiary)', paddingTop: 4 }}>
      <div>点击上传成品图片</div>
      <div className="u-mt-4">支持 JPG/PNG，最大 5MB</div>
    </div>
  </div>
);

/**
 * D-440：基础信息字段组（对齐参考竞品字段集）。
 * 款式编码/商品名称/商品品牌(theme,与样衣开发同字段同字典)/商品分类/虚拟分类/季节/
 * 供应商/供应商款号/U编码/基本售价/市场吊牌价/成本价/客户/生产周期/备注
 * （重量/单位/商品属性/长宽高/是否里布/打扮尺码/标签/数量 → ProductNatureFields）
 */
export const ProductBaseFields: React.FC = () => {
  return (
    <>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="styleNo" label="款式编码" rules={[{ required: true, message: '请输入款式编码' }]}>
            <Input placeholder="请输入款式编码" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="styleName" label="商品名称" rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input placeholder="请输入商品名称" maxLength={100} showCount />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="theme" label="商品品牌">
            <DictAutoComplete
              dictType="style_theme"
              quickManageTitle="商品品牌"
              placeholder="请输入或选择商品品牌"
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="category" label="商品分类">
            <Select placeholder="请选择商品分类" allowClear showSearch optionFilterProp="label">
              {CATEGORY_CODE_OPTIONS.map(opt => (
                <Select.Option key={opt.value} value={opt.value} label={opt.label}>{opt.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="virtualCategory" label="虚拟分类">
            <Input placeholder="请输入虚拟分类" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="season" label="季节">
            <Select placeholder="请选择季节" allowClear>
              {SEASON_CODE_OPTIONS.map(opt => (
                <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="supplier" label="供应商名称">
            <Input placeholder="请输入供应商名称" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="supplierStyleNo" label="供应商款号">
            <Input placeholder="请输入供应商款号" maxLength={64} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="uCode" label="U编码">
            <Input placeholder="请输入U编码" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="price" label="基本售价" rules={[{ required: true, message: '请输入基本售价' }]}>
            <InputNumber placeholder="请输入基本售价" style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="tagPrice" label="市场|吊牌价">
            <InputNumber placeholder="请输入市场吊牌价" style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="costPrice" label="成本价">
            <InputNumber placeholder="请输入成本价" style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="customer" label="客户">
            <Input placeholder="请输入客户" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="cycle" label="生产周期(天)">
            <InputNumber placeholder="天数" style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={24}>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="请输入备注" rows={2} maxLength={500} showCount />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
};

/**
 * D-440：商品属性与规格字段组（重量/单位/商品属性/长宽高(含体积联动)/是否里布/打扮尺码/标签/数量）。
 * 商品资料抽屉「类目属性」区尾部 与 样衣开发表单「商品属性」分区共用。
 */
export const ProductNatureFields: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const lengthCm = Form.useWatch('lengthCm');
  const widthCm = Form.useWatch('widthCm');
  const heightCm = Form.useWatch('heightCm');
  const volume = [lengthCm, widthCm, heightCm].every((v) => v != null && v !== ('' as unknown))
    ? (Number(lengthCm) * Number(widthCm) * Number(heightCm)).toFixed(1)
    : null;

  return (
    <>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="weightKg" label="重量(kg)">
            <InputNumber placeholder="请输入重量" style={{ width: '100%' }} min={0} step={0.01} precision={2} disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="unit" label="单位">
            <Input placeholder="如：件" maxLength={16} disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="productNature" label="商品属性">
            <Radio.Group disabled={disabled}>
              {PRODUCT_NATURE_OPTIONS.map(opt => (
                <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
              ))}
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={8} sm={6} md={4}>
          <Form.Item name="lengthCm" label="长(cm)">
            <InputNumber style={{ width: '100%' }} min={0} precision={1} placeholder="长" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Form.Item name="widthCm" label="宽(cm)">
            <InputNumber style={{ width: '100%' }} min={0} precision={1} placeholder="宽" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Form.Item name="heightCm" label="高(cm)">
            <InputNumber style={{ width: '100%' }} min={0} precision={1} placeholder="高" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={6} md={4}>
          <Form.Item label="体积">
            <Input value={volume ? `${volume} cm³` : ''} placeholder="自动计算" disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={6} md={8}>
          <Form.Item name="hasLining" label="是否里布">
            <Select placeholder="请选择" allowClear disabled={disabled}>
              <Select.Option value={true}>是</Select.Option>
              <Select.Option value={false}>否</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="printSize" label="打扮尺码">
            <Input placeholder="请输入打扮尺码" maxLength={128} disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="styleTags" label="标签">
            <Input placeholder="请输入标签" maxLength={255} disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item name="attrQuantity" label="数量">
            <Input placeholder="请输入数量" maxLength={64} disabled={disabled} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
};

/** D-439/D-440：类目属性字段组（成分/是否里布/打扮尺码/标签/数量 + 质检字段 + 描述） */
export const ProductAttrFields: React.FC = () => (
  <>
    <Row gutter={[12, 8]}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="fabricComposition" label="成分">
          <Input placeholder="如：100%棉" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="qualityGrade" label="质量等级">
          <Input placeholder="如：合格品" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="executeStandard" label="执行标准">
          <Input placeholder="如：GB/T 2660-2017" />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={[12, 8]}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="safetyCategory" label="安全类别">
          <Input placeholder="如：GB 18401 B类" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="inspector" label="检验员">
          <Input placeholder="请输入检验员" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="washInstructions" label="洗涤说明">
          <Input.TextArea placeholder="请输入洗涤说明" rows={2} />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={[12, 8]}>
      <Col xs={24}>
        <Form.Item name="description" label="描述">
          <Input.TextArea placeholder="请输入描述" rows={2} />
        </Form.Item>
      </Col>
    </Row>
  </>
);

/** D-439：其它设置字段组（商品状态） */
export const ProductStatusFields: React.FC = () => (
  <Form.Item name="status" label="商品状态">
    <Radio.Group>
      <Radio value="ENABLED">启用</Radio>
      <Radio value="DISABLED">停用</Radio>
    </Radio.Group>
  </Form.Item>
);

/**
 * D-438：商品资料表单字段全集（列表行编辑/新增弹窗用）。
 * D-440 起平铺布局直接组合共享字段组，与详情抽屉分区编辑共用同一份定义（不再各写一份）。
 */
const ProductInfoForm: React.FC<ProductInfoFormProps> = ({ form, coverUrl, setCoverUrl, editingItem, isMobile }) => {
  return (
    <div className="u-p-04px">
      <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
        <ProductCoverUpload coverUrl={coverUrl} setCoverUrl={setCoverUrl} editingItem={editingItem} />
        <ProductBaseFields />
        <ProductNatureFields />
        <ProductAttrFields />
        <ProductStatusFields />
      </Form>
    </div>
  );
};

export default ProductInfoForm;
