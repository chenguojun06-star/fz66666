import React, { useEffect, useState } from 'react';
import { Card } from 'antd';
import api from '@/utils/api';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import { Select } from 'antd';
import { WarehousingQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';

interface SearchFormProps {
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  onSearch: () => void;
  extra?: React.ReactNode;
}

const SearchForm: React.FC<SearchFormProps> = ({ queryParams, setQueryParams, onSearch, extra }) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const { departmentOptions, factoryTypeOptions } = useOrganizationFilterOptions();
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
          <>
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
            <Select
              value={queryParams.parentOrgUnitId || ''}
              onChange={(value) => {
                setQueryParams({ ...queryParams, parentOrgUnitId: value || undefined, page: 1 });
                onSearch();
              }}
              placeholder="归属部门"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 130 }}
              options={departmentOptions}
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
