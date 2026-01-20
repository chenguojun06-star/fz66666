import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

/**
 * 尺寸类型定义
 */
type Size = {
  width: number;
  height: number;
};

type ContentPadding =
  | number
  | {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

export const ResizableModalFlex = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...rest }, ref) => {
    return (
      <div
        {...rest}
        ref={ref}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          ...(style || {}),
        }}
      />
    );
  }
);

export const ResizableModalFlexFill = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...rest }, ref) => {
    return (
      <div
        {...rest}
        ref={ref}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          ...(style || {}),
        }}
      />
    );
  }
);

ResizableModalFlex.displayName = 'ResizableModalFlex';
ResizableModalFlexFill.displayName = 'ResizableModalFlexFill';

export const useResizableModalTableScrollY = <T extends HTMLElement>(args: {
  open: boolean;
  ref: React.RefObject<T | null>;
  offset?: number;
  minY?: number;
  defaultY?: number;
  watch?: any[];
}) => {
  const { open, ref, offset = 56, minY = 180, defaultY = 320, watch = [] } = args;
  const [scrollY, setScrollY] = React.useState<number>(defaultY);

  React.useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      const h = Math.floor(el.getBoundingClientRect().height || 0);
      const y = Math.max(minY, h - offset);
      setScrollY((prev) => (prev === y ? prev : y));
    };

    compute();

    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') return;
      window.addEventListener('resize', compute);
      return () => window.removeEventListener('resize', compute);
    }

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, ref, offset, minY, ...watch]);

  return scrollY;
};

/**
 * 限制数值在指定范围内
 * @param value 要限制的数值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的数值
 */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 将宽度值转换为像素数值
 * @param width 宽度值，可能是数字、字符串或vw/%等单位
 * @returns 转换后的像素数值，转换失败则返回null
 */
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

/**
 * 可调整大小的模态框属性
 */
export type ResizableModalProps = ModalProps & {
  /** 最小宽度，默认520px */
  minWidth?: number;
  /** 最小高度，默认320px */
  minHeight?: number;
  /** 初始高度 */
  initialHeight?: number;
  /** 是否自动调整字体大小，默认true */
  autoFontSize?: boolean;
  /** 最小字体大小，默认12px */
  minFontSize?: number;
  /** 最大字体大小，默认16px */
  maxFontSize?: number;
  /** 表格密度，自动根据宽度调整 */
  tableDensity?: 'auto' | 'loose' | 'default' | 'compact' | 'dense';
  /** 表格单元格水平内边距 */
  tablePaddingX?: number;
  /** 表格单元格垂直内边距 */
  tablePaddingY?: number;
  /** 内容水平偏移量 */
  contentShiftX?: number;
  contentPadding?: ContentPadding;
  /** 是否随视口缩放，默认false */
  scaleWithViewport?: boolean;
};

