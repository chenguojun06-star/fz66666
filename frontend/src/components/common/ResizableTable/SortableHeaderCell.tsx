import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableHeaderCell: React.FC<any> = (props) => {
  const {
    'data-col-id': colId,
    children,
    className,
    style,
    ...restProps
  } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: colId || '' });

  const transformStyle: React.CSSProperties = transform
    ? {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        // 拖拽中需要 position:relative 才能正确渲染 transform，非拖拽状态不覆盖
        // 不拖拽时不可覆盖 position，否则 fixed 列 header 的 position:sticky 会失效
        position: 'relative',
        zIndex: isDragging ? 100 : undefined,
      }
    : {};

  return (
    <th
      ref={setNodeRef}
      className={className}
      style={{ ...style, ...transformStyle }}
      {...attributes}
      {...listeners}
      {...restProps}
    >
      {children}
    </th>
  );
};

export default SortableHeaderCell;
