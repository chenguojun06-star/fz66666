import React from 'react';
import { clamp } from './utils';

type HeaderCellProps = any & {
  resizableColumns: boolean;
  minColumnWidth: number;
  maxColumnWidth: number;
};

/**
 * 可调整列宽的表头单元格组件
 */
const ResizableHeaderCell: React.FC<HeaderCellProps> = (cellProps) => {
  const {
    width,
    onResize,
    resizable,
    children,
    style,
    resizableColumns,
    minColumnWidth,
    maxColumnWidth,
    ...restCellProps
  } = cellProps;

  const canResize =
    resizableColumns &&
    resizable !== false &&
    typeof onResize === 'function' &&
    typeof width === 'number';

  const dragRef = React.useRef({
    dragging: false,
    startX: 0,
    startWidth: typeof width === 'number' ? width : 0,
    rafId: null as number | null,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canResize) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startWidth = typeof width === 'number' ? width : 0;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 忽略错误
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    if (!canResize) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current.rafId !== null) {
      cancelAnimationFrame(dragRef.current.rafId);
    }
    const clientX = e.clientX;
    const startX = dragRef.current.startX;
    const startWidth = dragRef.current.startWidth;
    dragRef.current.rafId = requestAnimationFrame(() => {
      const delta = clientX - startX;
      const next = clamp(startWidth + delta, minColumnWidth, maxColumnWidth);
      (onResize as (w: number) => void)(next);
      dragRef.current.rafId = null;
    });
  };

  const stopDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current.rafId !== null) {
      cancelAnimationFrame(dragRef.current.rafId);
      dragRef.current.rafId = null;
    }
    dragRef.current.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 忽略错误
    }
  };

  if (!canResize) {
    return (
      <th {...restCellProps} style={style}>
        {children}
      </th>
    );
  }

  return (
    <th
      {...restCellProps}
      style={{
        ...style,
        position: 'relative',
        paddingRight: 18,
        boxSizing: 'border-box',
      }}
    >
      <div
        className="resizable-table-header-content"
        style={{
          overflow: 'visible',
          textOverflow: 'clip',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          touchAction: 'none',
          userSelect: 'none',
          background: 'transparent',
          zIndex: 2,
        }}
      />
    </th>
  );
};

export default ResizableHeaderCell;
