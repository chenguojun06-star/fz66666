import React from 'react';
import StyleColorSizeTable from '../StyleColorSizeTable';
import StyleSkuTab from '../StyleSkuTab';
import { SECTION_BOX_STYLE_COMPACT } from './constants';
import SectionBox from './SectionBox';

interface ColorSizeSkuSectionProps {
  // 颜色/尺码/数量 props
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
  matrixRows: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  setMatrixRows: (rows: Array<{ color: string; quantities: number[]; imageUrl?: string }>) => void;
  onImageSync: (color: string, file: File) => Promise<void> | void;
  onImageClear: (color: string) => Promise<void> | void;
  commonSizes: string[];
  setCommonSizes: (v: string[]) => void;
  commonColors: string[];
  setCommonColors: (v: string[]) => void;
  editLocked: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
  // SKU 表相关
  styleId?: string;
  styleNo?: string;
  skc?: string;
  skuMode?: 'AUTO' | 'MANUAL';
  useSkuPrefix?: boolean | number;
  onRefresh?: () => void;
  skuRefreshTrigger: number;
}

/**
 * 区5：颜色 / 尺码 / SKU 配置（融合一个模块）
 * 包含 StyleColorSizeTable 与根据其自动生成的 SKU 明细表。
 */
const ColorSizeSkuSection: React.FC<ColorSizeSkuSectionProps> = ({
  size1, setSize1, size2, setSize2, size3, setSize3, size4, setSize4, size5, setSize5,
  color1, setColor1, color2, setColor2, color3, setColor3, color4, setColor4, color5, setColor5,
  qty1, setQty1, qty2, setQty2, qty3, setQty3, qty4, setQty4, qty5, setQty5,
  sizeOptions, setSizeOptions, colorOptions, setColorOptions,
  matrixRows, setMatrixRows,
  onImageSync, onImageClear,
  commonSizes, setCommonSizes, commonColors, setCommonColors,
  editLocked, isFieldLocked,
  styleId, styleNo, skc, skuMode, useSkuPrefix, onRefresh,
  skuRefreshTrigger,
}) => {
  return (
    <SectionBox title="颜色 / 尺码 / SKU 配置" boxStyle={SECTION_BOX_STYLE_COMPACT}>
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
        matrixRows={matrixRows}
        setMatrixRows={setMatrixRows}
        onImageSync={onImageSync}
        onImageClear={onImageClear}
        commonSizes={commonSizes}
        setCommonSizes={setCommonSizes}
        commonColors={commonColors}
        setCommonColors={setCommonColors}
        editLocked={editLocked}
        isFieldLocked={isFieldLocked}
        hideInternalTitle
      />

      {/* 根据颜色/尺码自动生成的 SKU 明细表 */}
      {styleId && (
        <StyleSkuTab
          styleId={styleId}
          styleNo={styleNo || ''}
          skc={skc}
          skuMode={skuMode}
          useSkuPrefix={useSkuPrefix}
          onModeChange={() => { onRefresh?.(); }}
          onRefresh={onRefresh}
          refreshTrigger={skuRefreshTrigger}
        />
      )}
    </SectionBox>
  );
};

export default ColorSizeSkuSection;
