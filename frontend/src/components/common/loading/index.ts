/**
 * 统一加载体系出口（D-702）
 *
 * <p>全站新增加载指示器<b>一律从本文件导入</b>，不要直接引用内部组件路径 ——
 * 这样后续若要换视觉，只需改这一处。
 *
 * <pre>{@code
 * import { BrandLoader, BrandLoading, BrandMark } from '@/components/common/loading';
 * }</pre>
 */
export { default as BrandLoader, MARK_MAX_SIZE } from '../BrandLoader';
export type { BrandLoaderProps, BrandLoaderSize } from '../BrandLoader';

export { default as BrandLoading } from '../BrandLoading';
export type { BrandLoadingProps } from '../BrandLoading';

export { default as BrandMark } from '../BrandMark';
export type { BrandMarkProps, BrandMarkSize } from '../BrandMark';

export { default as XiaoyunCloudAvatar } from '../XiaoyunCloudAvatar';
export type { XiaoyunCloudMood } from '../XiaoyunCloudAvatar';