/**
 * 可调整大小的模态框组件
 * 支持拖拽调整大小、自动调整字体大小、表格密度自适应等特性
 */
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
  contentPadding,
  scaleWithViewport = true,
  footer,
  title,
  ...rest
}) => {
  // 模态框尺寸状态
  const [size, setSize] = React.useState<Size>(() => {
    const resolved = resolveWidthPx(width);
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportMaxWidth = Math.round(viewportWidth * 0.98);
    const viewportMaxHeight = Math.round(viewportHeight * 0.95);
    const safeMinWidth = Math.min(minWidth, viewportMaxWidth);
    const safeMinHeight = Math.min(minHeight, viewportMaxHeight);
    const initWidth = resolved ?? Math.round(viewportWidth * 0.6);
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : 720);
    return {
      width: clamp(initWidth, safeMinWidth, viewportMaxWidth),
      height: clamp(initHeight, safeMinHeight, viewportMaxHeight),
    };
  });

  // 调整大小会话引用
  const resizeSessionRef = React.useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    direction: 'both' | 'x' | 'y';
    pointerId: number;
  } | null>(null);

  // 是否正在调整大小
  const [isResizing, setIsResizing] = React.useState(false);

  // 最大宽度和高度（基于视口）
  const maxWidth = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.98) : 1400;
  const maxHeight = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.95) : 900;

  // 自动计算字体大小
  const fontSize = React.useMemo(() => {
    if (!autoFontSize) return undefined;
    const min = minFontSize;
    const max = maxFontSize;
    const t = (size.width - 640) / (1200 - 640);
    const next = min + t * (max - min);
    return clamp(next, min, max);
  }, [autoFontSize, maxFontSize, minFontSize, size.width]);

  // 是否居中显示
  const centered = centeredProp ?? true;

  // 解析表格内边距
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

  // 动态生成模态框样式
  const modalCss = React.useMemo(() => {
    const resolvedPadding = (() => {
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
    })();

    const paddingLeft = resolvedPadding.left + contentShiftX;
    const paddingRight = resolvedPadding.right;
    const paddingTop = resolvedPadding.top;
    const paddingBottom = resolvedPadding.bottom;
    const tablePadding = `${resolvedTablePadding.y}px ${resolvedTablePadding.x}px`;

    return (
      '[data-resizable-modal-root] .ant-modal-content{height:100%;display:flex;flex-direction:column;overflow:hidden;}' +
      '[data-resizable-modal-root] .ant-modal-header,[data-resizable-modal-root] .ant-modal-footer{flex:0 0 auto;}' +
      '[data-resizable-modal-root] .ant-modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:' +
      `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px` +
      '!important;}' +
      '[data-resizable-modal-root] .ant-form-item{margin-bottom:10px;}' +
      '[data-resizable-modal-root] .ant-table{font-size:inherit;}' +
      '[data-resizable-modal-root] .ant-table-cell{line-height:inherit;}' +
      '[data-resizable-modal-root] .ant-table-thead > tr > th,[data-resizable-modal-root] .ant-table-tbody > tr > td{padding:' +
      tablePadding +
      '!important;}' +
      '[data-resizable-modal-root] .ant-table-wrapper .ant-table{margin:0;}' +
      '[data-resizable-modal-root] .ant-table-thead > tr > th{font-weight:600;}'
    );
  }, [contentPadding, contentShiftX, resolvedTablePadding.x, resolvedTablePadding.y]);

  // 应用调整大小
  const applyResize = React.useCallback((clientX: number, clientY: number) => {
    if (!resizeSessionRef.current) return;
    const { startX, startY, startWidth, startHeight, direction } = resizeSessionRef.current;

    const viewportMaxWidth = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.98) : maxWidth;
    const viewportMaxHeight = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.95) : maxHeight;

    const dx = clientX - startX;
    const dy = clientY - startY;
    const safeMinWidth = Math.min(minWidth, viewportMaxWidth);
    const safeMinHeight = Math.min(minHeight, viewportMaxHeight);
    const nextWidth =
      direction === 'x' || direction === 'both' ? clamp(startWidth + dx, safeMinWidth, viewportMaxWidth) : startWidth;
    const nextHeight =
      direction === 'y' || direction === 'both' ? clamp(startHeight + dy, safeMinHeight, viewportMaxHeight) : startHeight;
    setSize({ width: nextWidth, height: nextHeight });
  }, [maxHeight, maxWidth, minHeight, minWidth]);

  // 停止调整大小
  const stopResize = React.useCallback(() => {
    resizeSessionRef.current = null;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // 开始调整大小
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

  // 处理指针移动
  const onHandlePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeSessionRef.current) return;
    if (e.pointerId !== resizeSessionRef.current.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    applyResize(e.clientX, e.clientY);
  }, [applyResize]);

  // 处理指针抬起
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

  // 打开时初始化大小
  React.useEffect(() => {
    if (!open) return;
    const resolved = resolveWidthPx(width);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportMaxWidth = Math.round(viewportWidth * 0.98);
    const viewportMaxHeight = Math.round(viewportHeight * 0.95);
    const safeMinWidth = Math.min(minWidth, viewportMaxWidth);
    const safeMinHeight = Math.min(minHeight, viewportMaxHeight);

    // 根据视口大小动态计算初始尺寸
    const defaultWidthRatio = viewportWidth < 768 ? 0.96 : viewportWidth < 1024 ? 0.7 : 0.6;
    const initWidth = resolved ?? Math.round(viewportWidth * defaultWidthRatio);
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : Math.min(720, viewportHeight * 0.8));

    setSize({
      width: clamp(initWidth, safeMinWidth, viewportMaxWidth),
      height: clamp(initHeight, safeMinHeight, viewportMaxHeight),
    });
  }, [initialHeight, maxHeight, maxWidth, minHeight, minWidth, open, width]);

  // 监听视口变化，自动缩放模态框
  React.useEffect(() => {
    if (!open) return;
    if (!scaleWithViewport) return;
    if (typeof window === 'undefined') return;

    const viewportRef = { w: window.innerWidth, h: window.innerHeight };
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const onResize = () => {
      // 防抖优化性能
      if (resizeTimer) clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        const next = { w: window.innerWidth, h: window.innerHeight };
        const scaleW = viewportRef.w > 0 ? next.w / viewportRef.w : 1;
        const scaleH = viewportRef.h > 0 ? next.h / viewportRef.h : 1;

        // 只在变化超过5%时才缩放，避免微小抖动
        const shouldScale = Math.abs(scaleW - 1) > 0.05 || Math.abs(scaleH - 1) > 0.05;

        if (shouldScale) {
          viewportRef.w = next.w;
          viewportRef.h = next.h;

          setSize((prev) => {
            const viewportMaxWidth = Math.round(next.w * 0.98);
            const viewportMaxHeight = Math.round(next.h * 0.95);
            const safeMinWidth = Math.min(minWidth, viewportMaxWidth);
            const safeMinHeight = Math.min(minHeight, viewportMaxHeight);

            // 智能缩放：保持弹窗占视口的相对比例
            const newWidth = clamp(prev.width * scaleW, safeMinWidth, viewportMaxWidth);
            const newHeight = clamp(prev.height * scaleH, safeMinHeight, viewportMaxHeight);

            return {
              width: Math.round(newWidth),
              height: Math.round(newHeight),
            };
          });
        }
      }, 150); // 150ms防抖
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [maxHeight, maxWidth, minHeight, minWidth, open, scaleWithViewport]);

  // 组件卸载时清理
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
            {/* 调整大小手柄 */}
            <div
              onPointerDown={startResize('both')}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
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
            {/* 调整大小提示 */}
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
