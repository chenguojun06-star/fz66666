import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

export const SMALL_MODAL_WIDTH = 880;

const SmallModal: React.FC<ModalProps> = ({ centered, destroyOnHidden, width, styles, ...rest }) => {
  const resolvedStyles = React.useMemo(() => {
    const passed = (styles || {}) as Record<string, React.CSSProperties>;
    const bodyStyle = passed.body || {};
    return {
      ...passed,
      body: {
        ...bodyStyle,
        paddingTop: 16,
      },
    } as ModalProps['styles'];
  }, [styles]);

  const resolvedWidth = React.useMemo(() => {
    if (typeof width === 'number') return width;
    if (typeof width === 'string') return width;
    if (typeof window === 'undefined') return SMALL_MODAL_WIDTH;
    // 按视口宽度 60% 计算，上限 1080px，下限 440px，避免又细又长
    const based = Math.round(window.innerWidth * 0.6);
    return Math.max(440, Math.min(1080, based));
  }, [width]);

  return (
    <Modal
      centered={centered ?? true}
      destroyOnHidden={destroyOnHidden ?? true}
      width={resolvedWidth}
      styles={resolvedStyles}
      {...rest}
    />
  );
};

export default SmallModal;
