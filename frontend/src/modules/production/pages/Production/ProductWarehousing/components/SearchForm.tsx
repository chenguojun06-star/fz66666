import React, { useState } from 'react';
import { Card } from 'antd';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import { Select } from 'antd';
import { WarehousingQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import { useWarehouseLocationOptions } from '@/hooks/useWarehouseLocationOptions';

interface SearchFormProps {
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  onSearch: () => void;
  extra?: React.ReactNode;
}

const SearchForm: React.FC<SearchFormProps> = ({ queryParams, setQueryParams, onSearch, extra }) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const { factoryTypeOptions } = useOrganizationFilterOptions();
  const { warehouseSelectOptions } = useWarehouseLocationOptions();

  const handleSearchChange = (value: string) => {
    setQueryParams({ ...queryParams, warehousingNo: value, page: 1 });
    if (value) {
      onSearch();
    }
  };

  const handleStatusChange = (value: string) => {
    setQueryParams({ ...queryParams, warehouse: value, page: 1 });
    onSearch();
  };

  return (
    <Card size="small" className="filter-card mb-sm">
      <StandardToolbar
        left={(
          <>
            <StandardSearchBar
              searchValue={queryParams.warehousingNo || ''}
              onSearchChange={handleSearchChange}
              searchPlaceholder="搜索质检入库号/订单号/款号/工厂名"
              dateValue={dateRange}
              onDateChange={setDateRange}
              statusValue={queryParams.warehouse || ''}
              onStatusChange={handleStatusChange}
              statusOptions={[
                { label: '全部', value: '' },
                ...warehouseSelectOptions,
              ]}
            />
            <Select
              value={queryParams.factoryType || ''}
              onChange={(value) => {
                setQueryParams({
                  ...queryParams,
                  factoryType: (value || undefined) as WarehousingQueryParams['factoryType'],
                  page: 1,
                });
                onSearch();
              }}
              placeholder="内外标签"
              allowClear
              style={{ minWidth: 110 }}
              options={factoryTypeOptions}
            />
          </>
        )}
        right={extra}
      />
    </Card>
  );
};

export default SearchForm;
