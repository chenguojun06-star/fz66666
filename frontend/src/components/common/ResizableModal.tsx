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

export const useResizableModalTableScrollY = <T extends HTMLElement>(args: {
  open: boolean;
  ref: React.RefObject<T | null>;
  offset?: number;
  minY?: number;
  defaultY?: number;
  watch?: unknown[];
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
  contentPadding?: ContentPadding;
  /** 允许传入额外的自定义属性 */
  [key: string]: any;
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
  contentPadding,
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

  // 是否居中显示
  const centered = centeredProp ?? true;

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

    return (
      '[data-resizable-modal-root] .ant-modal-content{height:100%;display:flex;flex-direction:column;overflow:hidden;}' +
      '[data-resizable-modal-root] .ant-modal-header,[data-resizable-modal-root] .ant-modal-footer{flex:0 0 auto;}' +
      '[data-resizable-modal-root] .ant-modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:' +
      `${resolvedPadding.top}px ${resolvedPadding.right}px ${resolvedPadding.bottom}px ${resolvedPadding.left}px` +
      '!important;}' +
      '[data-resizable-modal-root] .ant-form-item{margin-bottom:10px;}'
    );
  }, [contentPadding]);

  const rafIdRef = React.useRef<number | null>(null);

  // 停止调整大小
  const stopResize = React.useCallback(() => {
    // 清理待处理的动画帧
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    resizeSessionRef.current = null;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

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

  // 组件卸载时清理
  React.useEffect(() => {
    return () => {
      try {
        stopResize();
      } catch {
    // Intentionally empty
      // 忽略错误
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
              lineHeight: 1.4,
            }}
          >
            <style>{modalCss}</style>
            {React.cloneElement(element, {
              style: {
                ...element.props.style,
                width: size.width,
                height: size.height,
                lineHeight: 1.4,
              },
            })}

            {/* 调整大小提示 */}
            {isResizing ? (
              <div
                style={{
                  position: 'absolute',
                  right: 40,
                  bottom: 10,
                  padding: '2px 8px',
                  fontSize: 'var(--font-size-sm)',
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
