import React from 'react';
import ResizableModal, { COMPACT_MODAL_MIN_WIDTH, ResizableModalProps } from '@/components/common/ResizableModal';

export type StandardModalSize = 'sm' | 'md' | 'lg';

const sizeConfig: Record<StandardModalSize, { width: string; heightRatio: number; minWidth: number }> = {
  sm: { width: '760px', heightRatio: 0.4, minWidth: COMPACT_MODAL_MIN_WIDTH },
  md: { width: '920px', heightRatio: 0.5, minWidth: 920 },
  lg: { width: '60vw', heightRatio: 0.6, minWidth: 880 },
};

export type StandardModalProps = ResizableModalProps & {
  size?: StandardModalSize;
};

const StandardModal: React.FC<StandardModalProps> = ({
  size = 'md',
  ...rest
}) => {
  const cfg = sizeConfig[size];
  const resolvedWidth = cfg.width;
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
