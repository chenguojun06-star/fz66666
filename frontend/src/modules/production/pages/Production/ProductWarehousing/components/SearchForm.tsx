import React, { useEffect, useState } from 'react';
import { Card } from 'antd';
import api from '@/utils/api';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import { WarehousingQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';

interface SearchFormProps {
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  onSearch: () => void;
  extra?: React.ReactNode;
}

const SearchForm: React.FC<SearchFormProps> = ({ queryParams, setQueryParams, onSearch, extra }) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<{ label: string; value: string }[]>([
    { label: 'A仓', value: 'A仓' }, { label: 'B仓', value: 'B仓' },
  ]);

  useEffect(() => {
    api.get<{ code: number; data: { records?: { dictCode: string; dictLabel: string }[] } }>(
      '/system/dict/list', { params: { dictType: 'warehouse_location', page: 1, pageSize: 100 } }
    ).then(res => {
      if (res.code === 200) {
        const records = (res.data as any)?.records || [];
        if (records.length) setWarehouseOptions(records.map((r: any) => ({ label: r.dictLabel, value: r.dictLabel })));
      }
    }).catch(() => {});
  }, []);

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
          <StandardSearchBar
            searchValue={queryParams.warehousingNo || ''}
            onSearchChange={handleSearchChange}
            searchPlaceholder="搜索质检入库号/订单号/款号"
            dateValue={dateRange}
            onDateChange={setDateRange}
            statusValue={queryParams.warehouse || ''}
            onStatusChange={handleStatusChange}
            statusOptions={[
              { label: '全部', value: '' },
              ...warehouseOptions,
            ]}
          />
        )}
        right={extra}
      />
    </Card>
  );
};

export default SearchForm;
