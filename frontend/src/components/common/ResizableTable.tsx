import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

/**
 * 任意记录类型定义
 */
type AnyRecord = Record<string, unknown>;

/**
 * 可调整列宽的表格属性
 */
type ResizableTableProps<T extends object> = TableProps<T> & {
  /** 本地存储键名，用于保存列宽和列顺序 */
  storageKey?: string;
  /** 是否启用列宽调整，默认true */
  resizableColumns?: boolean;
  /** 是否自动固定列，默认true */
  autoFixedColumns?: boolean;
  /** 是否允许固定列，默认true */
  allowFixedColumns?: boolean;
  /** 是否允许列重新排序，默认true */
  reorderableColumns?: boolean;
  /** 是否启用粘性页脚，默认根据是否有分页自动判断 */
  stickyFooter?: boolean;
  /** 最小列宽，默认60px */
  minColumnWidth?: number;
  /** 最大列宽，默认800px */
  maxColumnWidth?: number;
  /** 默认列宽，默认120px */
  defaultColumnWidth?: number;
};

const hashString = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

const buildColumnsSignature = (cols: any): string => {
  if (!Array.isArray(cols) || cols.length === 0) return 'empty';

  const parts: string[] = [];
  const walk = (list: unknown[], path: number[]) => {
    for (let i = 0; i < list.length; i += 1) {
      const col = list[i] as any;
      const p = [...path, i];
      const key = col?.key ?? col?.dataIndex;
      const keyText = Array.isArray(key) ? key.join('.') : key == null ? '' : String(key);
      const titleText = typeof col?.title === 'string' ? col.title : '';
      const dataIndexText = Array.isArray(col?.dataIndex)
        ? col.dataIndex.join('.')
        : col?.dataIndex == null
          ? ''
          : String(col.dataIndex);
      parts.push(`${p.join('.')}:${keyText}:${dataIndexText}:${titleText}`);
      if (Array.isArray(col?.children) && col.children.length > 0) {
        walk(col.children as unknown[], p);
      }
    }
  };

  walk(cols, []);
  return parts.join('|') || 'empty';
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
 * 解析宽度值为像素数值
 * @param width 宽度值，可能是数字、字符串或px单位
 * @returns 解析后的像素数值，解析失败则返回undefined
 */
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

/**
 * 判断是否为叶子列（没有子列）
 * @param col 列配置
 * @returns 是否为叶子列
 */
const isLeafColumn = (col: any) => !col?.children || (Array.isArray(col.children) && col.children.length === 0);

/**
 * 获取列的唯一标识
 * @param col 列配置
 * @param indexPath 索引路径
 * @returns 列的唯一标识
 */
const getColumnId = (col: any, indexPath: number[]) => {
  const key = col?.key ?? col?.dataIndex;
  if (Array.isArray(key)) return key.join('.') || indexPath.join('.');
  if (typeof key === 'string' || typeof key === 'number') return String(key);
  return indexPath.join('.');
};

/**
 * 从本地存储读取数据
 * @param key 存储键名
 * @returns 读取的数据，读取失败则返回null
 */
const readStorage = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, number>;
  } catch {
    // Intentionally empty
    // 忽略错误
    return null;
  }
};

/**
 * 写入数据到本地存储
 * @param key 存储键名
 * @param value 要存储的数据
 */
const writeStorage = (key: string, value: Record<string, number>) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Intentionally empty
    // 忽略错误
  }
};

/**
 * 从本地存储读取数组数据
 * @param key 存储键名
 * @returns 读取的数组数据，读取失败则返回null
 */
const readArrayStorage = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x) => typeof x === 'string') as string[];
  } catch {
    // Intentionally empty
    // 忽略错误
    return null;
  }
};

/**
 * 写入数组数据到本地存储
 * @param key 存储键名
 * @param value 要存储的数组数据
 */
const writeArrayStorage = (key: string, value: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Intentionally empty
    // 忽略错误
  }
};

/**
 * 数组去重
 * @param list 字符串数组
 * @returns 去重后的字符串数组
 */
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

