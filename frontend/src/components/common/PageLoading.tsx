/**
 * 页面级加载组件（D-702）
 *
 * <b>规范（2026-10-02 起）</b>：
 * - 普通数据加载 → `PageLoading`（即本组件，内部已换成品牌统一加载）
 * - 内容区「数据还在、处理中」→ `BrandLoading`（保留 children + 遮罩）
 * - 按钮内联 → 组件自带的 `loading` 属性，样式已由 button-override.css 统一接管
 * - AI 场景（小云回答中）→ `BrandLoader` 加 `mood` / `label`
 *
 * <b>禁止</b>：直接 `import { Spin } from 'antd'`。
 * 全站已于 D-702 完成迁移（124 个文件），Spin 用量归零。
 * 按钮 loading 与内容区 loading 的视觉都来自同一套品牌资产，不会再出现
 * 「一个页面转圈、另一个页面转小云」的情况。
 */
import React from 'react';
import { BrandLoader } from '@/components/common/loading';
import './PageLoading.css';

interface PageLoadingProps {
  /** 提示文字 */
  tip?: string;
  /** 是否全屏遮罩（默认 false，仅居中显示） */
  fullscreen?: boolean;
  /** 自定义 className */
  className?: string;
  /**
   * 尺寸（像素）。默认 64 —— 页面级有足够空间，用小云吉祥物而非极简云标。
   * 传 <32 会自动降级为极简云标。
   */
  size?: number;
}

export const PageLoading: React.FC<PageLoadingProps> = ({
  tip = '加载中...',
  fullscreen = false,
  className = '',
  size = 64,
}) => {
  return (
    <div className={`page-loading-wrapper ${fullscreen ? 'page-loading-fullscreen' : ''} ${className}`}>
      <BrandLoader size={size} label={tip} block />
    </div>
  );
};

/**
 * 全屏加载遮罩（用于页面切换等场景）
 */
export const FullScreenLoading: React.FC<{ tip?: string }> = ({ tip = '页面加载中...' }) => {
  return (
    <div className="page-loading-fullscreen">
      <PageLoading tip={tip} size={96} />
    </div>
  );
};

export default PageLoading;
