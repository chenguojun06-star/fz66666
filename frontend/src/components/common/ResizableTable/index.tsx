import React from 'react';
import { Table, ConfigProvider } from 'antd';
import type { TableProps } from 'antd';
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
  readStorage,
  writeStorage,
  readArrayStorage,
  writeArrayStorage,
  uniqueStrings,
} from './utils';
import ResizableHeaderCell from './ResizableHeaderCell';

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

  // 是否启用粘性页脚
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

    // 拦截 onChange：当用户切换每页条数时，自动持久化到 localStorage
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

  // getPopupContainer：表格在 Modal 内时锚定到 .ant-modal-body（避免弹层被遮挡），
  // 否则回退到 document.body。
  //  禁止将 popup 容器设为表格 wrapper div：该 div 无 position:relative，
  //    absolute 弹层初始定位到错误祖先再修正，会导致视觉"抖动"（闪烁）。
  const getTablePopupContainer = React.useCallback((triggerNode?: HTMLElement) => {
    if (triggerNode) {
      const modal = triggerNode.closest?.('.ant-modal-body') as HTMLElement | null;
      if (modal) return modal;
    }
    return document.body;
  }, []);

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

    if (!resizableColumns) {
      if (!scroll) return { y: defaultY };
      return { ...baseScroll, y: baseScroll.y ?? defaultY };
    }

    if (!scroll) return { x: 'max-content' as const, y: defaultY };
    return {
      ...baseScroll,
      x: baseScroll.x ?? 'max-content',
      y: baseScroll.y ?? defaultY
    };
  }, [autoScrollY, resizableColumns, scroll]);

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
    // 不启用列宽调整时，直接透传原始列配置（避免注入 fixed/onHeaderCell/宽度等副作用）
    // 但需要确保每列都有宽度，否则 table-layout: fixed 会出问题
    if (!resizableColumns) {
      return (Array.isArray(columns) ? columns : []).map((col) => {
        if (col.width) return col;
        const colKey = (col as any).key || (col as any).dataIndex;
        const keyText = typeof colKey === 'string' ? colKey.toLowerCase() : '';
        const titleText = typeof col.title === 'string' ? col.title.toLowerCase() : '';

        // 智能默认宽度
        let defaultWidth = 100;
        const narrowKeywords = ['数量', '件数', '码数', '尺码', '码', 'size', 'qty', 'quantity', 'num', 'count', '序号', 'no', 'id'];
        if (narrowKeywords.some(k => titleText.includes(k) || keyText.includes(k))) {
          defaultWidth = 40;
        }
        const mediumKeywords = ['颜色', '状态', '类型', '仓库', '单位', 'color', 'status', 'type', 'warehouse', 'unit'];
        if (mediumKeywords.some(k => titleText.includes(k) || keyText.includes(k))) {
          defaultWidth = 60;
        }
        const wideKeywords = ['订单', '款号', '款名', '名称', '编号', 'order', 'style', 'name', 'code', 'qr', '菲号'];
        if (wideKeywords.some(k => titleText.includes(k) || keyText.includes(k))) {
          defaultWidth = 100;
        }

        return { ...col, width: defaultWidth };
      });
    }

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

        // 根据列标题智能判断默认宽度
        const getSmartDefaultWidth = () => {
          const title = titleText.trim().toLowerCase();
          const key = keyText.toLowerCase();
          const dataIdx = dataIndexText.toLowerCase();

          // 窄列：数量、码数、尺码等（内容短）
          const narrowKeywords = ['数量', '件数', '码数', '尺码', '码', 'size', 'qty', 'quantity', 'num', 'count', '序号', 'no', 'id'];
          if (narrowKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
            return 40;
          }

          // 中等列：颜色、状态、类型等
          const mediumKeywords = ['颜色', '状态', '类型', '仓库', '单位', 'color', 'status', 'type', 'warehouse', 'unit', 'tag'];
          if (mediumKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
            return 60;
          }

          // 宽列：订单号、款号、名称等
          const wideKeywords = ['订单', '款号', '款名', '名称', '编号', 'order', 'style', 'name', 'code', 'no', 'qr', '菲号'];
          if (wideKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
            return 100;
          }

          // 超宽列：备注、描述等
          const extraWideKeywords = ['备注', '描述', '说明', 'remark', 'desc', 'description', 'note'];
          if (extraWideKeywords.some(k => title.includes(k) || key.includes(k) || dataIdx.includes(k))) {
            return 150;
          }

          return defaultColumnWidth;
        };

        const explicitWidth = parseWidthPx(colRecord.width);
        const storedWidth = widths[id];
        const smartDefaultWidth = getSmartDefaultWidth();
        const nextWidth = maybeAction
          ? (explicitWidth ?? actionColumnWidth)
          : (storedWidth ?? explicitWidth ?? smartDefaultWidth);
        const baseWidth = typeof nextWidth === 'number'
          ? clamp(nextWidth, minColumnWidth, maxColumnWidth)
          : clamp(smartDefaultWidth, minColumnWidth, maxColumnWidth);

        // 判断是否可调整列宽
        const resizable = colRecord.resizable === true
          ? true
          : colRecord.resizable !== false && !maybeAction;

        // 设置固定列
        const fixed = allowFixedColumns ? (maybeAction ? 'right' : undefined) : undefined;

        // 判断是否可拖拽排序
        const draggable = reorderableColumns && !maybeAction && topLevelLeaf && parentPath.length === 0;

        // Strip `resizable` from column props to prevent it leaking as a DOM attribute
        const { resizable: _stripResizable, ...safeColRecord } = colRecord;

        return {
          ...safeColRecord,
          ...(typeof baseWidth === 'number' ? { width: baseWidth } : {}),
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
  }, [allowFixedColumns, autoFixedColumns, columnOrder, columns, maxColumnWidth, minColumnWidth, reorderableColumns, widths]);

  const resolvedTableLayout = React.useMemo(() => {
    if (tableLayout) return tableLayout;
    return 'fixed' as const;
  }, [tableLayout]);

  // 包装器类名
  const wrapperClassName = React.useMemo(() => {
    const next = ['resizable-table-shell', className, stickyFooter ? 'resizable-table-shell-sticky-footer' : '']
      .filter(Boolean)
      .join(' ');
    return next;
  }, [className, stickyFooter]);

  return (
    <div className={wrapperClassName}>
      <ConfigProvider getPopupContainer={getTablePopupContainer}>
        <Table
          {...rest}
          rowKey={rowKey}
          className={mergedClassName}
          columns={mergedColumns as TableProps<T>['columns']}
          components={mergedComponents}
          scroll={mergedScroll as TableProps<T>['scroll']}
          tableLayout={resolvedTableLayout}
          pagination={mergedPagination as TableProps<T>['pagination']}
          sticky={stickyHeaderProp === true ? { offsetHeader: 0 } : (stickyHeaderProp || undefined)}
        />
      </ConfigProvider>
    </div>
  );
};

// 挂载 Summary 静态子组件，使用方可直接用 ResizableTable.Summary.*，无需额外引入 antd Table
const ResizableTableWithSummary = Object.assign(ResizableTable, {
  Summary: Table.Summary,
});

export default ResizableTableWithSummary;
