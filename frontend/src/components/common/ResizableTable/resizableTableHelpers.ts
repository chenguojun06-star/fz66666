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

/**
 * 合并分页配置：处理 pageSize 持久化、onChange 拦截、showSizeChanger 注入。
 * 从 useResizableTableData 提取的纯函数，行为严格不变。
 */
export const buildMergedPagination = (
  paginationProp: any,
  pageSizeStorageKey: string | undefined,
): any => {
  if (paginationProp === false) return false;
  if (paginationProp === undefined || paginationProp === null) return paginationProp;
  const base = typeof paginationProp === 'object' ? paginationProp : ({} as any);
  const { position, placement, showSizeChanger: showSizeChangerProp, ...baseRest } = base as any;
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

  let resolvedShowSizeChanger;
  if (showSizeChangerProp === false) {
    resolvedShowSizeChanger = false;
  } else {
    const baseShowSizeChanger = typeof showSizeChangerProp === 'object' ? showSizeChangerProp : {};
    resolvedShowSizeChanger = { getPopupContainer: (triggerNode: HTMLElement) => document.body, ...baseShowSizeChanger };
  }

  return {
    ...baseRest,
    pageSize: normalizedPageSize,
    defaultPageSize: normalizedDefaultPageSize,
    pageSizeOptions: normalizePageSizeOptions(base?.pageSizeOptions, normalizedPageSize, normalizedDefaultPageSize),
    onChange: interceptedOnChange,
    simple: base?.simple ?? false,
    showSizeChanger: resolvedShowSizeChanger,
    placement: placement ?? position ?? ['bottomRight'],
  } as any;
};

/**
 * 预处理列：剥离 resizable、注入 colId、计算自适应宽度、注入序号列、处理 fixed。
 * 从 useResizableTableData 提取的纯函数，行为严格不变。
 */
export const prepareColumns = (
  columns: any,
  allowFixedColumns: boolean,
  showIndex: boolean,
): any => {
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

  const mapped = mapColumns(rawCols);

  if (showIndex && mapped.length > 0) {
    const indexColumn = {
      title: '序号',
      key: '__index__',
      dataIndex: '__index__',
      width: 60,
      align: 'center',
      fixed: 'left',
      colId: '__index__',
      render: (_: any, __: any, idx: number) => idx + 1,
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
  preparedColumns: any,
  columnOrder: string[],
  showIndex: boolean,
): any => {
  if (!preparedColumns || columnOrder.length === 0) return preparedColumns;
  const rawCols = preparedColumns as any[];
  const topLevelLeaf = rawCols.every((c) => isLeafColumn(c));
  if (!topLevelLeaf) return preparedColumns;

  const indexCol = showIndex ? rawCols.find((c: any) => c.colId === '__index__') : null;
  const restCols = showIndex ? rawCols.filter((c: any) => c.colId !== '__index__') : rawCols;

  const topLevelIds = restCols.map((col, idx) => getColumnId(col, [idx]));
  const map = new Map<string, any>();
  for (let i = 0; i < restCols.length; i++) {
    map.set(topLevelIds[i], restCols[i]);
  }

  const ordered: any[] = [];
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

  const fixedLeft = ordered.filter((c: any) => c.fixed === 'left');
  const fixedRight = ordered.filter((c: any) => c.fixed === 'right');
  const nonFixed = ordered.filter((c: any) => c.fixed !== 'left' && c.fixed !== 'right');
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
  orderedColumns: any,
  mergedPagination: any,
): any => {
  if (!orderedColumns) return orderedColumns;
  const currentPage = typeof (mergedPagination as any)?.current === 'number' ? (mergedPagination as any).current : 1;
  const currentPageSize = typeof (mergedPagination as any)?.pageSize === 'number' ? (mergedPagination as any).pageSize : 0;
  const indexOffset = currentPage > 1 && currentPageSize > 0 ? (currentPage - 1) * currentPageSize : 0;

  return (orderedColumns as any[]).map((col: any) => {
    const { colId, ...cleanCol } = col;
    const originalOnHeaderCell = cleanCol.onHeaderCell;

    if (colId === '__index__') {
      return {
        ...cleanCol,
        render: (_: any, __: any, idx: number) => indexOffset + idx + 1,
        onHeaderCell: (column: any) => {
          const originalProps = typeof originalOnHeaderCell === 'function'
            ? originalOnHeaderCell(column)
            : {};
          return { ...originalProps, 'data-col-id': colId };
        },
      };
    }

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
};
