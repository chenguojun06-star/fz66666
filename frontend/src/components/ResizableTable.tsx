import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

type AnyRecord = Record<string, any>;

type ResizableTableProps<T extends AnyRecord> = TableProps<T> & {
  storageKey?: string;
  resizableColumns?: boolean;
  autoFixedColumns?: boolean;
  allowFixedColumns?: boolean;
  reorderableColumns?: boolean;
  stickyFooter?: boolean;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  defaultColumnWidth?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const parseWidthPx = (width: any): number | undefined => {
  if (typeof width === 'number') return width;
  if (typeof width !== 'string') return undefined;
  const raw = width.trim();
  const pxMatch = raw.match(/^([0-9.]+)px$/i);
  if (pxMatch) return Number(pxMatch[1]);
  const plain = Number(raw);
  if (Number.isFinite(plain)) return plain;
  return undefined;
};

const isLeafColumn = (col: any) => !col?.children || (Array.isArray(col.children) && col.children.length === 0);

const getColumnId = (col: any, indexPath: number[]) => {
  const key = col?.key ?? col?.dataIndex;
  if (Array.isArray(key)) return key.join('.') || indexPath.join('.');
  if (typeof key === 'string' || typeof key === 'number') return String(key);
  return indexPath.join('.');
};

const readStorage = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, number>;
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: Record<string, number>) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
};

const readArrayStorage = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x) => typeof x === 'string') as string[];
  } catch {
    return null;
  }
};

const writeArrayStorage = (key: string, value: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
};

const uniqueStrings = (list: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
};

type HeaderCellProps = any & {
  resizableColumns: boolean;
  minColumnWidth: number;
  maxColumnWidth: number;
};

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
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    if (!canResize) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.clientX - dragRef.current.startX;
    const base = dragRef.current.startWidth;
    const next = clamp(base + delta, minColumnWidth, maxColumnWidth);
    (onResize as (w: number) => void)(next);
  };

  const stopDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
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
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
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

