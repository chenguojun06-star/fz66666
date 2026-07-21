import type { FormInstance } from 'antd';
import type React from 'react';
import type { StyleInfo } from '@/types/style';
import type { StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

export interface StyleBasicInfoFormRef {
  applyStyleParseResult: (result: StyleFieldParseResult) => void;
}

export interface StyleBasicInfoFormProps {
  _form: FormInstance;
  currentStyle: StyleInfo | null;
  editLocked: boolean;
  isNewPage: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
  customFields: FieldConfigItem[];
  pendingImages: File[];
  onPendingImagesChange: (files: File[]) => void;
  coverRefreshToken: number;
  onCoverChange: (url: string | null) => void;
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
  styleId?: string;
  styleNo?: string;
  skc?: string;
  skuMode?: 'AUTO' | 'MANUAL';
  useSkuPrefix?: boolean | number;
  onRefresh?: () => void;
}

/** 颜色/尺码矩阵行类型，便于子组件复用 */
export type SizeColorMatrixRow = { color: string; quantities: number[]; imageUrl?: string };

/** 各子区块共享的 form 上下文 props */
export interface SectionFormContextProps {
  _form: FormInstance;
  currentStyle: StyleInfo | null;
  editLocked: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
}
