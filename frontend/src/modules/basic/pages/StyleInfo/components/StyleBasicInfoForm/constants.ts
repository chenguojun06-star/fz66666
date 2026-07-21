import type { CSSProperties } from 'react';

/** 销售渠道下拉选项 */
export const SALES_CHANNEL_OPTIONS = [
  { label: '天猫', value: '天猫' },
  { label: '抖音', value: '抖音' },
  { label: '京东', value: '京东' },
  { label: '拼多多', value: '拼多多' },
  { label: '线下门店', value: '线下门店' },
  { label: '私域', value: '私域' },
  { label: '定制', value: '定制' },
  { label: '其他', value: '其他' },
];

/** 品类 -> 默认尺码推荐（智能识别后填充） */
export const DEFAULT_SIZE_MAP: Record<string, string[]> = {
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

/** 兜底尺码（无品类匹配时使用） */
export const FALLBACK_SIZES = ['S', 'M', 'L', 'XL'];

/** 区块容器内联样式（与原实现保持一致） */
export const SECTION_BOX_STYLE: CSSProperties = {
  marginBottom: 20,
  padding: 16,
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
};

/** 区块容器内联样式（紧凑版，用于最后两个区块，原 marginBottom: 4） */
export const SECTION_BOX_STYLE_COMPACT: CSSProperties = {
  ...SECTION_BOX_STYLE,
  marginBottom: 4,
};

/** 颜色/尺码同步防抖时长（ms） */
export const SIZE_COLOR_SYNC_DEBOUNCE_MS = 800;
