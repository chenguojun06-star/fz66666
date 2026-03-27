import React from 'react';
import { Pagination } from 'antd';
import type { PaginationProps } from 'antd';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, normalizePageSize } from '@/utils/pageSizeStore';

interface StandardPaginationProps extends Omit<PaginationProps, 'align'> {
  align?: 'left' | 'center' | 'right';
  wrapperStyle?: React.CSSProperties;
  compact?: boolean;
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
  showTotal,
  showSizeChanger = true,
  showQuickJumper = true,
  pageSize,
  defaultPageSize,
  ...rest
}) => {
  const normalizedPageSize = pageSize == null ? undefined : normalizePageSize(Number(pageSize), DEFAULT_PAGE_SIZE);
  const normalizedDefaultPageSize = defaultPageSize == null ? undefined : normalizePageSize(Number(defaultPageSize), DEFAULT_PAGE_SIZE);

  return (
    <div
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
        showSizeChanger={showSizeChanger}
        showQuickJumper={showQuickJumper}
        pageSizeOptions={[...DEFAULT_PAGE_SIZE_OPTIONS]}
      />
    </div>
  );
};

export default StandardPagination;
