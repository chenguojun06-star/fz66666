import React from 'react';
import { Modal } from 'antd';
import type { ResizableModalProps, LightSenseType, Size } from './types';
import { COMPACT_MODAL_MIN_WIDTH, GLOW_COLOR_MAP } from './constants';
import { clamp, resolveWidthPx, resolveContentPadding, buildModalCss } from './utils';
import { useResizableModalTableScrollY } from './hooks/useResizableModalTableScrollY';
import ResizeIndicator from './ResizeIndicator';

export { useResizableModalTableScrollY, COMPACT_MODAL_MIN_WIDTH };
export type { LightSenseType, ResizableModalProps };

const ResizableModal: React.FC<ResizableModalProps> = ({
  open,
  afterOpenChange,
  onCancel,
  styles,
  width,
  minWidth = 560,
  minHeight = 360,
  initialHeight,
  centered: centeredProp,
  contentPadding,
  footer,
  title,
  destroyOnHidden = true,
  forceRender,
  lightSense = 'default',
  blurMask = false,
  ...rest
}) => {
  const [size, setSize] = React.useState<Size>(() => {
    const resolved = resolveWidthPx(width);
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportMaxWidth = Math.round(viewportWidth * 0.98);
    const viewportMaxHeight = Math.round(viewportHeight * 0.95);
    const safeMinWidth = Math.min(minWidth, viewportMaxWidth);
    const safeMinHeight = Math.min(minHeight, viewportMaxHeight);
    const initWidth = resolved ?? Math.round(viewportWidth * 0.6);
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : Math.round(viewportHeight * 0.82));
    return {
      width: clamp(initWidth, safeMinWidth, viewportMaxWidth),
      height: clamp(initHeight, safeMinHeight, viewportMaxHeight),
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

  const centered = centeredProp ?? true;

  const responsiveFontSize = React.useMemo(() => {
    const baseWidth = 900;
    const scale = Math.min(1, Math.max(0.75, size.width / baseWidth));
    return {
      base: Math.round(14 * scale),
      sm: Math.round(12 * scale),
      xs: Math.round(11 * scale),
      lg: Math.round(16 * scale),
      scale,
    };
  }, [size.width]);

  const modalCss = React.useMemo(() => {
    const resolvedPadding = resolveContentPadding(contentPadding);
    return buildModalCss(resolvedPadding, responsiveFontSize);
  }, [contentPadding, responsiveFontSize]);

  const rafIdRef = React.useRef<number | null>(null);

  const mountedRef = React.useRef(true);
  const stopResize = React.useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    resizeSessionRef.current = null;
    if (mountedRef.current) {
      setIsResizing(false);
    }
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const resolved = resolveWidthPx(width);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportMaxWidth = Math.round(viewportWidth * 0.98);
    const viewportMaxHeight = Math.round(viewportHeight * 0.95);
    const safeMinWidth = Math.min(minWidth, viewportMaxWidth);
    const safeMinHeight = Math.min(minHeight, viewportMaxHeight);

    const defaultWidthRatio = viewportWidth < 768 ? 0.96 : viewportWidth < 1024 ? 0.7 : 0.6;
    const initWidth = resolved ?? Math.round(viewportWidth * defaultWidthRatio);
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : Math.round(viewportHeight * 0.82));

    setSize({
      width: clamp(initWidth, safeMinWidth, viewportMaxWidth),
      height: clamp(initHeight, safeMinHeight, viewportMaxHeight),
    });
  }, [initialHeight, maxHeight, maxWidth, minHeight, minWidth, open, width]);

  React.useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportMaxWidth = Math.round(viewportWidth * 0.98);
      const viewportMaxHeight = Math.round(viewportHeight * 0.95);

      setSize((prev) => {
        const newWidth = clamp(prev.width, minWidth, viewportMaxWidth);
        const newHeight = clamp(prev.height, minHeight, viewportMaxHeight);
        if (newWidth === prev.width && newHeight === prev.height) {
          return prev;
        }
        return { width: newWidth, height: newHeight };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [minWidth, minHeight, open]);

  React.useEffect(() => {
    if (!open) {
      stopResize();
    }
  }, [open, stopResize]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        stopResize();
      } catch {
        // ignore
      }
    };
  }, [stopResize]);

  const glowColor = GLOW_COLOR_MAP[lightSense];

  return (
    <Modal
      {...rest}
      open={open}
      onCancel={onCancel}
      footer={footer}
      title={title}
      destroyOnHidden={destroyOnHidden}
      forceRender={forceRender}
      centered={centered}
      width={Math.round(size.width)}
      className={`light-sense-modal light-sense-${lightSense}${rest.className ? ' ' + rest.className : ''}`}
      styles={{
        ...styles,
        mask: {
          background: `linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 100%)`,
          ...(blurMask ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
          ...(styles as any)?.mask,
        },
        body: {
          ...(styles as any)?.body,
          overflow: 'auto',
          minHeight: 0,
          borderRadius: 16,
          boxShadow: `0 20px 60px rgba(${glowColor}, 0.18), 0 4px 16px rgba(0, 0, 0, 0.06)`,
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
              lineHeight: 1.4,
              maxWidth: '100vw',
              maxHeight: '100vh',
              overflow: 'visible',
            }}
          >
            <style>{modalCss}</style>
            {React.cloneElement(element, {
              style: {
                ...element.props.style,
                width: '100%',
                height: '100%',
                lineHeight: 1.4,
                maxWidth: '100%',
                maxHeight: '100%',
              },
            })}
            <ResizeIndicator width={size.width} height={size.height} visible={isResizing} />
          </div>
        );
      }}
      afterOpenChange={afterOpenChange}
    />
  );
};

export default ResizableModal;
