import React from 'react';
import { Button, Select, Space } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import type { ProductionQueryParams } from '@/types/production';

type FilterBarBaseProps = {
  queryParams: ProductionQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<ProductionQueryParams>>;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  setDateRange: (range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
  statusOptions: Array<{ label: string; value: string }>;
  factoryTypeOptions: Array<{ label: string; value: string }>;
  viewMode: 'list' | 'card';
  setViewMode: (mode: 'list' | 'card') => void;
  dateSortAsc: boolean;
  toggleDateSort: () => void;
};

export const FilterSearchSection: React.FC<FilterBarBaseProps> = ({
  queryParams, setQueryParams, dateRange, setDateRange, statusOptions, factoryTypeOptions,
}) => (
  <>
    <StandardSearchBar
      searchValue={String(queryParams.keyword || '')}
      onSearchChange={(value) => setQueryParams((prev) => ({ ...prev, page: 1, keyword: value, orderNo: undefined, styleNo: undefined, factoryName: undefined }))}
      searchPlaceholder="搜索订单号/款号/工厂"
      dateValue={dateRange}
      onDateChange={(value) => setDateRange(value)}
      statusValue={String(queryParams.status || '')}
      onStatusChange={(value) => setQueryParams((prev) => ({ ...prev, page: 1, status: value || undefined, includeScrapped: value === 'scrapped' ? true : undefined, excludeTerminal: value ? undefined : true }))}
      statusOptions={statusOptions}
    />
    <Select value={queryParams.factoryType || ''} onChange={(value) => setQueryParams((prev) => ({ ...prev, factoryType: (value || undefined) as ProductionQueryParams['factoryType'], page: 1 }))} placeholder="内外标签" allowClear style={{ minWidth: 110 }} options={factoryTypeOptions} />
    <Select value={queryParams.urgencyLevel || ''} onChange={(value) => setQueryParams((prev) => ({ ...prev, urgencyLevel: value || undefined, page: 1 }))} placeholder="紧急程度" allowClear style={{ minWidth: 110 }} options={[{ label: '全部紧急度', value: '' }, { label: ' 急单', value: 'urgent' }, { label: '普通', value: 'normal' }]} />
  </>
);

export const FilterRightSection: React.FC<Pick<FilterBarBaseProps, 'viewMode' | 'setViewMode' | 'dateSortAsc' | 'toggleDateSort'> & { onRefresh?: () => void }> = ({
  viewMode, setViewMode, dateSortAsc, toggleDateSort, onRefresh,
}) => (
  <Space>
    {onRefresh && <Button onClick={onRefresh}>刷新</Button>}
    <Button icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />} onClick={toggleDateSort} title={dateSortAsc ? '按时间升序（最早在前）' : '按时间降序（最新在前）'} shape="circle" />
    <Button icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />} onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}>{viewMode === 'list' ? '卡片视图' : '列表视图'}</Button>
  </Space>
);

type EmbeddedFilterBarProps = FilterBarBaseProps & { onReset?: () => void };

export const EmbeddedFilterBar: React.FC<EmbeddedFilterBarProps> = (props) => (
  <StandardToolbar
    left={<FilterSearchSection {...props} />}
    right={props.onReset ? <Button onClick={props.onReset}>重置</Button> : undefined}
  />
);
