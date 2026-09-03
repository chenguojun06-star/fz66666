import React, { useMemo } from 'react';
import { Pagination } from 'antd';
import type { PaginationProps } from 'antd';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, normalizePageSize } from '@/utils/pageSizeStore';

interface StandardPaginationProps extends Omit<PaginationProps, 'align'> {
  align?: 'left' | 'center' | 'right';
  wrapperStyle?: React.CSSProperties;
  compact?: boolean;
  /** D-282：吸底翻页器——position:sticky 钉在滚动容器底部（卡片视图等非填充表格页面用） */
  sticky?: boolean;
}

const justifyMap: Record<NonNullable<StandardPaginationProps['align']>, React.CSSProperties['justifyContent']> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

const StandardPagination: React.FC<StandardPaginationProps> = ({
  align = 'right',
  wrapperStyle,
  compact = false,
  sticky = false,
  showTotal,
  showSizeChanger = true,
  showQuickJumper = true,
  pageSize,
  defaultPageSize,
  ...rest
}) => {
  const normalizedPageSize = pageSize == null ? undefined : normalizePageSize(Number(pageSize), DEFAULT_PAGE_SIZE);
  const normalizedDefaultPageSize = defaultPageSize == null ? undefined : normalizePageSize(Number(defaultPageSize), DEFAULT_PAGE_SIZE);

  const resolvedShowSizeChanger = useMemo(() => {
    if (showSizeChanger === false) return false;
    const base = typeof showSizeChanger === 'object' ? showSizeChanger : {};
    return { getPopupContainer: (_triggerNode: HTMLElement) => document.body, ...base };
  }, [showSizeChanger]);

  return (
    <div
      className={sticky ? 'standard-pagination--sticky' : undefined}
      style={{
        display: 'flex',
        justifyContent: justifyMap[align],
        paddingTop: compact ? 8 : 12,
        paddingBottom: compact ? 4 : 0,
        ...wrapperStyle,
      }}
    >
      <Pagination
        {...rest}
        pageSize={normalizedPageSize}
        defaultPageSize={normalizedDefaultPageSize}
        showTotal={showTotal ?? ((value) => `共 ${value} 条`)}
        showSizeChanger={resolvedShowSizeChanger}
        showQuickJumper={showQuickJumper}
        pageSizeOptions={[...DEFAULT_PAGE_SIZE_OPTIONS]}
      />
    </div>
  );
};

export default StandardPagination;
