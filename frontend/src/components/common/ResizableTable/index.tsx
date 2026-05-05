import React from 'react';
import { Table, ConfigProvider } from 'antd';
import type { TableProps } from 'antd';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DEFAULT_PAGE_SIZE,
  buildPageSizeStorageKey,
  normalizePageSize,
  readPageSize,
  readPageSizeByKey,
  savePageSize,
  savePageSizeByKey,
} from '@/utils/pageSizeStore';
import {
  normalizePageSizeOptions,
  hashString,
  buildColumnsSignature,
  isLeafColumn,
  getColumnId,
  readArrayStorage,
  writeArrayStorage,
  uniqueStrings,
  computeAdaptiveWidth,
} from './utils';

type ResizableTableProps<T extends object> = TableProps<T> & {
  storageKey?: string;
  /** @deprecated 无操作，保留仅兼容旧调用 */
  resizableColumns?: boolean;
  /** @deprecated 无操作，保留仅兼容旧调用 */
  autoScrollY?: boolean;
  allowFixedColumns?: boolean;
  reorderableColumns?: boolean;
  stickyFooter?: boolean;
  stickyHeader?: boolean | { offsetHeader?: number };
  /** 是否自动根据屏幕宽度切换表格 size（默认 true） */
  responsiveSize?: boolean;
};

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