/**
 * 可调整列宽的表头单元格属性
 */
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

  // 判断是否可以调整列宽
  const canResize =
    resizableColumns &&
    resizable !== false &&
    typeof onResize === 'function' &&
    typeof width === 'number';

  // 拖拽状态引用
  const dragRef = React.useRef({
    dragging: false,
    startX: 0,
    startWidth: typeof width === 'number' ? width : 0,
    rafId: null as number | null,
  });

  // 处理指针按下事件
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
      // Intentionally empty
      // 忽略错误
    }
  };

  // 处理指针移动事件（用 requestAnimationFrame 做帧级节流）
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    if (!canResize) return;
    e.preventDefault();
    e.stopPropagation();

    // 取消上一次未执行的动画帧
    if (dragRef.current.rafId !== null) {
      cancelAnimationFrame(dragRef.current.rafId);
    }

    const clientX = e.clientX;
    const startX = dragRef.current.startX;
    const startWidth = dragRef.current.startWidth;

    // 用 requestAnimationFrame 合并本帧更新
    dragRef.current.rafId = requestAnimationFrame(() => {
      const delta = clientX - startX;
      const base = startWidth;
      const next = clamp(base + delta, minColumnWidth, maxColumnWidth);
      (onResize as (w: number) => void)(next);
      dragRef.current.rafId = null;
    });
  };

  // 处理指针抬起事件
  const stopDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    e.preventDefault();
    e.stopPropagation();

    // 清理待处理的动画帧
    if (dragRef.current.rafId !== null) {
      cancelAnimationFrame(dragRef.current.rafId);
      dragRef.current.rafId = null;
    }

    dragRef.current.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  };

  // 如果不可调整列宽，渲染普通表头
  if (!canResize) {
    return (
      <th {...restCellProps} style={style}>
        {children}
      </th>
    );
  }

  // 渲染可调整列宽的表头
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
      {/* 列宽调整手柄 */}
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

/**
 * 可调整列宽的表格组件
 * 支持拖拽调整列宽、列重新排序、本地存储列配置等特性
 */
