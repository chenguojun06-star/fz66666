import React from 'react';
import { Form, Input, Select, InputNumber, Row, Col, Radio } from 'antd';
import type { FormInstance } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
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

/** D-438：基础信息字段组（款号/款名/品类/季节/颜色/尺码/U编码/单价/客户/生产周期） */
export const ProductBaseFields: React.FC = () => (
  <>
    <Row gutter={[12, 8]}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
          <Input placeholder="请输入款号" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
          <Input placeholder="请输入款名" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="category" label="品类">
          <Select placeholder="请选择品类" allowClear showSearch optionFilterProp="label">
            {CATEGORY_CODE_OPTIONS.map(opt => (
              <Select.Option key={opt.value} value={opt.value} label={opt.label}>{opt.label}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={[12, 8]}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="season" label="季节">
          <Select placeholder="请选择季节" allowClear>
            {SEASON_CODE_OPTIONS.map(opt => (
              <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="color" label="颜色">
          <Input placeholder="请输入颜色" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="size" label="尺码">
          <Input placeholder="请输入尺码" />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={[12, 8]}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="uCode" label="U编码">
          <Input placeholder="请输入U编码" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="price" label="单价(元)">
          <InputNumber placeholder="请输入单价" style={{ width: '100%' }} min={0} step={0.01} precision={2} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="customer" label="客户">
          <Input placeholder="请输入客户" />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={[12, 8]}>
      <Col xs={24} sm={12} md={8}>
        <Form.Item name="cycle" label="生产周期(天)">
          <InputNumber placeholder="天数" style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Col>
    </Row>
  </>
);

/** D-439：类目属性字段组（成分/质量等级/执行标准/安全类别/检验员/洗涤说明/描述） */
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
 * D-438：商品资料表单字段全集（弹窗/新增入口用平铺布局）。
 * 分区布局（基础信息/图片附件/类目属性/颜色规格/其它设置）见 DetailDrawer 编辑态，
 * 两者共用 ProductBaseFields/ProductAttrFields/ProductStatusFields，禁止漂移。
 */
const ProductInfoForm: React.FC<ProductInfoFormProps> = ({ form, coverUrl, setCoverUrl, editingItem, isMobile }) => {
  return (
    <div className="u-p-04px">
      <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
        <ProductCoverUpload coverUrl={coverUrl} setCoverUrl={setCoverUrl} editingItem={editingItem} />
        <ProductBaseFields />
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item name="fabricComposition" label="面料成分">
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
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态">
                <Select.Option value="ENABLED">启用</Select.Option>
                <Select.Option value="DISABLED">停用</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default ProductInfoForm;
