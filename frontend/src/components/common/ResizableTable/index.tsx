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
  clamp,
  parseWidthPx,
  isLeafColumn,
  getColumnId,
  readArrayStorage,
  writeArrayStorage,
  uniqueStrings,
} from './utils';

type ResizableTableProps<T extends object> = TableProps<T> & {
  storageKey?: string;
  resizableColumns?: boolean;
  autoFixedColumns?: boolean;
  allowFixedColumns?: boolean;
  reorderableColumns?: boolean;
  stickyFooter?: boolean;
  stickyHeader?: boolean | { offsetHeader?: number };
  minColumnWidth?: number;
  maxColumnWidth?: number;
  defaultColumnWidth?: number;
  autoScrollY?: boolean;
};

const SortableHeaderCell: React.FC<any> = (props) => {
  const {
    width: colWidth,
    onResize,
    resizable: canResize,
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

  const resizeRef = React.useRef<{
    active: boolean;
    startX: number;
    startWidth: number;
  }>({ active: false, startX: 0, startWidth: 0 });

  const handleResizePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (!canResize || typeof colWidth !== 'number') return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { active: true, startX: e.clientX, startWidth: colWidth };
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }, [canResize, colWidth]);

  const handleResizePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.clientX - resizeRef.current.startX;
    const newWidth = Math.max(60, Math.min(800, resizeRef.current.startWidth + delta));
    onResize?.(newWidth);
  }, [onResize]);

  const handleResizePointerUp = React.useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current.active = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  const transformStyle: React.CSSProperties = transform
    ? {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 100 : undefined,
      }
    : {};

  return (
    <th
      ref={setNodeRef}
      className={className}
      style={{ ...style, ...transformStyle, position: 'relative' }}
      {...attributes}
      {...listeners}
      {...restProps}
    >
      {children}
      {canResize && typeof colWidth === 'number' && (
        <div
          className="resizable-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
        />
      )}
    </th>
  );
};