const ResizableTable = <T extends object>(props: ResizableTableProps<T>) => {
  const {
    columns,
    components,
    scroll,
    tableLayout,
    pagination: paginationProp,
    storageKey: storageKeyProp,
    resizableColumns = true,
    autoFixedColumns = true,
    allowFixedColumns = true,
    reorderableColumns = true,
    stickyFooter: stickyFooterProp,
    minColumnWidth = 60,
    maxColumnWidth = 800,
    defaultColumnWidth = 120,
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

  // 是否启用粘性页脚
  const stickyFooter = stickyFooterProp ?? false;

  const mergedPagination = React.useMemo(() => {
    if (paginationProp === false) return false;
    if (paginationProp === undefined || paginationProp === null) return paginationProp;
    const base = typeof paginationProp === 'object' ? paginationProp : ({} as any);
    const { position, placement, ...baseRest } = base as any;
    return {
      ...baseRest,
      simple: base?.simple ?? true,
      showSizeChanger: base?.showSizeChanger ?? true,
      placement: placement ?? position ?? ['bottomRight'],
    } as any;
  }, [paginationProp]);

  // 合并类名
  const mergedClassName = React.useMemo(() => {
    const next = [className, resizableColumns ? 'resizable-table' : ''].filter(Boolean).join(' ');
    return next || undefined;
  }, [className, resizableColumns]);

  // 列宽状态
  const [widths, setWidths] = React.useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    if (!resolvedStorageKey) return {};
    return readStorage(resolvedStorageKey) || {};
  });

  // 列顺序存储键名
  const orderStorageKey = React.useMemo(() => {
    if (!resolvedStorageKey) return null;
    return `${resolvedStorageKey}:order`;
  }, [resolvedStorageKey]);

  // 列顺序状态
  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    if (!orderStorageKey) return [];
    return readArrayStorage(orderStorageKey) || [];
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!resolvedStorageKey) {
      setWidths({});
      setColumnOrder([]);
      return;
    }
    setWidths(readStorage(resolvedStorageKey) || {});
    const nextOrder = readArrayStorage(`${resolvedStorageKey}:order`) || [];
    setColumnOrder(nextOrder);
  }, [resolvedStorageKey]);

  // 当前正在拖拽的列 ID
  const draggingIdRef = React.useRef<string | null>(null);

  // 保存列宽到本地存储
  React.useEffect(() => {
    if (!resolvedStorageKey) return;
    writeStorage(resolvedStorageKey, widths);
  }, [resolvedStorageKey, widths]);

  // 保存列顺序到本地存储
  React.useEffect(() => {
    if (!orderStorageKey) return;
    writeArrayStorage(orderStorageKey, uniqueStrings(columnOrder));
  }, [columnOrder, orderStorageKey]);

  // 合并滚动配置
  const mergedScroll = React.useMemo(() => {
    if (!resizableColumns) return scroll;
    if (!scroll) return { x: 'max-content' as const };
    if ((scroll as any).x) return scroll;
    const baseScroll = typeof scroll === 'object' && scroll !== null ? (scroll as any) : {};
    return { ...baseScroll, x: 'max-content' as const };
  }, [resizableColumns, scroll]);

  // 合并组件配置
  const mergedComponents = React.useMemo(() => {
    if (!resizableColumns) return components;
    const baseComponents = typeof components === 'object' && components !== null ? (components as any) : {};
    const header = typeof baseComponents.header === 'object' && baseComponents.header !== null
      ? (baseComponents.header as any)
      : {};
    return {
      ...baseComponents,
      header: {
        ...header,
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

  // 处理列配置
  const mergedColumns = React.useMemo(() => {
    if (!columns) return columns;

    const rawCols = (Array.isArray(columns) ? columns : []) as any[];
    const topLevelLeaf = rawCols.every((c) => isLeafColumn(c));
    const topLevelIds = rawCols.map((col, idx) => getColumnId(col, [idx]));

    // 应用列顺序
    const applyOrder = (cols: Record<string, unknown>[]) => {
      if (!reorderableColumns) return cols;
      if (!topLevelLeaf) return cols;
      const map = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < cols.length; i += 1) {
        map.set(topLevelIds[i], cols[i]);
      }

      const ordered: Record<string, unknown>[] = [];
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

    // 递归处理列配置
    const mapColumns = (cols: Record<string, unknown>[], parentPath: number[] = []): Record<string, unknown>[] => {
      return cols.map((col, idx) => {
        const indexPath = [...parentPath, idx];
        const id = getColumnId(col, indexPath);
        const isLeaf = isLeafColumn(col);
        const colRecord = col as any;

        // 如果不是叶子列，递归处理子列
        if (!isLeaf) {
          const children = Array.isArray(colRecord.children) ? (colRecord.children as any[]) : [];
          return {
            ...colRecord,
            children: mapColumns(children, indexPath),
          };
        }

        // 提取列标题文本
        const titleText = typeof colRecord.title === 'string' ? colRecord.title : '';
        const keyText = colRecord.key == null ? '' : String(colRecord.key);
        const dataIndexText = Array.isArray(colRecord.dataIndex)
          ? colRecord.dataIndex.join('.')
          : colRecord.dataIndex == null
            ? ''
            : String(colRecord.dataIndex);

        // 判断是否为操作列
        const maybeAction =
          ['action', 'actions', 'operation', 'operate', 'op'].includes(keyText.toLowerCase()) ||
          ['action', 'actions', 'operation', 'operate', 'op'].includes(dataIndexText.toLowerCase()) ||
          ['操作', '操作列', '操作区', '操作按钮'].includes(titleText.trim());

        const baseWidth = maybeAction
          ? (parseWidthPx(colRecord.width) ?? actionColumnWidth)
          : clamp(widths[id] ?? parseWidthPx(colRecord.width) ?? defaultColumnWidth, minColumnWidth, maxColumnWidth);

        // 判断是否可调整列宽
        const resizable = colRecord.resizable === true
          ? true
          : colRecord.resizable !== false && !maybeAction;

        // 设置固定列
        const fixed = allowFixedColumns ? (maybeAction ? 'right' : undefined) : undefined;

        // 判断是否可拖拽排序
        const draggable = reorderableColumns && !maybeAction && topLevelLeaf && parentPath.length === 0;

        return {
          ...colRecord,
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
                // Intentionally empty
                // 忽略错误
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
                // Intentionally empty
                // 忽略错误
              }
            },
            onDrop: (e: React.DragEvent<HTMLElement>) => {
              if (!draggable) return;
              e.preventDefault();
              const fromId = draggingIdRef.current || (() => {
                try {
                  return e.dataTransfer.getData('text/plain') || null;
                } catch {
                  // Intentionally empty
                  // 忽略错误
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

  // 包装器类名
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
        rowKey={rowKey}
        className={mergedClassName}
        columns={mergedColumns as TableProps<T>['columns']}
        components={mergedComponents}
        scroll={mergedScroll as TableProps<T>['scroll']}
        tableLayout={tableLayout ?? (resizableColumns ? 'fixed' : undefined)}
        pagination={mergedPagination as TableProps<T>['pagination']}
      />
    </div>
  );
};

export default ResizableTable;
