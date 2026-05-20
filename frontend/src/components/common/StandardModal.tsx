import React from 'react';
import ResizableModal, { ResizableModalProps } from '@/components/common/ResizableModal';

/**
 * 弹窗尺寸规范（项目铁律：30vw/40vw/60vw 三档）
 * sm = 30vw: 简单表单、确认弹窗
 * md = 40vw: 普通表单、列表选择（默认）
 * lg = 60vw: 复杂表单、含表格、多Tab
 */
export type StandardModalSize = 'sm' | 'md' | 'lg';

const sizeConfig: Record<StandardModalSize, { width: string; minWidth: number }> = {
  sm: { width: '30vw', minWidth: 480 },
  md: { width: '40vw', minWidth: 640 },
  lg: { width: '60vw', minWidth: 800 },
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

  const initialHeight =
    typeof window !== 'undefined'
      ? Math.round(window.innerHeight * 0.7)
      : Math.round(800 * 0.55);

  return (
    <ResizableModal
      width={cfg.width}
      minWidth={cfg.minWidth}
      initialHeight={initialHeight}
      maskClosable={maskClosable ?? (rest.onOk ? false : true)}
      {...rest}
    />
  );
};

export default StandardModal;