const ResizableTable = <T extends object>(props: ResizableTableProps<T>) => {
  const {
    columns,
    components,
    scroll,
    tableLayout,
    pagination: paginationProp,
    storageKey: storageKeyProp,
    allowFixedColumns = true,
    reorderableColumns = true,
    stickyFooter: stickyFooterProp,
    stickyHeader: stickyHeaderProp,
    responsiveSize = true,
    className,
    rowKey,
    size: sizeProp,
    ...rest
  } = props;

  const shellRef = React.useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = React.useState(false);

  const checkScrollable = React.useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const tableBody = shell.querySelector('.ant-table-body') as HTMLElement | null;
    if (!tableBody) return;
    setIsScrollable(tableBody.scrollWidth > tableBody.clientWidth + 2);
  }, []);

  const responsiveTableSize = React.useMemo(() => {
    if (!responsiveSize || sizeProp) return sizeProp;
    if (typeof window === 'undefined') return undefined;
    return window.innerWidth < 768 ? 'small' : undefined;
  }, [responsiveSize, sizeProp]);

  const resolvedStorageKey = React.useMemo(() => {
    if (storageKeyProp) return storageKeyProp;
    if (typeof window === 'undefined') return undefined;
    const pathname = window.location?.pathname || 'unknown';
    const rowKeyText = typeof rowKey === 'string' ? rowKey : '';
    const colsSig = hashString(buildColumnsSignature(columns));
    return `resizableTable:${pathname}:${rowKeyText}:${colsSig}`;
  }, [columns, rowKey, storageKeyProp]);

  const stickyFooter = stickyFooterProp ?? false;
  const pageSizeStorageKey = React.useMemo(() => (
    resolvedStorageKey ? buildPageSizeStorageKey(resolvedStorageKey) : undefined
  ), [resolvedStorageKey]);

  const mergedPagination = React.useMemo(() => {
    if (paginationProp === false) return false;
    if (paginationProp === undefined || paginationProp === null) return paginationProp;
    const base = typeof paginationProp === 'object' ? paginationProp : ({} as any);
    const { position, placement, ...baseRest } = base as any;
    const explicitDefaultPageSize = typeof base?.defaultPageSize === 'number'
      ? normalizePageSize(base.defaultPageSize, DEFAULT_PAGE_SIZE)
      : undefined;
    const persistedPageSize = pageSizeStorageKey
      ? readPageSizeByKey(pageSizeStorageKey, explicitDefaultPageSize ?? DEFAULT_PAGE_SIZE)
      : readPageSize(explicitDefaultPageSize ?? DEFAULT_PAGE_SIZE);
    const normalizedPageSize = typeof base?.pageSize === 'number'
      ? normalizePageSize(base.pageSize, DEFAULT_PAGE_SIZE)
      : undefined;
    const normalizedDefaultPageSize = normalizedPageSize === undefined
      ? persistedPageSize
      : explicitDefaultPageSize;

    const originalOnChange = base?.onChange;
    const trackedPageSize = normalizedPageSize ?? normalizedDefaultPageSize;
    const interceptedOnChange = (page: number, pageSize: number) => {
      const nextPageSize = normalizePageSize(pageSize, DEFAULT_PAGE_SIZE);
      if (trackedPageSize === undefined || nextPageSize !== trackedPageSize) {
        if (pageSizeStorageKey) {
          savePageSizeByKey(pageSizeStorageKey, nextPageSize);
        } else {
          savePageSize(nextPageSize);
        }
      }
      originalOnChange?.(page, nextPageSize);
    };

    return {
      ...baseRest,
      pageSize: normalizedPageSize,
      defaultPageSize: normalizedDefaultPageSize,
      pageSizeOptions: normalizePageSizeOptions(base?.pageSizeOptions, normalizedPageSize, normalizedDefaultPageSize),
      onChange: interceptedOnChange,
      simple: base?.simple ?? false,
      showSizeChanger: base?.showSizeChanger ?? true,
      placement: placement ?? position ?? ['bottomRight'],
    } as any;
  }, [pageSizeStorageKey, paginationProp]);

  const orderStorageKey = React.useMemo(() => {
    if (!resolvedStorageKey) return null;
    return `${resolvedStorageKey}:order`;
  }, [resolvedStorageKey]);

  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    if (!orderStorageKey) return [];
    return readArrayStorage(orderStorageKey) || [];
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!orderStorageKey) {
      setColumnOrder([]);
      return;
    }
    const nextOrder = readArrayStorage(`${orderStorageKey}`) || [];
    setColumnOrder(nextOrder);
  }, [orderStorageKey]);

  React.useEffect(() => {
    if (!orderStorageKey) return;
    writeArrayStorage(orderStorageKey, uniqueStrings(columnOrder));
  }, [columnOrder, orderStorageKey]);

  const preparedColumns = React.useMemo(() => {
    if (!columns) return columns;
    const rawCols = (Array.isArray(columns) ? columns : []) as any[];

    const mapColumns = (cols: any[]): any[] => {
      return cols.map((col) => {
        const colRecord = col as any;
        const isLeaf = isLeafColumn(col);

        if (!isLeaf) {
          const children = Array.isArray(colRecord.children) ? colRecord.children : [];
          return { ...colRecord, children: mapColumns(children) };
        }

        const colId = getColumnId(colRecord, [rawCols.indexOf(colRecord)]);

        const keyText = colRecord.key == null ? '' : String(colRecord.key);
        const dataIndexText = Array.isArray(colRecord.dataIndex)
          ? colRecord.dataIndex.join('.')
          : colRecord.dataIndex == null ? '' : String(colRecord.dataIndex);

        const maybeAction =
          ['action', 'actions', 'operation', 'operate', 'op'].includes(keyText.toLowerCase()) ||
          ['action', 'actions', 'operation', 'operate', 'op'].includes(dataIndexText.toLowerCase()) ||
          ['操作', '操作列', '操作区', '操作按钮'].includes(String(colRecord.title || '').trim());

        const { resizable: _stripResizable, ...safeColRecord } = colRecord;

        const adaptive = computeAdaptiveWidth(colRecord);

        return {
          ...safeColRecord,
          colId,
          ...(adaptive.width != null ? { width: adaptive.width } : {}),
          fixed: allowFixedColumns ? (maybeAction ? 'right' : colRecord.fixed) : undefined,
        };
      });
    };

    return mapColumns(rawCols);
  }, [columns, allowFixedColumns]);

  const orderedColumns = React.useMemo(() => {
    if (!preparedColumns || columnOrder.length === 0) return preparedColumns;
    const rawCols = preparedColumns as any[];
    const topLevelLeaf = rawCols.every((c) => isLeafColumn(c));
    if (!topLevelLeaf) return preparedColumns;

    const topLevelIds = rawCols.map((col, idx) => getColumnId(col, [idx]));
    const map = new Map<string, any>();
    for (let i = 0; i < rawCols.length; i++) {
      map.set(topLevelIds[i], rawCols[i]);
    }

    const ordered: any[] = [];
    for (const id of columnOrder) {
      const hit = map.get(id);
      if (!hit) continue;
      ordered.push(hit);
      map.delete(id);
    }
    for (let i = 0; i < rawCols.length; i++) {
      const id = topLevelIds[i];
      const hit = map.get(id);
      if (!hit) continue;
      ordered.push(hit);
      map.delete(id);
    }

    // ✅ 修正：无论 localStorage 存储的顺序如何（可能因 DnD 拖拽把 fixed 列移到了中间），
    // 始终保证 fixed:'left' 在最左，fixed:'right' 在最右，各组内保持相对顺序不变。
    // 这可修复用户拖拽 fixed 列到中间后，fixed 列 header 出现空白占位的问题。
    const fixedLeft = ordered.filter((c: any) => c.fixed === 'left');
    const fixedRight = ordered.filter((c: any) => c.fixed === 'right');
    const nonFixed = ordered.filter((c: any) => c.fixed !== 'left' && c.fixed !== 'right');
    return [...fixedLeft, ...nonFixed, ...fixedRight];
  }, [preparedColumns, columnOrder]);

  const finalColumns = React.useMemo(() => {
    if (!orderedColumns) return orderedColumns;
    return (orderedColumns as any[]).map((col: any) => {
      const { colId, ...cleanCol } = col;
      const originalOnHeaderCell = cleanCol.onHeaderCell;
      return {
        ...cleanCol,
        onHeaderCell: (column: any) => {
          const originalProps = typeof originalOnHeaderCell === 'function'
            ? originalOnHeaderCell(column)
            : {};
          return {
            ...originalProps,
            'data-col-id': colId,
          };
        },
      };
    });
  }, [orderedColumns]);

  React.useEffect(() => {
    checkScrollable();
    const shell = shellRef.current;
    if (!shell) return;
    const tableBody = shell.querySelector('.ant-table-body') as HTMLElement | null;
    if (!tableBody) return;

    const ro = new ResizeObserver(() => { checkScrollable(); });
    ro.observe(tableBody);
    tableBody.addEventListener('scroll', checkScrollable, { passive: true });
    return () => {
      ro.disconnect();
      tableBody.removeEventListener('scroll', checkScrollable);
    };
  }, [checkScrollable, finalColumns]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const sortableColumnIds = React.useMemo(() => {
    if (!finalColumns || !reorderableColumns) return [];
    return (finalColumns as any[]).map((col, idx) => {
      const colId = (orderedColumns as any[])?.[idx]?.colId || getColumnId(col, [idx]);
      return colId;
    });
  }, [finalColumns, reorderableColumns, orderedColumns]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = (orderedColumns as any[]).map((col: any) => col.colId);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextOrder = arrayMove(currentIds, oldIndex, newIndex);
    setColumnOrder(uniqueStrings(nextOrder));
  };

  const getTablePopupContainer = React.useCallback((triggerNode?: HTMLElement) => {
    if (triggerNode) {
      const modal = triggerNode.closest?.('.ant-modal-body') as HTMLElement | null;
      if (modal) return modal;
    }
    return document.body;
  }, []);

  // 检测 finalColumns 中是否存在 fixed:'left' 或 fixed:'right' 的列。
  // allowFixedColumns=true（默认）时，操作列（key/dataIndex 包含 'action/actions/操作' 等）
  // 会被自动设为 fixed:'right'。若存在固定列却没有 scroll，antd 会出现表头/体错位问题。
  // 因此：只要有固定列，且调用方未显式传 scroll，就自动兜底 { x: 'max-content' }。
  const hasFixedColumn = React.useMemo(() => {
    if (!finalColumns) return false;
    return (finalColumns as any[]).some(
      (col: any) => col.fixed === 'left' || col.fixed === 'right',
    );
  }, [finalColumns]);

  const mergedScroll = React.useMemo(() => {
    if (!scroll) return hasFixedColumn ? { x: 'max-content' } : undefined;
    return typeof scroll === 'object' ? scroll : undefined;
  }, [scroll, hasFixedColumn]);

  const mergedComponents = React.useMemo(() => {
    const baseComponents = typeof components === 'object' && components !== null ? (components as any) : {};

    if (!reorderableColumns) return baseComponents;

    return {
      ...baseComponents,
      header: {
        ...(typeof baseComponents.header === 'object' && baseComponents.header !== null
          ? baseComponents.header
          : {}),
        cell: SortableHeaderCell,
      },
    } as any;
  }, [components, reorderableColumns]);

  const wrapperClassName = React.useMemo(() => {
    const next = [
      'resizable-table-shell',
      isScrollable ? 'resizable-table-shell--scrollable' : '',
      className,
      stickyFooter ? 'resizable-table-shell-sticky-footer' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return next;
  }, [className, stickyFooter, isScrollable]);

  const tableContent = (
    <div className={wrapperClassName} ref={shellRef}>
      <ConfigProvider getPopupContainer={getTablePopupContainer}>
        <Table
          {...rest}
          rowKey={rowKey}
          className={`${className || ''} resizable-table` || 'resizable-table'}
          columns={finalColumns as TableProps<T>['columns']}
          components={mergedComponents}
          scroll={mergedScroll as TableProps<T>['scroll']}
          tableLayout={tableLayout || 'fixed'}
          size={responsiveTableSize}
          style={{ wordBreak: 'break-all' }}
          pagination={mergedPagination as TableProps<T>['pagination']}
          sticky={stickyHeaderProp === true ? { offsetHeader: 0 } : (stickyHeaderProp || undefined)}
        />
      </ConfigProvider>
    </div>
  );

  if (reorderableColumns && sortableColumnIds.length > 0) {
    return (
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
          {tableContent}
        </SortableContext>
      </DndContext>
    );
  }

  return tableContent;
};

const ResizableTableWithSummary = Object.assign(ResizableTable, {
  Summary: Table.Summary,
});

export default ResizableTableWithSummary;
