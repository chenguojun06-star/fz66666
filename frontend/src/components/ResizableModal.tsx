import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

type Size = {
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resolveWidthPx = (width: ModalProps['width']): number | null => {
  if (typeof window === 'undefined') return null;

  if (typeof width === 'number') return width;
  if (typeof width !== 'string') return null;

  const raw = width.trim();
  const vwMatch = raw.match(/^([0-9.]+)vw$/i);
  if (vwMatch) return (Number(vwMatch[1]) / 100) * window.innerWidth;

  const percentMatch = raw.match(/^([0-9.]+)%$/);
  if (percentMatch) return (Number(percentMatch[1]) / 100) * window.innerWidth;

  const pxMatch = raw.match(/^([0-9.]+)px$/i);
  if (pxMatch) return Number(pxMatch[1]);

  const plainNumber = Number(raw);
  if (Number.isFinite(plainNumber)) return plainNumber;

  return null;
};

export type ResizableModalProps = ModalProps & {
  minWidth?: number;
  minHeight?: number;
  initialHeight?: number;
  autoFontSize?: boolean;
  minFontSize?: number;
  maxFontSize?: number;
  tableDensity?: 'auto' | 'loose' | 'default' | 'compact' | 'dense';
  tablePaddingX?: number;
  tablePaddingY?: number;
  contentShiftX?: number;
  scaleWithViewport?: boolean;
};

const ResizableModal: React.FC<ResizableModalProps> = ({
  open,
  afterOpenChange,
  onCancel,
  styles,
  width,
  minWidth = 520,
  minHeight = 320,
  initialHeight,
  centered: centeredProp,
  autoFontSize = true,
  minFontSize = 12,
  maxFontSize = 16,
  tableDensity = 'auto',
  tablePaddingX,
  tablePaddingY,
  contentShiftX = 0,
  scaleWithViewport = false,
  footer,
  title,
  ...rest
}) => {
  const [size, setSize] = React.useState<Size>(() => {
    const resolved = resolveWidthPx(width);
    const initWidth = resolved ?? (typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.6) : 800);
    const initHeight =
      typeof window !== 'undefined'
        ? Math.round(typeof initialHeight === 'number' ? initialHeight : window.innerHeight * 0.6)
        : 640;
    return {
      width: initWidth,
      height: initHeight,
    };
  });

  const resizeSessionRef = React.useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    direction: 'both' | 'x' | 'y';
    pointerId: number;
  } | null>(null);

  const [isResizing, setIsResizing] = React.useState(false);

  const maxWidth = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.98) : 1400;
  const maxHeight = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.95) : 900;

  const fontSize = React.useMemo(() => {
    if (!autoFontSize) return undefined;
    const min = minFontSize;
    const max = maxFontSize;
    const t = (size.width - 640) / (1200 - 640);
    const next = min + t * (max - min);
    return clamp(next, min, max);
  }, [autoFontSize, maxFontSize, minFontSize, size.width]);

  const centered = centeredProp ?? true;

  const hasFooter = footer !== null && footer !== undefined;

  const resolvedTablePadding = React.useMemo(() => {
    if (typeof tablePaddingX === 'number' || typeof tablePaddingY === 'number') {
      return {
        x: typeof tablePaddingX === 'number' ? tablePaddingX : 6,
        y: typeof tablePaddingY === 'number' ? tablePaddingY : 4,
      };
    }

    if (tableDensity === 'dense') return { x: 4, y: 2 };
    if (tableDensity === 'compact') return { x: 6, y: 4 };
    if (tableDensity === 'default') return { x: 8, y: 6 };
    if (tableDensity === 'loose') return { x: 12, y: 8 };

    if (size.width < 820) return { x: 4, y: 2 };
    if (size.width < 1100) return { x: 6, y: 4 };
    return { x: 8, y: 6 };
  }, [size.width, tableDensity, tablePaddingX, tablePaddingY]);

  const modalCss = React.useMemo(() => {
    const paddingLeft = 24 + contentShiftX;
    const paddingRight = 24;
    const paddingTop = 16;
    const paddingBottom = 16;
    const tablePadding = `${resolvedTablePadding.y}px ${resolvedTablePadding.x}px`;

    return (
      '[data-resizable-modal-root] .ant-modal-content{height:100%;display:flex;flex-direction:column;overflow:hidden;}' +
      '[data-resizable-modal-root] .ant-modal-header,[data-resizable-modal-root] .ant-modal-footer{flex:0 0 auto;}' +
      '[data-resizable-modal-root] .ant-modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:' +
      `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px` +
      '!important;}' +
      '[data-resizable-modal-root] .ant-modal-footer{padding-right:56px!important;}' +
      '[data-resizable-modal-root] .ant-form-item{margin-bottom:10px;}' +
      '[data-resizable-modal-root] .ant-table{font-size:inherit;}' +
      '[data-resizable-modal-root] .ant-table-cell{line-height:inherit;}' +
      '[data-resizable-modal-root] .ant-table-thead > tr > th,[data-resizable-modal-root] .ant-table-tbody > tr > td{padding:' +
      tablePadding +
      '!important;}' +
      '[data-resizable-modal-root] .ant-table-wrapper .ant-table{margin:0;}' +
      '[data-resizable-modal-root] .ant-table-thead > tr > th{font-weight:600;}'
    );
  }, [contentShiftX, resolvedTablePadding.x, resolvedTablePadding.y]);

  const applyResize = React.useCallback((clientX: number, clientY: number) => {
    if (!resizeSessionRef.current) return;
    const { startX, startY, startWidth, startHeight, direction } = resizeSessionRef.current;

    const viewportMaxWidth = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.98) : maxWidth;
    const viewportMaxHeight = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.95) : maxHeight;

    const dx = clientX - startX;
    const dy = clientY - startY;
    const nextWidth =
      direction === 'x' || direction === 'both' ? clamp(startWidth + dx, minWidth, viewportMaxWidth) : startWidth;
    const nextHeight =
      direction === 'y' || direction === 'both' ? clamp(startHeight + dy, minHeight, viewportMaxHeight) : startHeight;
    setSize({ width: nextWidth, height: nextHeight });
  }, [maxHeight, maxWidth, minHeight, minWidth]);

  const stopResize = React.useCallback(() => {
    resizeSessionRef.current = null;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const startResize = React.useCallback((direction: 'both' | 'x' | 'y') => {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
      }

      resizeSessionRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startWidth: size.width,
        startHeight: size.height,
        direction,
        pointerId: e.pointerId,
      };
      setIsResizing(true);
      document.body.style.cursor = direction === 'x' ? 'ew-resize' : direction === 'y' ? 'ns-resize' : 'nwse-resize';
      document.body.style.userSelect = 'none';
    };
  }, [size.height, size.width]);

  const onHandlePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeSessionRef.current) return;
    if (e.pointerId !== resizeSessionRef.current.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    applyResize(e.clientX, e.clientY);
  }, [applyResize]);

  const onHandlePointerUp = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeSessionRef.current) return;
    if (e.pointerId !== resizeSessionRef.current.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
    stopResize();
  }, [stopResize]);

  React.useEffect(() => {
    if (!open) return;
    const resolved = resolveWidthPx(width);
    const initWidth = resolved ?? Math.round(window.innerWidth * 0.6);
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : window.innerHeight * 0.6);
    setSize({
      width: clamp(initWidth, minWidth, maxWidth),
      height: clamp(initHeight, minHeight, maxHeight),
    });
  }, [initialHeight, maxHeight, maxWidth, minHeight, minWidth, open, width]);

  React.useEffect(() => {
    if (!open) return;
    if (!scaleWithViewport) return;
    if (typeof window === 'undefined') return;

    const viewportRef = { w: window.innerWidth, h: window.innerHeight };

    const onResize = () => {
      const next = { w: window.innerWidth, h: window.innerHeight };
      const scaleW = viewportRef.w > 0 ? next.w / viewportRef.w : 1;
      const scaleH = viewportRef.h > 0 ? next.h / viewportRef.h : 1;
      viewportRef.w = next.w;
      viewportRef.h = next.h;

      setSize((prev) => {
        const viewportMaxWidth = Math.round(next.w * 0.98);
        const viewportMaxHeight = Math.round(next.h * 0.95);
        return {
          width: clamp(prev.width * scaleW, minWidth, viewportMaxWidth),
          height: clamp(prev.height * scaleH, minHeight, viewportMaxHeight),
        };
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [maxHeight, maxWidth, minHeight, minWidth, open, scaleWithViewport]);

  React.useEffect(() => {
    return () => {
      try {
        stopResize();
      } catch {
      }
    };
  }, [stopResize]);

  return (
    <Modal
      {...rest}
      open={open}
      onCancel={onCancel}
      footer={footer}
      title={title}
      centered={centered}
      width={Math.round(size.width)}
      styles={{
        ...styles,
        body: {
          ...(styles as any)?.body,
          overflow: 'auto',
          minHeight: 0,
        },
      }}
      modalRender={(modal) => {
        const element = modal as React.ReactElement<any>;
        return (
          <div
            data-resizable-modal-root
            style={{
              position: 'relative',
              width: size.width,
              height: size.height,
              fontSize,
              lineHeight: 1.4,
            }}
          >
            <style>{modalCss}</style>
            {React.cloneElement(element, {
              style: {
                ...element.props.style,
                width: size.width,
                height: size.height,
                fontSize,
                lineHeight: 1.4,
              },
            })}
            <div
              onPointerDown={startResize('both')}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              style={{
                position: 'absolute',
                right: 6,
                bottom: hasFooter ? 52 : 6,
                width: 28,
                height: 28,
                cursor: 'nwse-resize',
                zIndex: 2147483647,
                touchAction: 'none',
                borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.12)',
                background:
                  'linear-gradient(135deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.12) 56%, rgba(0,0,0,0) 56%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.12) 62%, rgba(0,0,0,0.12) 68%, rgba(0,0,0,0) 68%, rgba(0,0,0,0) 100%)',
              }}
            />
            {isResizing ? (
              <div
                style={{
                  position: 'absolute',
                  right: 40,
                  bottom: 10,
                  padding: '2px 8px',
                  fontSize: 12,
                  lineHeight: '16px',
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  borderRadius: 999,
                  zIndex: 2147483647,
                  pointerEvents: 'none',
                }}
              >
                {Math.round(size.width)}×{Math.round(size.height)}
              </div>
            ) : null}
          </div>
        );
      }}
      afterOpenChange={afterOpenChange}
    />
  );
};

export default ResizableModal;
