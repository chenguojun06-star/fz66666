import React, { useState } from 'react';
import { Button, Card, Space } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { MaterialQueryParams } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { Dayjs } from 'dayjs';

interface MaterialSearchFormProps {
  queryParams: MaterialQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<MaterialQueryParams>>;
  onSearch: () => void;
  onReset: () => void;
  onExport: () => void;
  onAdd: () => void;
  loading?: boolean;
  hasData?: boolean;
}

const MaterialSearchForm: React.FC<MaterialSearchFormProps> = ({
  queryParams,
  setQueryParams,
  onSearch,
  onReset,
  onExport,
  onAdd,
  loading = false,
  hasData = false,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <StandardSearchBar
            searchValue={queryParams.orderNo || ''}
            onSearchChange={handleSearchChange}
            searchPlaceholder="搜索订单号/采购单号/物料"
            dateValue={dateRange}
            onDateChange={setDateRange}
            statusValue={queryParams.status || ''}
            onStatusChange={handleStatusChange}
            statusOptions={[
              { label: '全部', value: '' },
              { label: '待采购', value: MATERIAL_PURCHASE_STATUS.PENDING },
              { label: '已领取', value: MATERIAL_PURCHASE_STATUS.RECEIVED },
              { label: '部分到货', value: MATERIAL_PURCHASE_STATUS.PARTIAL },
              { label: '全部到货', value: MATERIAL_PURCHASE_STATUS.COMPLETED },
              { label: '已取消', value: MATERIAL_PURCHASE_STATUS.CANCELLED },
            ]}
          />
        </div>
        <Space wrap>
          <Button
            onClick={onExport}
            disabled={loading || !hasData}
          >
            导出
          </Button>
          <Button type="primary" onClick={onAdd}>
            新增采购单
          </Button>
        </Space>
      </div>
    </Card>
  );
};

export default MaterialSearchForm;
