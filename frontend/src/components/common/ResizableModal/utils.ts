import type { ModalProps } from 'antd';

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const resolveWidthPx = (width: ModalProps['width']): number | null => {
  if (typeof window === 'undefined') return null;

  if (typeof width === 'number') return width;
  if (typeof width !== 'string') return null;

  const raw = width.trim();
  const vwMatch = raw.match(/^([0-9.]+)vw$/i);
  if (vwMatch) {
    const vw = Number(vwMatch[1]);
    if (vw <= 55) return Math.max(560, Math.min(1100, (vw / 100) * window.innerWidth));
    if (vw <= 70) return Math.max(720, Math.min(1200, (vw / 100) * window.innerWidth));
    return (vw / 100) * window.innerWidth;
  }

  const percentMatch = raw.match(/^([0-9.]+)%$/);
  if (percentMatch) return (Number(percentMatch[1]) / 100) * window.innerWidth;

  const pxMatch = raw.match(/^([0-9.]+)px$/i);
  if (pxMatch) return Number(pxMatch[1]);

  const plainNumber = Number(raw);
  if (Number.isFinite(plainNumber)) return plainNumber;

  return null;
};

export const resolveContentPadding = (
  contentPadding?: number | { top: number; right: number; bottom: number; left: number }
) => {
  if (typeof contentPadding === 'number') {
    return { top: contentPadding, right: contentPadding, bottom: contentPadding, left: contentPadding };
  }
  if (contentPadding && typeof contentPadding === 'object') {
    return {
      top: contentPadding.top,
      right: contentPadding.right,
      bottom: contentPadding.bottom,
      left: contentPadding.left,
    };
  }
  return { top: 16, right: 24, bottom: 16, left: 24 };
};

export const buildModalCss = (
  resolvedPadding: { top: number; right: number; bottom: number; left: number },
  responsiveFontSize: { base: number; sm: number; xs: number; lg: number; scale: number }
) => {
  return (
    '[data-resizable-modal-root] .ant-modal-container{height:100%;display:flex;flex-direction:column;overflow:visible;}' +
    '[data-resizable-modal-root] .ant-modal-header,[data-resizable-modal-root] .ant-modal-footer{flex:0 0 auto;}' +
    '[data-resizable-modal-root] .ant-modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:' +
    `${resolvedPadding.top}px ${resolvedPadding.right}px ${resolvedPadding.bottom}px ${resolvedPadding.left}px` +
    '!important;}' +
    '[data-resizable-modal-root] .ant-form-item{margin-bottom:10px;}' +
    `[data-resizable-modal-root]{font-size:${responsiveFontSize.base}px;}` +
    `[data-resizable-modal-root] .ant-input,[data-resizable-modal-root] .ant-select,[data-resizable-modal-root] .ant-input-number,[data-resizable-modal-root] .ant-picker{font-size:${responsiveFontSize.base}px!important;}` +
    `[data-resizable-modal-root] .ant-btn-sm{font-size:${responsiveFontSize.sm}px!important;}` +
    `[data-resizable-modal-root] .ant-form-item-label>label{font-size:${responsiveFontSize.base}px!important;}` +
    `[data-resizable-modal-root] .ant-table{font-size:${responsiveFontSize.sm}px!important;}` +
    `[data-resizable-modal-root] .ant-tag{font-size:${responsiveFontSize.xs}px!important;}` +
    `[data-resizable-modal-root] .ant-tabs-tab{font-size:${responsiveFontSize.base}px!important;}`
  );
};
