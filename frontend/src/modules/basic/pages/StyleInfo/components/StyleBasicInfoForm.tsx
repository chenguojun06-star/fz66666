import React, { useImperativeHandle } from 'react';
import { Form, Input, InputNumber, Row, Col, FormInstance, Select, App } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import CustomerSelect from '@/components/common/CustomerSelect';
import CoverImageUpload from './CoverImageUpload';
import StyleColorSizeTable from './StyleColorSizeTable';
import { StyleInfo } from '@/types/style';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import { type StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';

export interface StyleBasicInfoFormRef {
  applyStyleParseResult: (result: StyleFieldParseResult) => void;
}

interface StyleBasicInfoFormProps {
  _form: FormInstance;
  currentStyle: StyleInfo | null;
  editLocked: boolean;
  isNewPage: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
  pendingImages: File[];
  onPendingImagesChange: (files: File[]) => void;
  coverRefreshToken: number;
  onCoverChange: (url: string | null) => void;
  onSkcClick?: () => void;
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
  sizeOptions: string[];
  setSizeOptions: (values: string[]) => void;
  colorOptions: string[];
  setColorOptions: (values: string[]) => void;
  sizeColorMatrixRows: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  setSizeColorMatrixRows: (rows: Array<{ color: string; quantities: number[]; imageUrl?: string }>) => void;
  onColorImageSync: (color: string, file: File) => Promise<void> | void;
  onColorImageClear: (color: string) => Promise<void> | void;
  commonSizes: string[];
  setCommonSizes: (v: string[]) => void;
  commonColors: string[];
  setCommonColors: (v: string[]) => void;
  onStyleParseResult?: (result: StyleFieldParseResult) => void;
  forwardedRef?: React.Ref<StyleBasicInfoFormRef>;
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
  coverRefreshToken,
  onCoverChange,
  size1, setSize1, size2, setSize2, size3, setSize3, size4, setSize4, size5, setSize5,
  color1, setColor1, color2, setColor2, color3, setColor3, color4, setColor4, color5, setColor5,
  qty1, setQty1, qty2, setQty2, qty3, setQty3, qty4, setQty4, qty5, setQty5,
  sizeOptions, setSizeOptions, colorOptions, setColorOptions,
  sizeColorMatrixRows, setSizeColorMatrixRows,
  commonSizes, setCommonSizes, commonColors, setCommonColors,
  onColorImageSync,
  onColorImageClear,
  onSkcClick,
  onStyleParseResult,
  forwardedRef,
}) => {
  const { message } = App.useApp();
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const { options: seasonOptions } = useDictOptions('season', SEASON_CODE_OPTIONS);

  const sectionTitleBaseStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-base)',
    fontWeight: 600,
    color: '#374151',
    marginBottom: 12,
    marginLeft: 42,
    paddingLeft: 8,
    lineHeight: '20px',
  };

  // 智能识别结果填充：款名/品类/季节/颜色/尺码，面料袖型领型版型图案放备注
  const applyStyleParseResult = (result: StyleFieldParseResult) => {
    if (!result || result.available === false) return;

    const updates: Record<string, any> = {};

    // 款名：仅在当前为空时填充
    if (result.styleName && !_form.getFieldValue('styleName')) {
      updates.styleName = result.styleName;
    }

    // 品类：匹配字典项后填充
    if (result.category && !_form.getFieldValue('category')) {
      const cat = categoryOptions.find((o: any) =>
        o.value === result.category || String(o.label || '').includes(result.category!)
      );
      if (cat) updates.category = cat.value;
    }

    // 季节：匹配字典项后填充
    if (result.season && !_form.getFieldValue('season')) {
      const sea = seasonOptions.find((o: any) =>
        o.value === result.season || String(o.label || '').includes(result.season!)
      );
      if (sea) updates.season = sea.value;
    }

    if (Object.keys(updates).length > 0) {
      _form.setFieldsValue(updates);
    }

    // 颜色列表自动填充（仅当当前颜色表为空时）
    if (result.colors && result.colors.length > 0 && !color1 && !color2 && !color3 && !color4 && !color5) {
      const colorSetterFns = [setColor1, setColor2, setColor3, setColor4, setColor5];
      result.colors.slice(0, 5).forEach((colorName: string, idx: number) => {
        colorSetterFns[idx]?.(colorName);
      });
      const newColorOptions = result.colors.slice(0, 5).filter((c: string) =>
        !commonColors.includes(c)
      );
      if (newColorOptions.length > 0) {
        setCommonColors([...commonColors, ...newColorOptions]);
      }
    }

    // 尺码推荐：根据品类推荐常用尺码（当尺码未配置时）
    const defaultSizeMap: Record<string, string[]> = {
      'T恤': ['S', 'M', 'L', 'XL', 'XXL'],
      '衬衫': ['S', 'M', 'L', 'XL', 'XXL'],
      '裤子': ['28', '30', '32', '34', '36'],
      '连衣裙': ['S', 'M', 'L', 'XL'],
      '外套': ['M', 'L', 'XL', 'XXL'],
      '大衣': ['S', 'M', 'L', 'XL', 'XXL'],
      '卫衣': ['S', 'M', 'L', 'XL', 'XXL'],
      '毛衣': ['S', 'M', 'L', 'XL', 'XXL'],
      '夹克': ['M', 'L', 'XL', 'XXL'],
      '西装': ['S', 'M', 'L', 'XL'],
    };

    if (!size1 && !size2 && !size3 && !size4 && !size5 && result.category) {
      const recommended = defaultSizeMap[result.category] || ['S', 'M', 'L', 'XL'];
      const sizeSetterFns = [setSize1, setSize2, setSize3, setSize4, setSize5];
      recommended.slice(0, 5).forEach((sizeVal: string, idx: number) => {
        sizeSetterFns[idx]?.(sizeVal);
      });
      const newSizeOptions = recommended.filter((s: string) => !commonSizes.includes(s));
      if (newSizeOptions.length > 0) {
        setCommonSizes([...commonSizes, ...newSizeOptions]);
      }
    }

    // 备注字段：综合面料/袖型/领型/版型/图案 + 置信度
    if (!_form.getFieldValue('remark')) {
      const remarkParts: string[] = [];
      if (result.pattern) remarkParts.push(`图案:${result.pattern}`);
      if (result.fabric) remarkParts.push(`面料:${result.fabric}`);
      if (result.sleeveType) remarkParts.push(`袖型:${result.sleeveType}`);
      if (result.neckline) remarkParts.push(`领型:${result.neckline}`);
      if (result.version) remarkParts.push(`版型:${result.version}`);
      if (typeof result.overallConfidence === 'number') {
        remarkParts.push(`置信度:${result.overallConfidence}%`);
      }
      if (remarkParts.length > 0) {
        _form.setFieldsValue({ remark: remarkParts.join(' | ') });
      }
    }
  };

  useImperativeHandle(forwardedRef, () => ({
    applyStyleParseResult,
  }));

  // 智能识别结果填充：内部回调，也会向上透传给父组件
  const handleStyleParseResult = (result: StyleFieldParseResult) => {
    applyStyleParseResult(result);
    onStyleParseResult?.(result);
  };


  // 统一区块标题样式：简洁左边条 + 可配置色块（仅款号信息用主色，其余采用统一的轻灰边）
  const renderSectionTitle = (title: string, usePrimaryHighlight: boolean = false) => (
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: '#1f2937',
        marginBottom: 12,
        paddingLeft: 12,
        lineHeight: 1.4,
        position: 'relative',
        borderLeft: `3px solid ${usePrimaryHighlight ? 'var(--color-primary)' : '#cbd5e1'}`,
      }}
    >
      {title}
    </div>
  );

  return (
    <Row gutter={16} className="square-inputs" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 24, alignItems: 'flex-start' }}>
      {/* 左侧：封面图上传 + 快速提示 */}
      <div style={{ minWidth: 0 }}>
        <CoverImageUpload
          styleId={currentStyle?.id}
          styleNo={currentStyle?.styleNo || _form.getFieldValue('styleNo')}
          enabled={isNewPage || (Boolean(currentStyle?.id) && !editLocked)}
          isNewMode={isNewPage}
          pendingFiles={pendingImages}
          onPendingFilesChange={onPendingImagesChange}
          coverUrl={currentStyle?.cover}
          refreshTrigger={coverRefreshToken}
          onCoverChange={onCoverChange}
          onStyleParseResult={handleStyleParseResult}
        />
      </div>

      {/* 右侧：表单字段（按业务流程自上而下分区） */}
      <div style={{ minWidth: 0 }}>
        {/* 区1：基础信息（款号 / SKC / 款名 / 品类 / 季节 / 销售渠道） */}
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          {renderSectionTitle('基础信息 · 款号 / SKC / 款名', true)}
          <Row gutter={[16, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]} style={{ marginBottom: 8 }}>
                <Input id="styleNo" placeholder="请输入款号" disabled={editLocked || Boolean(currentStyle?.id)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="skc" label="SKC" style={{ marginBottom: 8 }}>
                {currentStyle?.skc && !isNewPage ? (
                  <span
                    onClick={onSkcClick}
                    style={{ color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500, fontSize: 14, lineHeight: '32px' }}
                  >
                    {currentStyle.skc}
                  </span>
                ) : (
                  <Input id="skc" placeholder="不填将自动生成" disabled={editLocked || Boolean(currentStyle?.id)} />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]} style={{ marginBottom: 8 }}>
                <DictAutoComplete dictType="style_name" placeholder="请输入或选择" disabled={editLocked} style={{ width: '100%' }} id="styleName" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="category" label="品类" style={{ marginBottom: 8 }}>
                <Select
                  id="category"
                  placeholder="选择"
                  disabled={isFieldLocked(currentStyle?.category)}
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={categoryOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="season" label="季节" style={{ marginBottom: 8 }}>
                <Select
                  id="season"
                  placeholder="选择"
                  disabled={isFieldLocked(currentStyle?.season)}
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={seasonOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="salesChannel" label="销售渠道" style={{ marginBottom: 8 }}>
                <Select
                  id="salesChannel"
                  placeholder="选择销售渠道"
                  disabled={editLocked}
                  allowClear
                  style={{ width: '100%' }}
                  options={[
                    { label: '天猫', value: '天猫' },
                    { label: '抖音', value: '抖音' },
                    { label: '京东', value: '京东' },
                    { label: '拼多多', value: '拼多多' },
                    { label: '线下门店', value: '线下门店' },
                    { label: '私域', value: '私域' },
                    { label: '定制', value: '定制' },
                    { label: '其他', value: '其他' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 区2：客户跟进信息（客户 / 跟单员 / 设计师 / 打板价 / 吊牌价 / 销售价） */}
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          {renderSectionTitle('客户跟进信息')}
          <Row gutter={[16, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="customerId" noStyle hidden>
                <Input id="customerId" />
              </Form.Item>
              <Form.Item name="customer" label="客户" style={{ marginBottom: 8 }}>
                <CustomerSelect
                  id="customer"
                  placeholder="搜索或输入客户名称"
                  disabled={isFieldLocked(currentStyle?.customer)}
                  onChange={(_value, option) => {
                    if (option?.customerId) {
                      _form.setFieldsValue({ customerId: option.customerId });
                    } else {
                      _form.setFieldsValue({ customerId: undefined });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="orderType" label="跟单员" style={{ marginBottom: 8 }}>
                <Input id="orderType" placeholder="请输入跟单员" disabled={isFieldLocked(currentStyle?.orderType)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sampleNo" label="设计师" style={{ marginBottom: 8 }}>
                <Input id="sampleNo" placeholder="请输入设计师" disabled={editLocked} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="price" label="打板价" style={{ marginBottom: 8 }}>
                <InputNumber id="price" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="tagPrice" label="吊牌价" style={{ marginBottom: 8 }}>
                <InputNumber id="tagPrice" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled={editLocked} placeholder="选填" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="salesPrice" label="销售价" style={{ marginBottom: 8 }}>
                <InputNumber id="salesPrice" style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled={editLocked} placeholder="选填" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 区3：版次信息（板类 / 纸样师 / 车板师） */}
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          {renderSectionTitle('版次与版型信息')}
          <Row gutter={[16, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="plateType" label="板类" style={{ marginBottom: 8 }}>
                <DictAutoComplete dictType="plate_type" placeholder="请选择板类" disabled={isFieldLocked(currentStyle?.plateType)} style={{ width: '100%' }} id="plateType" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sampleSupplier" label="纸样师" style={{ marginBottom: 8 }}>
                <Input id="sampleSupplier" placeholder="请输入纸样师" disabled={isFieldLocked(currentStyle?.sampleSupplier)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="plateWorker" label="车板师" style={{ marginBottom: 8 }}>
                <Input id="plateWorker" placeholder="请输入车板师" disabled={isFieldLocked(currentStyle?.plateWorker)} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 区4：时间与备注 */}
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          {renderSectionTitle('时间与备注')}
          <Row gutter={[16, 8]}>
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
            <Col xs={24}>
              <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
                <Input.TextArea id="remark" rows={2} placeholder="请输入备注（面料/版型/特殊工艺说明等）" disabled={isFieldLocked(currentStyle?.remark)} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 区5：颜色码数配置（与上方分区保持一致的卡片视觉） */}
        <div
          style={{
            marginBottom: 4,
            padding: 16,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          {renderSectionTitle('颜色 / 尺码 / 数量配置')}
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
            sizeOptions={sizeOptions}
            setSizeOptions={setSizeOptions}
            colorOptions={colorOptions}
            setColorOptions={setColorOptions}
            matrixRows={sizeColorMatrixRows}
            setMatrixRows={setSizeColorMatrixRows}
            onImageSync={onColorImageSync}
            onImageClear={onColorImageClear}
            commonSizes={commonSizes}
            setCommonSizes={setCommonSizes}
            commonColors={commonColors}
            setCommonColors={setCommonColors}
            editLocked={editLocked}
            isFieldLocked={isFieldLocked}
          />
        </div>
      </div>
    </Row>
  );
};

export default StyleBasicInfoForm;
