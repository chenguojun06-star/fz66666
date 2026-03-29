import React from 'react';
import ResizableModal, { ResizableModalProps } from '@/components/common/ResizableModal';

export type StandardModalSize = 'sm' | 'md' | 'lg';

const sizeConfig: Record<StandardModalSize, { widthRatio: number; heightRatio: number; minWidth: number }> = {
  sm: { widthRatio: 0.5, heightRatio: 0.4, minWidth: 480 },
  md: { widthRatio: 0.6, heightRatio: 0.5, minWidth: 560 },
  lg: { widthRatio: 0.75, heightRatio: 0.6, minWidth: 640 },
};

export type StandardModalProps = ResizableModalProps & {
  size?: StandardModalSize;
};

const StandardModal: React.FC<StandardModalProps> = ({
  size = 'md',
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

  return (
    <ResizableModal
      width={resolvedWidth}
      minWidth={resolvedMinWidth}
      initialHeight={resolvedInitialHeight}
      {...rest}
    />
  );
};

export default StandardModal;
