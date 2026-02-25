import React from 'react';
import { Form, Input, InputNumber, Select, Row, Col, FormInstance } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import CoverImageUpload from './CoverImageUpload';
import StyleColorSizeTable from './StyleColorSizeTable';
import { StyleInfo } from '@/types/style';

interface StyleBasicInfoFormProps {
  _form: FormInstance; // 未使用，外部Form已包含
  currentStyle: StyleInfo | null;
  editLocked: boolean;
  isNewPage: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
  pendingImages: File[];
  onPendingImagesChange: (files: File[]) => void;
  // 颜色码数配置props
  size1: string;
  setSize1: (v: string) => void;
  size2: string;
  setSize2: (v: string) => void;
  size3: string;
  setSize3: (v: string) => void;
  size4: string;
  setSize4: (v: string) => void;
  size5: string;
  setSize5: (v: string) => void;
  color1: string;
  setColor1: (v: string) => void;
  color2: string;
  setColor2: (v: string) => void;
  color3: string;
  setColor3: (v: string) => void;
  color4: string;
  setColor4: (v: string) => void;
  color5: string;
  setColor5: (v: string) => void;
  qty1: number;
  setQty1: (v: number) => void;
  qty2: number;
  setQty2: (v: number) => void;
  qty3: number;
  setQty3: (v: number) => void;
  qty4: number;
  setQty4: (v: number) => void;
  qty5: number;
  setQty5: (v: number) => void;
  commonSizes: string[];
  setCommonSizes: (v: string[]) => void;
  commonColors: string[];
  setCommonColors: (v: string[]) => void;
}

/**
 * 款式基础信息表单组件
 * 包含：款号信息、客户信息、版次信息、时间信息、颜色码数配置
 */
const StyleBasicInfoForm: React.FC<StyleBasicInfoFormProps> = ({
  _form,
  currentStyle,
  editLocked,
  isNewPage,
  isFieldLocked,
  pendingImages,
  onPendingImagesChange,
  size1, setSize1, size2, setSize2, size3, setSize3, size4, setSize4, size5, setSize5,
  color1, setColor1, color2, setColor2, color3, setColor3, color4, setColor4, color5, setColor5,
  qty1, setQty1, qty2, setQty2, qty3, setQty3, qty4, setQty4, qty5, setQty5,
  commonSizes, setCommonSizes, commonColors, setCommonColors
}) => {
  const sectionTitleBaseStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-base)',
    fontWeight: 600,
    color: '#374151',
    marginBottom: 12,
    marginLeft: 72,
    paddingLeft: 8,
    lineHeight: '20px',
  };

  return (
    <Row gutter={16} className="square-inputs">
        {/* 左侧：封面图上传 */}
        <Col xs={24} lg={6}>
          <CoverImageUpload
            styleId={currentStyle?.id}
            enabled={Boolean(currentStyle?.id) && !editLocked}
            isNewMode={isNewPage}
            pendingFiles={pendingImages}
            onPendingFilesChange={onPendingImagesChange}
          />
        </Col>

        {/* 右侧：表单字段（图片与页面边缘之间） */}
        <Col xs={24} lg={18}>
          {/* 款号信息区域 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...sectionTitleBaseStyle, borderLeft: '3px solid #2D7FF9' }}>
              款号信息
            </div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={6}>
                <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
                  <Input placeholder="请输入款号" disabled={editLocked || Boolean(currentStyle?.id)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
                  <DictAutoComplete dictType="style_name" placeholder="请输入或选择款名（如：连衣裙、T恤）" disabled={editLocked} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="category" label="品类" rules={[{ required: true, message: '请选择品类' }]}>
                  <DictAutoComplete dictType="category" placeholder="请选择或输入品类" disabled={isFieldLocked(currentStyle?.category)} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="season" label="季节">
                  <DictAutoComplete dictType="season" placeholder="请选择季节" disabled={isFieldLocked(currentStyle?.season)} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 客户信息区域 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...sectionTitleBaseStyle, borderLeft: '3px solid #52C41A' }}>
              客户信息
            </div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={6}>
                <Form.Item name="customer" label="客户">
                  <Input placeholder="请选择客户" disabled={isFieldLocked((currentStyle as any)?.customer)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="orderType" label="跟单员">
                  <Input placeholder="请输入跟单员" disabled={isFieldLocked((currentStyle as any)?.orderType)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="sampleNo" label="设计师">
                  <Input placeholder="请输入设计师" disabled={editLocked} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="price" label="打板价">
                  <InputNumber style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 版次信息区域 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...sectionTitleBaseStyle, borderLeft: '3px solid #FAAD14' }}>
              版次信息
            </div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={6}>
                <Form.Item name="plateType" label="板类">
                  <DictAutoComplete dictType="plate_type" placeholder="请选择板类" disabled={isFieldLocked((currentStyle as any)?.plateType)} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="sampleSupplier" label="纸样师">
                  <Input placeholder="请输入纸样师" disabled={isFieldLocked((currentStyle as any)?.sampleSupplier)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="patternNo" label="纸样号">
                  <Input placeholder="请输入纸样号" disabled={isFieldLocked((currentStyle as any)?.patternNo)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="plateWorker" label="车板师">
                  <Input placeholder="请输入车板师" disabled={isFieldLocked((currentStyle as any)?.plateWorker)} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 时间信息区域 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...sectionTitleBaseStyle, borderLeft: '3px solid #8B5CF6' }}>
              时间信息
            </div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={6}>
                <Form.Item name="createTime" label="下板时间">
                  <UnifiedDatePicker
                    disabled={editLocked}
                    allowClear
                    showTime
                    placeholder="请选择下板时间"
                    format="YYYY-MM-DD HH:mm"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="deliveryDate" label="交板日期">
                  <UnifiedDatePicker
                    disabled={isFieldLocked((currentStyle as any)?.deliveryDate)}
                    allowClear
                    showTime
                    placeholder="请选择交板日期"
                    format="YYYY-MM-DD HH:mm"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="cycle" label="样衣周期[天]">
                  <InputNumber style={{ width: '100%' }} min={0} disabled={isFieldLocked(currentStyle?.cycle)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={1} placeholder="请输入备注" disabled={isFieldLocked((currentStyle as any)?.remark)} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 颜色码数配置 */}
          <StyleColorSizeTable
            size1={size1}
            setSize1={setSize1}
            size2={size2}
            setSize2={setSize2}
            size3={size3}
            setSize3={setSize3}
            size4={size4}
            setSize4={setSize4}
            size5={size5}
            setSize5={setSize5}
            color1={color1}
            setColor1={setColor1}
            color2={color2}
            setColor2={setColor2}
            color3={color3}
            setColor3={setColor3}
            color4={color4}
            setColor4={setColor4}
            color5={color5}
            setColor5={setColor5}
            qty1={qty1}
            setQty1={setQty1}
            qty2={qty2}
            setQty2={setQty2}
            qty3={qty3}
            setQty3={setQty3}
            qty4={qty4}
            setQty4={setQty4}
            qty5={qty5}
            setQty5={setQty5}
            commonSizes={commonSizes}
            setCommonSizes={setCommonSizes}
            commonColors={commonColors}
            setCommonColors={setCommonColors}
            editLocked={editLocked}
            isFieldLocked={isFieldLocked}
          />
        </Col>
      </Row>
  );
};

export default StyleBasicInfoForm;
