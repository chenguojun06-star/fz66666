import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

export const SMALL_MODAL_WIDTH = 760;

const SmallModal: React.FC<ModalProps> = ({ centered, destroyOnHidden, width, styles, ...rest }) => {
  const resolvedStyles = React.useMemo(() => {
    const nextStyles = (styles || {}) as Record<string, React.CSSProperties>;
    return {
      ...nextStyles,
      body: {
        ...(nextStyles.body || {}),
        paddingTop: 16,
      },
    } as ModalProps['styles'];
  }, [styles]);

  const resolvedWidth = React.useMemo(() => {
    if (typeof width === 'number') return width;
    if (typeof width === 'string') return width;
    if (typeof window === 'undefined') return SMALL_MODAL_WIDTH;
    return Math.min(SMALL_MODAL_WIDTH, Math.max(360, window.innerWidth - 32));
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