const ResizableHeaderCell: React.FC<any> = (props) => {
  const {
    width: colWidth,
    onResize,
    resizable: canResize,
    children,
    className,
    style,
    ...restProps
  } = props;

  const resizeRef = React.useRef<{
    active: boolean;
    startX: number;
    startWidth: number;
  }>({ active: false, startX: 0, startWidth: 0 });

  const handleResizePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (!canResize || typeof colWidth !== 'number') return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { active: true, startX: e.clientX, startWidth: colWidth };
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }, [canResize, colWidth]);

  const handleResizePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.clientX - resizeRef.current.startX;
    const newWidth = Math.max(60, Math.min(800, resizeRef.current.startWidth + delta));
    onResize?.(newWidth);
  }, [onResize]);

  const handleResizePointerUp = React.useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current.active = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  return (
    <th
      className={className}
      style={{ ...style, position: 'relative' }}
      {...restProps}
    >
      {children}
      {canResize && typeof colWidth === 'number' && (
        <div
          className="resizable-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
        />
      )}
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
    resizableColumns = true,
    autoFixedColumns: _autoFixedColumns = true,
    allowFixedColumns = true,
    reorderableColumns = true,
    stickyFooter: stickyFooterProp,
    stickyHeader: stickyHeaderProp,
    minColumnWidth = 60,
    maxColumnWidth = 800,
    defaultColumnWidth = 120,
    autoScrollY = true,
    className,
    rowKey,
    ...rest
  } = props;

  const actionColumnWidth = 72;

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

  const mergedClassName = React.useMemo(() => {
    const next = [className, resizableColumns ? 'resizable-table' : ''].filter(Boolean).join(' ');
    return next || undefined;
  }, [className, resizableColumns]);

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

  const widthStorageKey = React.useMemo(() => {
    if (!resolvedStorageKey) return null;
    return `${resolvedStorageKey}:widths`;
  }, [resolvedStorageKey]);

  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
    if (typeof window === 'undefined' || !widthStorageKey) return {};
    try {
      const raw = localStorage.getItem(widthStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  React.useEffect(() => {
    if (!widthStorageKey) return;
    try {
      localStorage.setItem(widthStorageKey, JSON.stringify(columnWidths));
    } catch {}
  }, [columnWidths, widthStorageKey]);

  const handleColumnResize = React.useCallback((colId: string, newWidth: number) => {
    const clamped = Math.max(minColumnWidth, Math.min(maxColumnWidth, Math.round(newWidth)));
    setColumnWidths(prev => {
      if (prev[colId] === clamped) return prev;
      return { ...prev, [colId]: clamped };
    });
  }, [minColumnWidth, maxColumnWidth]);

  const preparedColumns = React.useMemo(() => {
    if (!columns) return columns;
    const rawCols = (Array.isArray(columns) ? columns : []) as any[];

    const getSmartDefaultWidth = (colRecord: any) => {
      const titleText = typeof colRecord.title === 'string' ? colRecord.title : '';
      const keyText = colRecord.key == null ? '' : String(colRecord.key);
      const dataIndexText = Array.isArray(colRecord.dataIndex)
        ? colRecord.dataIndex.join('.')
        : colRecord.dataIndex == null ? '' : String(colRecord.dataIndex);

      const title = titleText.trim().toLowerCase();
      const key = keyText.toLowerCase();
      const dataIdx = dataIndexText.toLowerCase();

      const narrowKeywords = ['数量', '件数', '码数', '尺码', '码', 'size', 'qty', 'quantity', 'num', 'count', '序号', 'no', 'id'];
      if (narrowKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
        return 40;
      }
      const mediumKeywords = ['颜色', '状态', '类型', '仓库', '单位', 'color', 'status', 'type', 'warehouse', 'unit', 'tag'];
      if (mediumKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
        return 60;
      }
      const wideKeywords = ['订单', '款号', '款名', '名称', '编号', 'order', 'style', 'name', 'code', 'no', 'qr', '菲号'];
      if (wideKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
        return 100;
      }
      const extraWideKeywords = ['备注', '描述', '说明', 'remark', 'desc', 'description', 'note'];
      if (extraWideKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
        return 150;
      }
      return defaultColumnWidth;
    };

    const mapColumns = (cols: any[]): any[] => {
      return cols.map((col) => {
        const colRecord = col as any;
        const isLeaf = isLeafColumn(col);

        if (!isLeaf) {
          const children = Array.isArray(colRecord.children) ? colRecord.children : [];
          return { ...colRecord, children: mapColumns(children) };
        }

        const colId = getColumnId(colRecord, [rawCols.indexOf(colRecord)]);

        const titleText = typeof colRecord.title === 'string' ? colRecord.title : '';
        const keyText = colRecord.key == null ? '' : String(colRecord.key);
        const dataIndexText = Array.isArray(colRecord.dataIndex)
          ? colRecord.dataIndex.join('.')
          : colRecord.dataIndex == null ? '' : String(colRecord.dataIndex);

        const maybeAction =
          ['action', 'actions', 'operation', 'operate', 'op'].includes(keyText.toLowerCase()) ||
          ['action', 'actions', 'operation', 'operate', 'op'].includes(dataIndexText.toLowerCase()) ||
          ['操作', '操作列', '操作区', '操作按钮'].includes(titleText.trim());

        const explicitWidth = parseWidthPx(colRecord.width);
        const persistedWidth = columnWidths[colId];
        const smartDefaultWidth = getSmartDefaultWidth(colRecord);
        const isResizable = resizableColumns && !maybeAction;
        const baseWidth = (isResizable ? persistedWidth : undefined)
          ?? explicitWidth
          ?? (maybeAction ? actionColumnWidth : smartDefaultWidth);
        const clampedWidth = typeof baseWidth === 'number'
          ? clamp(baseWidth, minColumnWidth, maxColumnWidth)
          : clamp(smartDefaultWidth, minColumnWidth, maxColumnWidth);

        const fixed = allowFixedColumns ? (maybeAction ? 'right' : undefined) : undefined;

        const { resizable: _stripResizable, ...safeColRecord } = colRecord;

        return {
          ...safeColRecord,
          width: clampedWidth,
          colId,
          _resizable: isResizable,
          fixed,
        };
      });
    };

    return mapColumns(rawCols);
  }, [columns, resizableColumns, allowFixedColumns, minColumnWidth, maxColumnWidth, defaultColumnWidth, columnWidths]);

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

    return ordered;
  }, [preparedColumns, columnOrder]);

  const finalColumns = React.useMemo(() => {
    if (!orderedColumns) return orderedColumns;
    return (orderedColumns as any[]).map((col: any) => {
      const { colId, _resizable, ...cleanCol } = col;
      const originalOnHeaderCell = cleanCol.onHeaderCell;
      return {
        ...cleanCol,
        onHeaderCell: (column: any) => {
          const originalProps = typeof originalOnHeaderCell === 'function'
            ? originalOnHeaderCell(column)
            : {};
          return {
            ...originalProps,
            width: column.width,
            resizable: _resizable,
            'data-col-id': colId,
            onResize: _resizable
              ? (newWidth: number) => handleColumnResize(colId, newWidth)
              : undefined,
          };
        },
      };
    });
  }, [orderedColumns, handleColumnResize]);

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

  const mergedScroll = React.useMemo(() => {
    const baseScroll = typeof scroll === 'object' && scroll !== null ? (scroll as any) : {};
    const defaultY = 'max(300px, calc(100vh - 330px))';

    if (!autoScrollY) {
      if (!scroll) return { x: 'max-content' as const };
      const nextScroll = { ...baseScroll };
      if (!('x' in nextScroll)) {
        nextScroll.x = 'max-content';
      }
      return nextScroll;
    }

    if (!scroll) return { x: 'max-content' as const, y: defaultY };
    return {
      ...baseScroll,
      x: baseScroll.x ?? 'max-content',
      y: baseScroll.y ?? defaultY,
    };
  }, [autoScrollY, scroll]);

  const mergedComponents = React.useMemo(() => {
    const baseComponents = typeof components === 'object' && components !== null ? (components as any) : {};
    const cellComponent = reorderableColumns ? SortableHeaderCell : ResizableHeaderCell;

    return {
      ...baseComponents,
      header: {
        ...(typeof baseComponents.header === 'object' && baseComponents.header !== null
          ? baseComponents.header
          : {}),
        cell: cellComponent,
      },
    } as any;
  }, [components, reorderableColumns]);

  const wrapperClassName = React.useMemo(() => {
    const next = ['resizable-table-shell', className, stickyFooter ? 'resizable-table-shell-sticky-footer' : '']
      .filter(Boolean)
      .join(' ');
    return next;
  }, [className, stickyFooter]);

  const tableContent = (
    <div className={wrapperClassName}>
      <ConfigProvider getPopupContainer={getTablePopupContainer}>
        <Table
          {...rest}
          rowKey={rowKey}
          className={mergedClassName}
          columns={finalColumns as TableProps<T>['columns']}
          components={mergedComponents}
          scroll={mergedScroll as TableProps<T>['scroll']}
          tableLayout={tableLayout || undefined}
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
