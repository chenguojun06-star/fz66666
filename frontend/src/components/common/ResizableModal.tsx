import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

/**
 * LightSense 光感类型
 * 不同类型对应不同颜色的光晕效果
 */
export type LightSenseType = 'default' | 'urgent' | 'success' | 'warning' | 'info';

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

const COMPACT_MODAL_BASE_WIDTH = 880;
const MEDIUM_MODAL_BASE_WIDTH = 1040;

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
  const rafIdRef = React.useRef<number | null>(null);
  const computedRef = React.useRef<number>(defaultY);

  React.useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;

    const compute = (entryHeight?: number) => {
      const h = Math.floor(entryHeight ?? (el.getBoundingClientRect().height || 0));
      const y = Math.max(minY, h - offset);
      if (computedRef.current === y) return;
      computedRef.current = y;
      setScrollY(y);
    };

    const onWindowResize = () => compute();

    compute();

    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') return;
      window.addEventListener('resize', onWindowResize);
      return () => window.removeEventListener('resize', onWindowResize);
    }

    const ro = new ResizeObserver((entries) => {
      if (rafIdRef.current !== null) return;
      const entry = entries[0];
      const entryHeight = entry?.contentRect?.height
        ?? entry?.borderBoxSize?.[0]?.blockSize
        ?? el.getBoundingClientRect().height;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        compute(entryHeight);
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  if (vwMatch) {
    const vw = Number(vwMatch[1]);
    // 55vw 以下 → 880px 基线；70vw 以下 → 1040px 基线；更大按视口百分比
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
  /** LightSense 光感效果类型，启用后弹窗获得鸿蒙7风格的光晕+模糊遮罩+入场动画 */
  lightSense?: LightSenseType;
  /** 是否启用遮罩模糊效果（backdrop-filter），默认关闭以节省性能 */
  blurMask?: boolean;
  /** 允许传入额外的自定义属性 */
  [key: string]: any;
};

export const COMPACT_MODAL_MIN_WIDTH = 560;

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
  minWidth = 560,
  minHeight = 360,
  initialHeight,
  centered: centeredProp,
  contentPadding,
  footer,
  title,
  destroyOnHidden,
  forceRender,
  lightSense = 'default',
  blurMask = false,
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
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : Math.round(viewportHeight * 0.82));
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

  // 根据弹窗宽度计算响应式字体大小
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
  }, [contentPadding, responsiveFontSize]);

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
    const initHeight = Math.round(typeof initialHeight === 'number' ? initialHeight : Math.round(viewportHeight * 0.82));

    setSize({
      width: clamp(initWidth, safeMinWidth, viewportMaxWidth),
      height: clamp(initHeight, safeMinHeight, viewportMaxHeight),
    });
  }, [initialHeight, maxHeight, maxWidth, minHeight, minWidth, open, width]);

  // 窗口大小变化时自动调整弹窗大小
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
        // 如果尺寸没有变化，返回原对象避免不必要的渲染
        if (newWidth === prev.width && newHeight === prev.height) {
          return prev;
        }
        return { width: newWidth, height: newHeight };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [minWidth, minHeight, open]);

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

  // LightSense 光感颜色映射
  const glowColorMap: Record<LightSenseType, string> = {
    default: '59, 130, 246',
    urgent: '239, 68, 68',
    success: '34, 197, 94',
    warning: '245, 158, 11',
    info: '139, 92, 246',
  };

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
      transitionName="light-sense-fade"
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
          boxShadow: `0 20px 60px rgba(${glowColorMap[lightSense]}, 0.18), 0 4px 16px rgba(0, 0, 0, 0.06)`,
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
