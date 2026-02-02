import React, { useState } from 'react';
import { Card } from 'antd';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { MaterialQueryParams } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { Dayjs } from 'dayjs';

interface MaterialSearchFormProps {
  queryParams: MaterialQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<MaterialQueryParams>>;
  onSearch: () => void;
  onReset: () => void;
}

const MaterialSearchForm: React.FC<MaterialSearchFormProps> = ({
  queryParams,
  setQueryParams,
  onSearch,
  onReset,
}) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const handleSearchChange = (value: string) => {
    setQueryParams(prev => ({ ...prev, orderNo: value, page: 1 }));
    if (value) {
      onSearch();
      return;
    }
    onReset();
  };

  const handleStatusChange = (value: string) => {
    setQueryParams(prev => ({ ...prev, status: value, page: 1 }));
    onSearch();
  };

  return (
    <Card size="small" className="filter-card mb-sm">
      <StandardSearchBar
        searchValue={queryParams.orderNo || ''}
        onSearchChange={handleSearchChange}
        searchPlaceholder="搜索订单号/采购单号/物料"
        dateValue={dateRange}
        onDateChange={setDateRange}
        statusValue={queryParams.status || ''}
        onStatusChange={handleStatusChange}
        statusOptions={[
          { label: '待采购', value: MATERIAL_PURCHASE_STATUS.PENDING },
          { label: '已领取', value: MATERIAL_PURCHASE_STATUS.RECEIVED },
          { label: '部分到货', value: MATERIAL_PURCHASE_STATUS.PARTIAL },
          { label: '全部到货', value: MATERIAL_PURCHASE_STATUS.COMPLETED },
          { label: '已取消', value: MATERIAL_PURCHASE_STATUS.CANCELLED },
        ]}
      />
    </Card>
  );
};

export default MaterialSearchForm;
