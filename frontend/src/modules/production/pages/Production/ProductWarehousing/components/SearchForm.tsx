import React, { useState } from 'react';
import { Card } from 'antd';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { WarehousingQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';

interface SearchFormProps {
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  onSearch: () => void;
}

const SearchForm: React.FC<SearchFormProps> = ({ queryParams, setQueryParams, onSearch }) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

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
      <StandardSearchBar
        searchValue={queryParams.warehousingNo || ''}
        onSearchChange={handleSearchChange}
        searchPlaceholder="搜索质检入库号/订单号/款号"
        dateValue={dateRange}
        onDateChange={setDateRange}
        statusValue={queryParams.warehouse || ''}
        onStatusChange={handleStatusChange}
        statusOptions={[
          { label: 'A仓', value: 'A仓' },
          { label: 'B仓', value: 'B仓' },
        ]}
      />
    </Card>
  );
};

export default SearchForm;
