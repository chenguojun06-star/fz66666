import React from 'react';
import ResizableModal, { ResizableModalProps, LightSenseType } from '@/components/common/ResizableModal';

/**
 * 弹窗尺寸规范
 * sm: 确认弹窗 / 简单表单  (宽约 55vw, 高度约 60vh)
 * md: 普通表单 / 列表选择  (宽约 70vw, 高度约 72vh)
 * lg: 复杂表单 / 多Tab    (宽约 88vw, 高度约 82vh)
 */
export type StandardModalSize = 'sm' | 'md' | 'lg';

const sizeConfig: Record<StandardModalSize, { width: string; minWidth: number; heightRatio: number }> = {
  sm: { width: '55vw', minWidth: 560, heightRatio: 0.60 },
  md: { width: '70vw', minWidth: 720, heightRatio: 0.72 },
  lg: { width: '88vw', minWidth: 900, heightRatio: 0.82 },
};

export type StandardModalProps = ResizableModalProps & {
  size?: StandardModalSize;
  /** LightSense 光感效果，默认 'default' */
  lightSense?: LightSenseType;
};

const StandardModal: React.FC<StandardModalProps> = ({
  size = 'md',
  maskClosable,
  forceRender,
  lightSense = 'default',
  ...rest
}) => {
  const cfg = sizeConfig[size];

  const initialHeight =
    typeof window !== 'undefined'
      ? Math.round(window.innerHeight * cfg.heightRatio)
      : Math.round(800 * cfg.heightRatio);

  return (
    <ResizableModal
      width={cfg.width}
      minWidth={cfg.minWidth}
      initialHeight={initialHeight}
      maskClosable={maskClosable ?? (rest.onOk ? false : true)}
      forceRender={forceRender}
      lightSense={lightSense}
      {...rest}
    />
  );
};

export default StandardModal;