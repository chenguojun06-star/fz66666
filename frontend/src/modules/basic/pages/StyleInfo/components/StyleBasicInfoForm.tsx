import React from 'react';
import { Row } from 'antd';
import CoverImageUpload from './CoverImageUpload';
import type { StyleBasicInfoFormProps } from './StyleBasicInfoForm/types';
import { useStyleBasicInfoForm } from './StyleBasicInfoForm/useStyleBasicInfoForm';
import BasicInfoSection from './StyleBasicInfoForm/BasicInfoSection';
import CustomerInfoSection from './StyleBasicInfoForm/CustomerInfoSection';
import PlateInfoSection from './StyleBasicInfoForm/PlateInfoSection';
import TimeRemarkSection from './StyleBasicInfoForm/TimeRemarkSection';
import ColorSizeSkuSection from './StyleBasicInfoForm/ColorSizeSkuSection';
import ExtFieldsSectionBlock from './StyleBasicInfoForm/ExtFieldsSectionBlock';

// 向后兼容：外部从本文件导入 StyleBasicInfoFormRef 类型
export type { StyleBasicInfoFormRef } from './StyleBasicInfoForm/types';

/**
 * 款式基础信息表单组件
 * 包含：款号信息、客户信息、版次信息、时间信息、颜色码数配置
 *
 * 拆分说明（原 644 行 → 主文件仅负责组合）：
 *  - 业务逻辑：useStyleBasicInfoForm.ts（同步 effect + 智能识别填充 + ref 暴露）
 *  - 常量：StyleBasicInfoForm/constants.ts
 *  - 类型：StyleBasicInfoForm/types.ts
 *  - 子区块：StyleBasicInfoForm/*Section.tsx + SectionBox.tsx
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
}) => {
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
        <BasicInfoSection {...sectionFormContext} isNewPage={isNewPage} />

        {/* 区2：客户跟进信息 */}
        <CustomerInfoSection {...sectionFormContext} />

        {/* 区3：版次与版型信息 */}
        <PlateInfoSection {...sectionFormContext} />

        {/* 区4：时间与备注 */}
        <TimeRemarkSection {...sectionFormContext} />

        {/* 区5：颜色 / 尺码 / SKU 配置 */}
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

        {/* 区6：扩展字段 */}
        <ExtFieldsSectionBlock
          customFields={customFields}
          editLocked={editLocked}
        />
      </div>
    </Row>
  );
};

export default StyleBasicInfoForm;
