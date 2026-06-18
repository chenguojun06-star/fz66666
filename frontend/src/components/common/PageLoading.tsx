/**
 * 全局统一加载组件
 * 
 * 规范：
 * - 普通数据加载：使用统一PageLoading（屏幕中间大loading）
 * - AI场景（AI助手回答中）：使用小云AI动画
 * 
 * 禁止：在各模块内部单独使用小云作为数据加载动画
 */
import React from 'react';
import { Spin } from 'antd';
import './PageLoading.css';

interface PageLoadingProps {
  /** 自定义提示文字 */
  tip?: string;
  /** 是否全屏遮罩（默认false，仅居中显示） */
  fullscreen?: boolean;
  /** 自定义className */
  className?: string;
}

export const PageLoading: React.FC<PageLoadingProps> = ({
  tip = '加载中...',
  fullscreen = false,
  className = '',
}) => {
  return (
    <div className={`page-loading-wrapper ${fullscreen ? 'page-loading-fullscreen' : ''} ${className}`}>
      <Spin size="large" tip={tip} />
    </div>
  );
};

/**
 * 全屏加载遮罩（用于页面切换等场景）
 */
export const FullScreenLoading: React.FC<{ tip?: string }> = ({ tip = '页面加载中...' }) => {
  return (
    <div className="page-loading-fullscreen">
      <PageLoading tip={tip} />
    </div>
  );
};

export default PageLoading;
