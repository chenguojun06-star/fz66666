import React, { useState } from 'react';
import { Button, Select, Segmented, Space } from 'antd';

import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
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
  };

  const handleStatusChange = (value: string) => {
    setQueryParams(prev => ({ ...prev, status: value, page: 1 }));
    onSearch();
  };

  return (
    <StickyFilterBar>
      <StandardToolbar
        left={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StandardSearchBar
              searchValue={queryParams.orderNo || ''}
              onSearchChange={handleSearchChange}
              searchPlaceholder="搜索订单号/采购单号/物料/供应商"
              dateValue={dateRange}
              onDateChange={setDateRange}
              statusValue={queryParams.status || ''}
              onStatusChange={handleStatusChange}
              statusOptions={[
                { label: '全部', value: '' },
                { label: '待采购', value: MATERIAL_PURCHASE_STATUS.PENDING },
                { label: '已采购', value: MATERIAL_PURCHASE_STATUS.RECEIVED },
                { label: '部分到货', value: MATERIAL_PURCHASE_STATUS.PARTIAL },
                { label: '全部到货', value: MATERIAL_PURCHASE_STATUS.COMPLETED },
                { label: '已取消', value: MATERIAL_PURCHASE_STATUS.CANCELLED },
                { label: '对账中', value: 'reconciling' },
              ]}
              showSearchButton
              onSearch={onSearch}
              showResetButton
              onReset={onReset}
            />
            <Select
              value={queryParams.factoryType || ''}
              onChange={(value) => {
                setQueryParams(prev => ({ ...prev, factoryType: value as 'INTERNAL' | 'EXTERNAL' | '', page: 1 }));
                onSearch();
              }}
              options={[
                { label: '全部工厂', value: '' },
                { label: '内部工厂', value: 'INTERNAL' },
                { label: '外发工厂', value: 'EXTERNAL' },
              ]}
              style={{ width: 132 }}
              placeholder="工厂类型"
            />
            <Select
              value={queryParams.sourceType || ''}
              onChange={(value) => {
                setQueryParams(prev => ({ ...prev, sourceType: value as 'order' | 'sample' | 'batch' | '', page: 1 }));
                onSearch();
              }}
              options={[
                { label: '采购类型', value: '' },
                { label: '订单', value: 'order' },
                { label: '样衣', value: 'sample' },
                { label: '批量采购', value: 'batch' },
              ]}
              style={{ width: 110 }}
            />
            <Segmented
              value={queryParams.materialType || ''}
              options={[
                { label: '面料', value: 'fabric' },
                { label: '里料', value: 'lining' },
                { label: '辅料', value: 'accessory' },
                { label: '全部', value: '' },
              ]}
              onChange={(value) => {
                setQueryParams(prev => ({ ...prev, materialType: String(value), page: 1 }));
                onSearch();
              }}
            />
          </div>
        )}
        right={(
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
        )}
      />
    </StickyFilterBar>
  );
};

export default MaterialSearchForm;
