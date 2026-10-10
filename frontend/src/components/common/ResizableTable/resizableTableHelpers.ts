import {
  DEFAULT_PAGE_SIZE,
  normalizePageSize,
  readPageSize,
  readPageSizeByKey,
  savePageSize,
  savePageSizeByKey,
} from '@/utils/pageSizeStore';
import {
  normalizePageSizeOptions,
  isLeafColumn,
  getColumnId,
  computeAdaptiveWidth,
} from './utils';
import type { ColumnType, TablePaginationConfig } from 'antd/es/table';

/** 可拖拽列的内部记录：antd 列类型 + 本组件的 colId 元数据（D-685） */
type ResizableColumn = ColumnType<Record<string, unknown>> & {
  colId?: string;
  /** 表头分组子列 */
  children?: ResizableColumn[];
  /** 本项目 react-resizable 扩展字段 */
  resizable?: unknown;
};



/**
 * 合并分页配置：处理 pageSize 持久化、onChange 拦截、showSizeChanger 注入。
 * 从 useResizableTableData 提取的纯函数，行为严格不变。
 */
export const buildMergedPagination = (
  paginationProp?: TablePaginationConfig | boolean | null | undefined,
  pageSizeStorageKey?: string | undefined,
): TablePaginationConfig | boolean | null | undefined => {
  if (paginationProp === false) return false;
  if (paginationProp === undefined || paginationProp === null) return paginationProp;
  const base = typeof paginationProp === 'object' ? paginationProp : ({} as TablePaginationConfig);
  const { position, placement, showSizeChanger: showSizeChangerProp, ...baseRest } = base;
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
      // 页面级 key 必须写：页面普遍用 useState(readPageSize(20)) 初始化，
      // 只写表级 key 的话它们永远读到兜底 20，"每页条数选了不生效/刷新又变回 20"。
      savePageSize(nextPageSize);
      if (pageSizeStorageKey) {
        savePageSizeByKey(pageSizeStorageKey, nextPageSize);
      }
    }
    originalOnChange?.(page, nextPageSize);
  };

  let resolvedShowSizeChanger;
  if (showSizeChangerProp === false) {
    resolvedShowSizeChanger = false;
  } else {
    const baseShowSizeChanger = typeof showSizeChangerProp === 'object' ? showSizeChangerProp : {};
    resolvedShowSizeChanger = { getPopupContainer: (_triggerNode: HTMLElement) => document.body, ...baseShowSizeChanger };
  }

  return {
    ...baseRest,
    pageSize: normalizedPageSize,
    defaultPageSize: normalizedDefaultPageSize,
    pageSizeOptions: normalizePageSizeOptions(base?.pageSizeOptions, normalizedPageSize, normalizedDefaultPageSize),
    onChange: interceptedOnChange,
    simple: base?.simple ?? false,
    showSizeChanger: resolvedShowSizeChanger,
    placement: (placement ?? position ?? ['bottomRight']) as TablePaginationConfig['placement'],
  }
};

/**
 * 预处理列：剥离 resizable、注入 colId、计算自适应宽度、注入序号列、处理 fixed。
 * 从 useResizableTableData 提取的纯函数，行为严格不变。
 */
export const prepareColumns = (
  columns: ReadonlyArray<unknown> | undefined,
  allowFixedColumns: boolean,
  showIndex: boolean,
): ResizableColumn[] => {
  if (!columns) return [];
  const rawCols = (Array.isArray(columns) ? columns : []) as ResizableColumn[];

  const mapColumns = (cols: ResizableColumn[]): ResizableColumn[] => {
    return cols.map((col) => {
      const colRecord = col as ResizableColumn;
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

  const mapped = mapColumns(rawCols);

  if (showIndex && mapped.length > 0) {
    const indexColumn: ResizableColumn = {
      title: '序号',
      key: '__index__',
      dataIndex: '__index__',
      width: 60,
      align: 'center',
      fixed: 'left',
      colId: '__index__',
      render: (_: unknown, __: unknown, idx: number) => idx + 1,
    };
    return [indexColumn, ...mapped];
  }

  return mapped;
};

/**
 * 按 columnOrder 重排列顺序，固定列（left/right）自动归类。
 * 从 useResizableTableData 提取的纯函数，行为严格不变。
 */
export const reorderColumnsByOrder = (
  preparedColumns: ResizableColumn[],
  columnOrder: string[],
  showIndex: boolean,
): ResizableColumn[] => {
  if (!preparedColumns || columnOrder.length === 0) return preparedColumns;
  const rawCols = preparedColumns as ResizableColumn[];
  const topLevelLeaf = rawCols.every((c) => isLeafColumn(c));
  if (!topLevelLeaf) return preparedColumns;

  const indexCol = showIndex ? rawCols.find((c: ResizableColumn) => c.colId === '__index__') : null;
  const restCols = showIndex ? rawCols.filter((c: ResizableColumn) => c.colId !== '__index__') : rawCols;

  const topLevelIds = restCols.map((col, idx) => getColumnId(col, [idx]));
  const map = new Map<string, any>();
  for (let i = 0; i < restCols.length; i++) {
    map.set(topLevelIds[i], restCols[i]);
  }

  const ordered: ResizableColumn[] = [];
  for (const id of columnOrder) {
    const hit = map.get(id);
    if (!hit) continue;
    ordered.push(hit);
    map.delete(id);
  }
  for (let i = 0; i < restCols.length; i++) {
    const id = topLevelIds[i];
    const hit = map.get(id);
    if (!hit) continue;
    ordered.push(hit);
    map.delete(id);
  }

  const fixedLeft = ordered.filter((c: ResizableColumn) => c.fixed === 'left');
  const fixedRight = ordered.filter((c: ResizableColumn) => c.fixed === 'right');
  const nonFixed = ordered.filter((c: ResizableColumn) => c.fixed !== 'left' && c.fixed !== 'right');
  const result = [...fixedLeft, ...nonFixed, ...fixedRight];

  if (indexCol) {
    return [indexCol, ...result];
  }
  return result;
};

/**
 * 最终列变换：剥离 colId、注入 onHeaderCell 的 data-col-id、计算分页偏移序号。
 * 从 useResizableTableData 提取的纯函数，行为严格不变。
 */
export const applyColumnIdTransforms = (
  orderedColumns: ResizableColumn[],
  mergedPagination: TablePaginationConfig | boolean | null | undefined,
): ResizableColumn[] => {
  if (!orderedColumns) return orderedColumns;
  // mergedPagination 实际可能收到 false（pagination={false}），守卫后取分页字段
  const pag = mergedPagination && typeof mergedPagination === 'object' ? mergedPagination : null;
  const currentPage = typeof pag?.current === 'number' ? pag.current : 1;
  const currentPageSize = typeof pag?.pageSize === 'number' ? pag.pageSize : 0;
  const indexOffset = currentPage > 1 && currentPageSize > 0 ? (currentPage - 1) * currentPageSize : 0;

  return (orderedColumns as ResizableColumn[]).map((col: any) => {
    const { colId, ...cleanCol } = col;
    const originalOnHeaderCell = cleanCol.onHeaderCell;

    if (colId === '__index__') {
      return {
        ...cleanCol,
        render: (_: unknown, __: unknown, idx: number) => indexOffset + idx + 1,
        onHeaderCell: (column: ResizableColumn) => {
          const originalProps = typeof originalOnHeaderCell === 'function'
            ? originalOnHeaderCell(column)
            : {};
          return { ...originalProps, 'data-col-id': colId };
        },
      };
    }

    return {
      ...cleanCol,
      onHeaderCell: (column: ResizableColumn) => {
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
};
