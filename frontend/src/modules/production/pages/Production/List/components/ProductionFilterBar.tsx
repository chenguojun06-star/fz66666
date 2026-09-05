import React from 'react';
import { Button, Select, Segmented } from 'antd';
import { SettingOutlined, AppstoreOutlined, UnorderedListOutlined, RadarChartOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import ExportButton from '@/components/common/ExportButton';
import { useCustomerOptions } from '@/hooks/useCustomerOptions';
import { ProductionQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';
import { displayOrderStatus } from '@/utils/display';

// 按业务顺序排列的生产订单状态筛选选项
const PRODUCTION_STATUS_VALUES = [
  'not_started',
  'pending',
  'production',
  'delayed',
  'paused',
  'returned',
  'completed',
  'cancelled',
  'closed',
  'scrapped',
  'archived',
];

const buildProductionStatusOptions = () => {
  const options = PRODUCTION_STATUS_VALUES.map((value) => {
    const { text } = displayOrderStatus(value);
    // 与 displayOrderStatus 保持一致，如果 text 回退为 value 本身，保持原值
    return { label: text, value };
  });
  return [{ label: '全部', value: '' }, ...options];
};

type DateRange = [Dayjs | null, Dayjs | null] | null;

interface ProductionFilterBarProps {
  queryParams: ProductionQueryParams;
  setQueryParams: (params: ProductionQueryParams) => void;
  dateRange: DateRange;
  setDateRange: React.Dispatch<React.SetStateAction<DateRange>>;
  fetchProductionList: () => Promise<void>;
  visibleColumns: Record<string, boolean>;
  toggleColumnVisible: (key: string) => void;
  resetColumnSettings: () => void;
  columnOptions: Array<{ key: string; label: string }>;
  viewMode: string;
  setViewMode: (mode: string) => void;
  factoryTypeOptions: Array<{ label: string; value: string }>;
  openColumnSettings: () => void;
}

const CustomerFilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const { customers } = useCustomerOptions();
  return (
    <Select
      value={value || ''}
      onChange={onChange}
      placeholder="客户"
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ minWidth: 130 }}
      options={[
        { label: '全部客户', value: '' },
        ...customers.map((c) => ({ label: c.companyName, value: c.id })),
      ]}
    />
  );
};

function buildFilterBar(props: ProductionFilterBarProps) {
  const {
    queryParams, setQueryParams, dateRange, setDateRange, fetchProductionList,
    viewMode, setViewMode, factoryTypeOptions, openColumnSettings,
  } = props;

  return {
    filterLeft: (
      <>
        <StandardSearchBar
          searchValue={queryParams.keyword || ''}
          onSearchChange={(value) => setQueryParams({ ...queryParams, keyword: value, page: 1 })}
          searchPlaceholder="搜索订单号/款号/加工厂"
          dateValue={dateRange}
          onDateChange={setDateRange}
          statusValue={queryParams.status || ''}
          onStatusChange={(value) => setQueryParams({ ...queryParams, status: value || undefined, includeScrapped: value === 'scrapped' ? true : queryParams.includeScrapped, excludeTerminal: undefined, page: 1 })}
          statusOptions={buildProductionStatusOptions()}
        />
        <Select
          value={queryParams.factoryType || ''}
          onChange={(value) =>
            setQueryParams({
              ...queryParams,
              factoryType: (value || undefined) as ProductionQueryParams['factoryType'],
              page: 1,
            })
          }
          placeholder="内外标签"
          allowClear
          style={{ minWidth: 110 }}
          options={factoryTypeOptions}
        />
        <Select
          value={queryParams.urgencyLevel || ''}
          onChange={(value) => setQueryParams({ ...queryParams, urgencyLevel: value || undefined, page: 1 })}
          placeholder="紧急程度"
          allowClear
          style={{ minWidth: 110 }}
          options={[
            { label: '全部紧急度', value: '' },
            { label: ' 急单', value: 'urgent' },
            { label: '普通', value: 'normal' },
          ]}
        />
        <Select
          value={queryParams.plateType || ''}
          onChange={(value) => setQueryParams({ ...queryParams, plateType: value || undefined, page: 1 })}
          placeholder="首/翻单"
          allowClear
          style={{ minWidth: 110 }}
          options={[
            { label: '全部单型', value: '' },
            { label: '首单', value: 'FIRST' },
            { label: '翻单', value: 'REORDER' },
          ]}
        />
        <CustomerFilterSelect
          value={queryParams.customerId || ''}
          onChange={(value) => setQueryParams({ ...queryParams, customerId: value || undefined, page: 1 })}
        />
      </>
    ),
    filterRight: (
      <>
        <Button onClick={() => void fetchProductionList()}>刷新</Button>
        <Button icon={<SettingOutlined />} onClick={openColumnSettings}>列设置</Button>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as 'list' | 'card' | 'smart')}
          options={[
            { value: 'list', icon: <UnorderedListOutlined /> },
            { value: 'card', icon: <AppstoreOutlined /> },
            { value: 'smart', icon: <RadarChartOutlined /> },
          ]}
        />
        <ExportButton
          label="导出"
          url="/api/production/order/export-excel"
          params={queryParams as unknown as Record<string, string>}
          type="primary"
          size="middle"
        />
      </>
    ),
  };
}

export default buildFilterBar;
