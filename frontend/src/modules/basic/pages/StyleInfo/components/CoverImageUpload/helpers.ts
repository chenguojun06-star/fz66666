import type { DisplayImage } from './types';

export interface AssetMeta {
  label: string;
  color: string;
}

/**
 * 解析资产元信息（主图/参考图/颜色图标签）
 * 从原 CoverImageUpload.resolveAssetMeta 抽离，逻辑保持不变
 */
export const resolveAssetMeta = (
  img: DisplayImage | undefined,
  index: number,
  coverUrl: string | null | undefined,
  isNewMode: boolean,
  currentIndex: number
): AssetMeta => {
  if (!img) return { label: '', color: 'var(--color-text-tertiary)' };
  if (String(img.fileUrl || '') === String(coverUrl || '')) {
    return { label: '主图', color: 'var(--color-warning)' };
  }
  if (img.isCoverFallback) {
    return { label: '参考图', color: 'var(--color-text-tertiary)' };
  }
  if (String(img.bizType || '').startsWith('color_image::')) {
    return { label: '颜色图', color: '#2563eb' };
  }
  if (isNewMode && index === currentIndex) {
    return { label: '主图', color: 'var(--color-warning)' };
  }
  return { label: '参考图', color: 'var(--color-text-tertiary)' };
};

/**
 * 计算识别状态文本（只组装一次，工具栏右侧展示）
 */
export const computeParseStatusText = (
  parsing: boolean,
  parseSuccessConfidence: number | null,
  autoParseError: string | null
): string => {
  if (parsing) return '识别中...';
  if (parseSuccessConfidence !== null) return `已识别 ${parseSuccessConfidence}%`;
  if (autoParseError) return '识别失败，可手动填写';
  return '';
};

/**
 * 计算识别状态颜色
 */
export const computeParseStatusColor = (
  parsing: boolean,
  parseSuccessConfidence: number | null,
  autoParseError: string | null
): string => {
  if (parsing) return 'var(--color-warning)';
  if (parseSuccessConfidence !== null) return 'var(--color-success, #16a34a)';
  if (autoParseError) return 'var(--color-warning)';
  return 'var(--color-text-tertiary)';
};
