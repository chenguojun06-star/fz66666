import React, { useRef, useState, useCallback } from 'react';
import type { TableProps } from 'antd';
import { Empty, Button, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { buildPageSizeStorageKey } from '@/utils/pageSizeStore';
import {
  hashString,
  buildColumnsSignature,
  readArrayStorage,
  writeArrayStorage,
  uniqueStrings,
} from './utils';
import {
  buildMergedPagination,
  prepareColumns,
  reorderColumnsByOrder,
  applyColumnIdTransforms,
} from './resizableTableHelpers';
import SortableHeaderCell from './SortableHeaderCell';

interface UseResizableTableDataParams<T> {
  columns: TableProps<T>['columns'];
  components: TableProps<T>['components'];
  scroll: TableProps<T>['scroll'];
  tableLayout: TableProps<T>['tableLayout'];
  pagination: TableProps<T>['pagination'];
  storageKeyProp?: string;
  allowFixedColumns: boolean;
  reorderableColumns: boolean;
  stickyFooterProp?: boolean;
  stickyHeaderProp?: boolean | { offsetHeader?: number };
  showIndex: boolean;
  responsiveSize: boolean;
  className?: string;
  sizeProp?: 'small' | 'middle' | 'large';
  rowKey?: TableProps<T>['rowKey'];
  emptyDescription?: string;
  emptyActionText?: string;
  onEmptyAction?: () => void;
  emptySecondaryActionText?: string;
  onEmptySecondaryAction?: () => void;
  localeProp?: Record<string, any>;
}

export const useResizableTableData = <T extends object>(params: UseResizableTableDataParams<T>) => {
  const {
    columns,
    components,
    scroll,
    pagination: paginationProp,
    storageKeyProp,
    allowFixedColumns,
    reorderableColumns,
    stickyFooterProp,
    stickyHeaderProp,
    showIndex,
    responsiveSize,
    className,
    sizeProp,
    rowKey,
    emptyDescription,
    emptyActionText,
    onEmptyAction,
    emptySecondaryActionText,
    onEmptySecondaryAction,
    localeProp,
  } = params;

  const hasEmptyAction = Boolean(emptyActionText && onEmptyAction);
  const hasEmptySecondaryAction = Boolean(emptySecondaryActionText && onEmptySecondaryAction);

  const mergedLocale = React.useMemo(() => {
    if (!hasEmptyAction && !hasEmptySecondaryAction && !emptyDescription) {
      return localeProp;
    }
    const emptyNode = (
      <Empty
        description={emptyDescription || '暂无数据'}
        style={{ padding: '48px 0' }}
      >
        {(hasEmptyAction || hasEmptySecondaryAction) && (
          <Space>
            {hasEmptySecondaryAction && (
              <Button onClick={onEmptySecondaryAction}>
                {emptySecondaryActionText}
              </Button>
            )}
            {hasEmptyAction && (
              <Button type="primary" icon={<PlusOutlined />} onClick={onEmptyAction}>
                {emptyActionText}
              </Button>
            )}
          </Space>
        )}
      </Empty>
    );
    return {
      ...localeProp,
      emptyText: emptyNode,
    };
  }, [localeProp, emptyDescription, emptyActionText, onEmptyAction, emptySecondaryActionText, onEmptySecondaryAction, hasEmptyAction, hasEmptySecondaryAction]);

  const shellRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const lastScrollableRef = useRef<boolean>(false);
  const scrollRafRef = useRef<number | null>(null);

  const checkScrollable = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const tableBody = shell.querySelector('.ant-table-body') as HTMLElement | null;
    if (!tableBody) return;
    // 读取布局属性后，延迟 setState 到下一帧，避免 Forced reflow
    const next = tableBody.scrollWidth > tableBody.clientWidth + 2;
    if (lastScrollableRef.current === next) return;
    lastScrollableRef.current = next;
    // 用 microtask 延迟 setState，让浏览器先完成当前帧的布局计算
    Promise.resolve().then(() => setIsScrollable(next));
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

  // ── U-1 填充模式：在 PageLayout 全高布局内自动计算 scroll.y ──────────────
  // 表头 + 分页钉死，仅表体内部滚动（App 式布局）。
  // 仅当：调用方未显式传 scroll.y，且表格是 .page-layout-body 的直接子元素时启用；
  // 其余场景（Modal 内、包裹层、Tabs）保持原有自然高度行为，避免破坏现有页面。
  const [fillScrollY, setFillScrollY] = useState<number | undefined>(undefined);
  const lastFillYRef = useRef<number>(0);
  const computeFillYRef = useRef<(() => void) | null>(null);

  React.useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const container = shell.parentElement;
    if (!container || !container.classList.contains('page-layout-body')) return;

    const compute = () => {
      const headerEl = shell.querySelector('.ant-table-header') as HTMLElement | null;
      const paginationEl = shell.querySelector('.ant-pagination') as HTMLElement | null;
      const exportEl = shell.querySelector('.resizable-table-export-row') as HTMLElement | null;
      const chrome = (headerEl?.offsetHeight || 0)
        + (paginationEl?.offsetHeight || 0)
        + (paginationEl ? 16 : 0)
        + (exportEl?.offsetHeight || 0);
      const next = Math.max(80, Math.floor(container.clientHeight - chrome - 4));
      if (Math.abs(next - lastFillYRef.current) > 1) {
        lastFillYRef.current = next;
        Promise.resolve().then(() => setFillScrollY(next));
      }
    };
    computeFillYRef.current = compute;
    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(container);
    ro.observe(shell);
    window.addEventListener('resize', compute);
    // scroll.y 注入后 antd 才会渲染独立表头，下一帧再精算一次收敛
    const raf = requestAnimationFrame(() => compute());
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
      cancelAnimationFrame(raf);
      computeFillYRef.current = null;
    };
  }, []);

  // scroll.y 注入引起表头/分页出现后，再精算一次
  React.useEffect(() => {
    if (fillScrollY === undefined) return;
    const raf = requestAnimationFrame(() => computeFillYRef.current?.());
    return () => cancelAnimationFrame(raf);
  }, [fillScrollY]);

  const pageSizeStorageKey = React.useMemo(() => (
    resolvedStorageKey ? buildPageSizeStorageKey(resolvedStorageKey) : undefined
  ), [resolvedStorageKey]);

  const mergedPagination = React.useMemo(
    () => buildMergedPagination(paginationProp, pageSizeStorageKey),
    [pageSizeStorageKey, paginationProp],
  );

  const orderStorageKey = React.useMemo(() => {
    if (!resolvedStorageKey) return null;
    return `${resolvedStorageKey}:order`;
  }, [resolvedStorageKey]);

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
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

  const preparedColumns = React.useMemo(
    () => prepareColumns(columns, allowFixedColumns, showIndex),
    [columns, allowFixedColumns, showIndex],
  );

  const orderedColumns = React.useMemo(
    () => reorderColumnsByOrder(preparedColumns, columnOrder, showIndex),
    [preparedColumns, columnOrder, showIndex],
  );

  const finalColumns = React.useMemo(
    () => applyColumnIdTransforms(orderedColumns, mergedPagination),
    [orderedColumns, mergedPagination],
  );

  React.useEffect(() => {
    checkScrollable();
    const shell = shellRef.current;
    if (!shell) return;
    const tableBody = shell.querySelector('.ant-table-body') as HTMLElement | null;
    if (!tableBody) return;

    const ro = new ResizeObserver(() => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        checkScrollable();
      });
    });
    ro.observe(tableBody);
    const onScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        checkScrollable();
      });
    };
    tableBody.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      tableBody.removeEventListener('scroll', onScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [checkScrollable, finalColumns]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const sortableColumnIds = React.useMemo(() => {
    if (!orderedColumns || !reorderableColumns) return [];
    return (orderedColumns as any[])
      .filter((col: any) => col.colId && col.colId !== '__index__')
      .map((col: any) => col.colId);
  }, [orderedColumns, reorderableColumns]);

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

  const getTablePopupContainer = useCallback((triggerNode?: HTMLElement) => {
    if (triggerNode) {
      const modal = triggerNode.closest?.('.ant-modal-body') as HTMLElement | null;
      if (modal) return modal;
      const drawer = triggerNode.closest?.('.ant-drawer-content') as HTMLElement | null;
      if (drawer) return drawer;
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
    const callerY = typeof scroll === 'object' && scroll !== null ? (scroll as any).y : undefined;
    const base: any = typeof scroll === 'object' && scroll !== null ? { ...scroll } : {};
    if (!scroll && hasFixedColumn) base.x = 'max-content';
    // U-1：调用方未指定 scroll.y 且处于全高布局时，注入测得的填充高度
    if (callerY === undefined && fillScrollY !== undefined) {
      base.y = fillScrollY;
    }
    return Object.keys(base).length > 0 ? base : undefined;
  }, [scroll, hasFixedColumn, fillScrollY]);

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
      fillScrollY !== undefined ? 'resizable-table-fill' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return next;
  }, [className, stickyFooter, isScrollable, fillScrollY]);

  return {
    mergedLocale,
    shellRef,
    isScrollable,
    responsiveTableSize,
    stickyFooter,
    mergedPagination,
    finalColumns,
    dndSensors,
    sortableColumnIds,
    handleDragEnd,
    getTablePopupContainer,
    mergedScroll,
    mergedComponents,
    wrapperClassName,
    stickyHeaderProp,
  };
};

export default useResizableTableData;
