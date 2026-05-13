import React from 'react';
import ResizableModal, { ResizableModalProps } from '@/components/common/ResizableModal';

export type StandardModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeConfig: Record<StandardModalSize, { widthRatio: number; heightRatio: number; minWidth: number }> = {
  sm: { widthRatio: 0.5, heightRatio: 0.4, minWidth: 480 },
  md: { widthRatio: 0.6, heightRatio: 0.5, minWidth: 560 },
  lg: { widthRatio: 0.8, heightRatio: 0.65, minWidth: 800 },
  xl: { widthRatio: 0.85, heightRatio: 0.7, minWidth: 900 },
};

export type StandardModalProps = ResizableModalProps & {
  size?: StandardModalSize;
};

const StandardModal: React.FC<StandardModalProps> = ({
  size = 'md',
  maskClosable,
  ...rest
}) => {
  const cfg = sizeConfig[size];
  const resolvedWidth = typeof window !== 'undefined'
    ? Math.round(window.innerWidth * cfg.widthRatio)
    : 800;
  const resolvedMinWidth = cfg.minWidth;
  const resolvedInitialHeight =
    typeof window !== 'undefined'
      ? Math.round(window.innerHeight * cfg.heightRatio)
      : Math.round(800 * cfg.heightRatio);

  const computedMaskClosable = maskClosable ?? (rest.onOk ? false : true);

  return (
    <ResizableModal
      width={resolvedWidth}
      minWidth={resolvedMinWidth}
      initialHeight={resolvedInitialHeight}
      maskClosable={computedMaskClosable}
      {...rest}
    />
  );
};

export default StandardModal;
