import type { ModalProps } from 'antd';

export type LightSenseType = 'default' | 'urgent' | 'success' | 'warning' | 'info';

export type Size = {
  width: number;
  height: number;
};

export type ContentPadding =
  | number
  | {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

export type ResizableModalProps = ModalProps & {
  minWidth?: number;
  minHeight?: number;
  initialHeight?: number;
  contentPadding?: ContentPadding;
  lightSense?: LightSenseType;
  blurMask?: boolean;
  [key: string]: any;
};
