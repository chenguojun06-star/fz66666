import React from 'react';
import { Button, Select, Popover, Checkbox, Segmented } from 'antd';
import { SettingOutlined, AppstoreOutlined, UnorderedListOutlined, RadarChartOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import ExportButton from '@/components/common/ExportButton';
import { useCustomerOptions } from '@/hooks/useCustomerOptions';
import { ProductionQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';

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
    visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions,
    viewMode, setViewMode, factoryTypeOptions,
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
          onStatusChange={(value) => setQueryParams({ ...queryParams, status: value || undefined, includeScrapped: value === 'scrapped' ? true : queryParams.includeScrapped, excludeTerminal: value ? undefined : true, page: 1 })}
          statusOptions={[
            { label: '全部', value: '' },
            { label: '待生产', value: 'pending' },
            { label: '生产中', value: 'production' },
            { label: '已完成', value: 'completed' },
            { label: '已报废', value: 'scrapped' },
            { label: '已逾期', value: 'delayed' },
            { label: '已取消', value: 'cancelled' },
          ]}
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
        <Popover
          trigger="click"
          placement="bottomRight"
          overlayStyle={{ padding: 0 }}
          styles={{ container: { maxHeight: '70vh', overflowY: 'auto', minWidth: 200, padding: 0 } }}
          content={(
            <div>
              <div style={{ fontWeight: 600, color: 'var(--neutral-text-secondary)', padding: '8px 16px 4px' }}>选择要显示的列</div>
              <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
              {columnOptions.map(opt => (
                <div key={opt.key} style={{ padding: '4px 16px' }}>
                  <Checkbox
                    checked={visibleColumns[opt.key] === true}
                    onChange={() => toggleColumnVisible(opt.key)}
                  >
                    {opt.label}
                  </Checkbox>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
              <div
                style={{ color: 'var(--primary-color)', textAlign: 'center', cursor: 'pointer', padding: '6px 16px' }}
                onClick={() => resetColumnSettings()}
              >
                重置为默认
              </div>
            </div>
          )}
        >
          <Button icon={<SettingOutlined />}>列设置</Button>
        </Popover>
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
