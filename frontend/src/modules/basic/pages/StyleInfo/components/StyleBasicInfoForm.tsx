import React from 'react';
import { Col, Row } from 'antd';
import CoverImageUpload from './CoverImageUpload';
import StyleStatusCard from './StyleStatusCard';
import type { StyleBasicInfoFormProps } from './StyleBasicInfoForm/types';
import { useStyleBasicInfoForm } from './StyleBasicInfoForm/useStyleBasicInfoForm';
import BasicInfoSection from './StyleBasicInfoForm/BasicInfoSection';
import CustomerInfoSection from './StyleBasicInfoForm/CustomerInfoSection';
import StyleFeatureSection from './StyleBasicInfoForm/StyleFeatureSection';
import ColorSizeSkuSection from './StyleBasicInfoForm/ColorSizeSkuSection';
import ExtFieldsSectionBlock from './StyleBasicInfoForm/ExtFieldsSectionBlock';

// 向后兼容：外部从本文件导入 StyleBasicInfoFormRef 类型
export type { StyleBasicInfoFormRef } from './StyleBasicInfoForm/types';

/**
 * 款式基础信息表单组件
 * 包含：款号信息、客户信息、版次信息、时间信息、颜色码数配置
 *
 * 布局说明：
 *  - 左侧 sticky：封面图 + 状态卡片
 *  - 右侧：统一 Tab 系统（基础信息 / BOM清单 / 纸样开发 / ...）
 *  - 基础信息作为第一个 Tab，排在 BOM 清单前面
 *  - 下层 Tab 内容由 renderBelowForm 提供（StyleInfoTabs）
 */
const StyleBasicInfoForm: React.FC<StyleBasicInfoFormProps> = ({
  _form,
  currentStyle,
  editLocked,
  isNewPage,
  isFieldLocked,
  customFields,
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
  onStyleParseResult,
  forwardedRef,
  styleId,
  styleNo,
  skc,
  skuMode,
  useSkuPrefix,
  onRefresh,
  renderBelowForm,
}: StyleBasicInfoFormProps) => {
  const { skuRefreshTrigger, handleStyleParseResult } = useStyleBasicInfoForm({
    _form,
    styleId,
    forwardedRef,
    onStyleParseResult,
    colorOptions,
    sizeOptions,
    sizeColorMatrixRows,
    color1, color2, color3, color4, color5,
    setColor1, setColor2, setColor3, setColor4, setColor5,
    commonColors, setCommonColors,
    size1, size2, size3, size4, size5,
    setSize1, setSize2, setSize3, setSize4, setSize5,
    commonSizes, setCommonSizes,
  });

  const sectionFormContext = {
    _form,
    currentStyle,
    editLocked,
    isFieldLocked,
  };

  // 基础信息 Tab 内容：所有表单分区合并在一个 Tab 里
  const basicInfoTabContent = (
    <>
      {/* 区1：基础信息（款号 / SKC / 款名 / 品类 / 季节 / 销售渠道，含时间信息） */}
      <BasicInfoSection {...sectionFormContext} isNewPage={isNewPage} />

      {/* 区2+区3：客户与定价 | 款式特征 左右并排，压缩纵向高度（窄屏自动堆叠） */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <CustomerInfoSection {...sectionFormContext} />
        </Col>
        <Col xs={24} xl={12}>
          <StyleFeatureSection {...sectionFormContext} isNewPage={isNewPage} />
        </Col>
      </Row>

      {/* 区4：颜色 / 尺码 / 商品编码 配置 */}
      <ColorSizeSkuSection
        size1={size1} setSize1={setSize1}
        size2={size2} setSize2={setSize2}
        size3={size3} setSize3={setSize3}
        size4={size4} setSize4={setSize4}
        size5={size5} setSize5={setSize5}
        color1={color1} setColor1={setColor1}
        color2={color2} setColor2={setColor2}
        color3={color3} setColor3={setColor3}
        color4={color4} setColor4={setColor4}
        color5={color5} setColor5={setColor5}
        qty1={qty1} setQty1={setQty1}
        qty2={qty2} setQty2={setQty2}
        qty3={qty3} setQty3={setQty3}
        qty4={qty4} setQty4={setQty4}
        qty5={qty5} setQty5={setQty5}
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
        styleId={styleId}
        styleNo={styleNo}
        skc={skc}
        skuMode={skuMode}
        useSkuPrefix={useSkuPrefix}
        onRefresh={onRefresh}
        skuRefreshTrigger={skuRefreshTrigger}
      />

      {/* 区5：扩展字段 */}
      <ExtFieldsSectionBlock
        customFields={customFields}
        editLocked={editLocked}
      />
    </>
  );

  return (
    <Row gutter={16} className="square-inputs" style={{ display: 'grid', gridTemplateColumns: 'clamp(220px, 17vw, 280px) minmax(0, 1fr)', gap: 24, alignItems: 'flex-start' }}>
      {/* 左侧：封面图上传 + 款式状态卡片（sticky 跟随滚动，避免下方空白） */}
      <div style={{ minWidth: 0, position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
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
        {/* 仅在已存在款式时显示状态卡片，新建页面不显示 */}
        {!isNewPage && currentStyle?.id ? <StyleStatusCard style={currentStyle} /> : null}
      </div>

      {/* 右侧：统一 Tab 系统（基础信息排在最前，BOM清单等后续 Tab 由 renderBelowForm 提供） */}
      <div style={{ minWidth: 0 }}>
        {renderBelowForm ? (
          // 有下层 Tab（StyleInfoTabs）→ 把基础信息内容传给 StyleInfoTabs，作为第一个 Tab
          renderBelowForm(basicInfoTabContent)
        ) : (
          // 无下层 Tab（如新建页面）→ 直接平铺基础信息
          basicInfoTabContent
        )}
      </div>
    </Row>
  );
};

export default StyleBasicInfoForm;