const ResizableTable = <T extends AnyRecord>(props: ResizableTableProps<T>) => {
  const {
    columns,
    components,
    scroll,
    tableLayout,
    storageKey,
    resizableColumns = true,
    autoFixedColumns = true,
    allowFixedColumns = true,
    reorderableColumns = true,
    stickyFooter: stickyFooterProp,
    minColumnWidth = 60,
    maxColumnWidth = 800,
    defaultColumnWidth = 120,
    className,
    ...rest
  } = props;

  const hasPagination = rest.pagination !== false && rest.pagination !== undefined && rest.pagination !== null;
  const stickyFooter = stickyFooterProp ?? hasPagination;

  const mergedClassName = React.useMemo(() => {
    const next = [className, resizableColumns ? 'resizable-table' : ''].filter(Boolean).join(' ');
    return next || undefined;
  }, [className, resizableColumns]);

  const [widths, setWidths] = React.useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    if (!storageKey) return {};
    return readStorage(storageKey) || {};
  });

  const orderStorageKey = React.useMemo(() => {
    if (!storageKey) return null;
    return `${storageKey}:order`;
  }, [storageKey]);

  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    if (!orderStorageKey) return [];
    return readArrayStorage(orderStorageKey) || [];
  });

  const draggingIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!storageKey) return;
    writeStorage(storageKey, widths);
  }, [storageKey, widths]);

  React.useEffect(() => {
    if (!orderStorageKey) return;
    writeArrayStorage(orderStorageKey, uniqueStrings(columnOrder));
  }, [columnOrder, orderStorageKey]);

  const mergedScroll = React.useMemo(() => {
    if (!resizableColumns) return scroll;
    if (!scroll) return { x: 'max-content' as const };
    if ((scroll as any).x) return scroll;
    return { ...(scroll as any), x: 'max-content' as const };
  }, [resizableColumns, scroll]);

  const mergedComponents = React.useMemo(() => {
    if (!resizableColumns) return components;
    return {
      ...components,
      header: {
        ...(components as any)?.header,
        cell: (cellProps: any) => (
          <ResizableHeaderCell
            {...cellProps}
            resizableColumns={resizableColumns}
            minColumnWidth={minColumnWidth}
            maxColumnWidth={maxColumnWidth}
          />
        ),
      },
    } as any;
  }, [components, maxColumnWidth, minColumnWidth, resizableColumns]);

  const mergedColumns = React.useMemo(() => {
    if (!columns) return columns;

    const rawCols = columns as any[];
    const topLevelLeaf = rawCols.every((c) => isLeafColumn(c));
    const topLevelIds = rawCols.map((col, idx) => getColumnId(col, [idx]));
    const applyOrder = (cols: any[]) => {
      if (!reorderableColumns) return cols;
      if (!topLevelLeaf) return cols;
      const map = new Map<string, any>();
      for (let i = 0; i < cols.length; i += 1) {
        map.set(topLevelIds[i], cols[i]);
      }

      const ordered: any[] = [];
      for (const id of columnOrder) {
        const hit = map.get(id);
        if (!hit) continue;
        ordered.push(hit);
        map.delete(id);
      }

      for (let i = 0; i < cols.length; i += 1) {
        const id = topLevelIds[i];
        const hit = map.get(id);
        if (!hit) continue;
        ordered.push(hit);
        map.delete(id);
      }

      return ordered;
    };

    const orderedTopLevel = applyOrder(rawCols);

    const mapColumns = (cols: any[], parentPath: number[] = []): any[] => {
      return cols.map((col, idx) => {
        const indexPath = [...parentPath, idx];
        const id = getColumnId(col, indexPath);
        const isLeaf = isLeafColumn(col);

        const baseWidthRaw = widths[id] ?? parseWidthPx(col.width) ?? defaultColumnWidth;
        const baseWidth = clamp(baseWidthRaw, minColumnWidth, maxColumnWidth);

        if (!isLeaf) {
          return {
            ...col,
            children: mapColumns(col.children || [], indexPath),
          };
        }

        const titleText = typeof col?.title === 'string' ? col.title : '';
        const keyText = col?.key == null ? '' : String(col.key);
        const dataIndexText = Array.isArray(col?.dataIndex)
          ? col.dataIndex.join('.')
          : col?.dataIndex == null
            ? ''
            : String(col.dataIndex);
        const maybeAction =
          titleText.includes('操作') ||
          ['action', 'actions', 'operation', 'operate', 'op'].includes(keyText.toLowerCase()) ||
          ['action', 'actions', 'operation', 'operate', 'op'].includes(dataIndexText.toLowerCase());

        const resizable = (col as any).resizable === true
          ? true
          : (col as any).resizable !== false && !maybeAction;

        const fixed = allowFixedColumns ? (maybeAction ? 'right' : undefined) : undefined;

        const draggable = reorderableColumns && !maybeAction && topLevelLeaf && parentPath.length === 0;

        return {
          ...col,
          width: baseWidth,
          fixed,
          onHeaderCell: () => ({
            width: baseWidth,
            resizable,
            onResize: (nextWidth: number) => {
              setWidths((prev) => ({
                ...prev,
                [id]: clamp(nextWidth, minColumnWidth, maxColumnWidth),
              }));
            },
            draggable,
            onDragStart: (e: React.DragEvent<HTMLElement>) => {
              if (!draggable) return;
              draggingIdRef.current = id;
              try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
              } catch {
              }
            },
            onDragEnd: () => {
              draggingIdRef.current = null;
            },
            onDragOver: (e: React.DragEvent<HTMLElement>) => {
              if (!draggable) return;
              if (!draggingIdRef.current) return;
              e.preventDefault();
              try {
                e.dataTransfer.dropEffect = 'move';
              } catch {
              }
            },
            onDrop: (e: React.DragEvent<HTMLElement>) => {
              if (!draggable) return;
              e.preventDefault();
              const fromId = draggingIdRef.current || (() => {
                try {
                  return e.dataTransfer.getData('text/plain') || null;
                } catch {
                  return null;
                }
              })();
              const toId = id;
              if (!fromId) return;
              if (fromId === toId) return;

              const current = orderedTopLevel.map((c, i) => getColumnId(c, [i]));
              const next = current.filter((x) => x !== fromId);
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const insertAfter = e.clientX > rect.left + rect.width / 2;
              const toIndex = next.indexOf(toId);
              const insertIndex = toIndex < 0 ? next.length : (insertAfter ? toIndex + 1 : toIndex);
              next.splice(Math.max(0, insertIndex), 0, fromId);
              setColumnOrder(uniqueStrings(next));
              draggingIdRef.current = null;
            },
          }),
        };
      });
    };

    return mapColumns(orderedTopLevel);
  }, [allowFixedColumns, autoFixedColumns, columnOrder, columns, defaultColumnWidth, maxColumnWidth, minColumnWidth, reorderableColumns, widths]);

  const wrapperClassName = React.useMemo(() => {
    const next = ['resizable-table-shell', stickyFooter ? 'resizable-table-shell-sticky-footer' : '']
      .filter(Boolean)
      .join(' ');
    return next;
  }, [stickyFooter]);

  return (
    <div className={wrapperClassName}>
      <Table
        {...rest}
        className={mergedClassName}
        columns={mergedColumns as any}
        components={mergedComponents}
        scroll={mergedScroll as any}
        tableLayout={tableLayout ?? (resizableColumns ? 'fixed' : undefined)}
      />
    </div>
  );
};

export default ResizableTable;
