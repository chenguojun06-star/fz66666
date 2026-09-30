import React, { useEffect, useMemo } from 'react';
import { Col, Row } from 'antd';
import CoverImageUpload from './CoverImageUpload';
import type { StyleBasicInfoFormProps } from './StyleBasicInfoForm/types';
import { useStyleBasicInfoForm } from './StyleBasicInfoForm/useStyleBasicInfoForm';
import BasicInfoSection from './StyleBasicInfoForm/BasicInfoSection';
import CustomerInfoSection from './StyleBasicInfoForm/CustomerInfoSection';
import StyleFeatureSection from './StyleBasicInfoForm/StyleFeatureSection';
import ColorSizeSkuSection from './StyleBasicInfoForm/ColorSizeSkuSection';
import ExtFieldsSectionBlock from './StyleBasicInfoForm/ExtFieldsSectionBlock';
import SectionBox from './StyleBasicInfoForm/SectionBox';
// D-440：商品属性与规格字段组（与商品资料详情抽屉共用同一份定义）
import { ProductNatureFields } from '@/modules/warehouse/pages/ProductInfo/components/ProductInfoForm';

// 向后兼容：外部从本文件导入 StyleBasicInfoFormRef 类型
export type { StyleBasicInfoFormRef } from './StyleBasicInfoForm/types';

/**
 * 款式基础信息表单组件
 * 包含：款号信息、客户信息、版次信息、时间信息、颜色码数配置
 *
 * 布局说明：
 *  - 顶部：款式状态摘要条（横向单行）
 *  - 基础信息区左栏为图片资产（主图180px+缩略图+操作），与表单字段合并为一个区块
 *  - 下方：统一 Tab 系统（基础信息 / BOM清单 / 纸样开发 / ...）
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
  const { skuRefreshTrigger, bumpSkuRefresh, handleStyleParseResult } = useStyleBasicInfoForm({
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

  // 颜色图片同步完成后主动刷新 商品编码 表（D-264）：
  // 此后端 PUT /style/sku/color-images 已把图片写到 SKU 行，但表不重拉，
  // 用户看到的是"传了图片商品编码里却是空的"
  const handleColorImageSyncAndRefresh = async (color: string, file: File) => {
    await onColorImageSync?.(color, file);
    bumpSkuRefresh();
  };

  const sectionFormContext = {
    _form,
    currentStyle,
    editLocked,
    isFieldLocked,
  };

  // 打板尺码/数量 与「颜色码数」矩阵联动：矩阵里实际填了数量的码 → 打板基础码；矩阵总数量 → 数量。
  // D-662：原逻辑把全部码数列都带进打板尺码（XS,S,M,L,XL,XXL），与"基础码"语义不符——
  // 用户口径：码数格里填的是什么码，打板基础码就是什么码；一码都没填时不覆盖，尊重历史手工值。
  const linkedPrintSize = useMemo(() => {
    const rows = sizeColorMatrixRows || [];
    const sizes = (sizeOptions || []).map((s) => String(s || '').trim());
    const filled = new Set<string>();
    rows.forEach((row) => {
      (row?.quantities || []).forEach((q, idx) => {
        if ((Number(q) || 0) > 0 && sizes[idx]) filled.add(sizes[idx]);
      });
    });
    return [...filled].join(',');
  }, [sizeColorMatrixRows, sizeOptions]);
  const linkedTotalQty = useMemo(() => {
    const rows = sizeColorMatrixRows || [];
    if (!rows.length) return '';
    const total = rows.reduce((sum, row) => (
      sum + (row?.quantities || []).reduce((s, q) => s + (Number(q) || 0), 0)
    ), 0);
    return total > 0 ? String(total) : '';
  }, [sizeColorMatrixRows]);

  useEffect(() => {
    if (!linkedPrintSize && !linkedTotalQty) return;
    _form.setFieldsValue({
      ...(linkedPrintSize ? { printSize: linkedPrintSize } : {}),
      ...(linkedTotalQty ? { attrQuantity: linkedTotalQty } : {}),
    });
  }, [linkedPrintSize, linkedTotalQty, _form]);

  // 图片资产：合并进基础信息区左栏（主图180px+缩略图+上传/识别/搜相似）
  const coverNode = (
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
  );

  // 基础信息 Tab 内容：所有表单分区合并在一个 Tab 里
  // 容器加 .style-basic-info-tab 作用域：表单标签在上、输入框在下，
  // 输入框左边缘与下方颜色码数表格对齐，消除左侧标签留白，上下工整
  const basicInfoTabContent = (
    <div className="style-basic-info-tab">
      {/* 区1：基础信息（左栏图片资产 + 右侧表单：款号/SKC/款名/品类/季节/销售渠道，含时间信息） */}
      <BasicInfoSection {...sectionFormContext} isNewPage={isNewPage} coverSlot={coverNode} />

      {/* 区2+区3：客户与定价 | 款式特征 左右并排，压缩纵向高度（窄屏自动堆叠） */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <CustomerInfoSection {...sectionFormContext} />
        </Col>
        <Col xs={24} xl={12}>
          <StyleFeatureSection {...sectionFormContext} isNewPage={isNewPage} />
        </Col>
      </Row>

      {/* 商品规格（重量/单位/长宽高/是否里布/打板尺码/数量）
          与商品资料详情抽屉共用 ProductNatureFields 字段组，落 t_style_info 同名列。
          打板尺码/数量与下方「颜色码数」矩阵联动只读展示（原「商品属性」成品/半成品单选与
          「标签」自由文本因语义重复且无消费方已移除，见 ProductNatureFields 注释） */}
      <SectionBox title="商品规格">
        <ProductNatureFields disabled={editLocked} linked />
      </SectionBox>

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
        onImageSync={handleColorImageSyncAndRefresh}
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
    </div>
  );

  return (
    <div className="square-inputs u-d-flex u-fd-column u-gap-12" style={{ minWidth: 0 }}>
      {/* 下方：统一 Tab 系统（基础信息排在最前，BOM清单等后续 Tab 由 renderBelowForm 提供） */}
      <div style={{ minWidth: 0 }}>
        {renderBelowForm ? (
          // 有下层 Tab（StyleInfoTabs）→ 把基础信息内容传给 StyleInfoTabs，作为第一个 Tab
          renderBelowForm(basicInfoTabContent)
        ) : (
          // 无下层 Tab（如新建页面）→ 直接平铺基础信息
          basicInfoTabContent
        )}
      </div>
    </div>
  );
};

export default StyleBasicInfoForm;
