import React from 'react';
import PageLayout, { type PageLayoutProps } from '../PageLayout';
import StandardSearchBar, {
  type StandardSearchBarProps,
  type SearchFilterField,
  type StandardSearchOption,
} from '../StandardSearchBar';
import ResizableTable from '../ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import type { TablePaginationConfig } from 'antd';
import './StandardDataPage.css';

export interface StandardDataPageProps<T = any> {
  title: string;
  titleExtra?: React.ReactNode;
  headerContent?: React.ReactNode;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  searchBar?: StandardSearchBarProps;
  columns: ColumnsType<T>;
  dataSource: T[];
  loading?: boolean;
  rowKey?: string | ((record: T) => string);
  pagination?: TablePaginationConfig | false;
  onChange?: (pagination: any, filters: any, sorter: any) => void;
  onRow?: (record: T) => any;
  scroll?: { x?: number | string; y?: number | string };
  tableExtra?: React.ReactNode;
  children?: React.ReactNode;
  pageLayoutProps?: Partial<PageLayoutProps>;
  emptyText?: string;
  rowClassName?: string | ((record: T, index: number) => string);
}

function StandardDataPage<T extends Record<string, any> = any>({
  title,
  titleExtra,
  headerContent,
  toolbarLeft,
  toolbarRight,
  searchBar,
  columns,
  dataSource,
  loading = false,
  rowKey = 'id',
  pagination,
  onChange,
  onRow,
  scroll,
  tableExtra,
  children,
  pageLayoutProps,
  emptyText = '暂无数据',
  rowClassName,
}: StandardDataPageProps<T>) {
  const hasSearchBar =
    searchBar && (searchBar.searchValue !== undefined || searchBar.showDate || searchBar.showStatus);

  const filterLeft = hasSearchBar ? (
    <div style={{ width: '100%' }}>
      <StandardSearchBar {...searchBar} />
    </div>
  ) : (
    toolbarLeft
  );

  const filterRight = hasSearchBar ? toolbarRight : toolbarRight || toolbarLeft ? undefined : undefined;

  const finalPagination =
    pagination !== false
      ? {
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total: number) => `共 ${total} 条`,
          ...pagination,
        }
      : false;

  return (
    <PageLayout
      title={title}
      titleExtra={titleExtra}
      headerContent={headerContent}
      filterLeft={filterLeft}
      filterRight={filterRight}
      wrapper="card"
      {...pageLayoutProps}
    >
      <div className="std-data-page-table-wrapper">
        <ResizableTable
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          rowKey={rowKey}
          pagination={finalPagination}
          onChange={onChange}
          onRow={onRow}
          scroll={scroll}
          rowClassName={rowClassName}
          locale={{ emptyText: <span style={{ color: 'var(--color-text-quaternary)' }}>{emptyText}</span> }}
        />
        {tableExtra}
      </div>
      {children}
    </PageLayout>
  );
}

export type { SearchFilterField, StandardSearchOption };
export default StandardDataPage;