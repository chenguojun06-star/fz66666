/**
 * FilterPanel - 生产订单筛选面板
 * 功能：订单号/款号/加工厂/状态筛选、日期范围、批量导出
 */
import React from 'react';
import { Button, Card, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { ProductionQueryParams } from '@/types/production';
import type { Dayjs } from 'dayjs';

interface FilterPanelProps {
  filters: any;
  onSearch: (params: any) => void;
  onReset: () => void;
  onExport?: () => void;
  selectedCount?: number;
  loading?: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onSearch,
  onReset,
  onExport,
  selectedCount = 0,
  loading = false,
}) => {
  const [localParams, setLocalParams] = React.useState<any>(filters);

  React.useEffect(() => {
    setLocalParams(filters);
  }, [filters]);

  const handleReset = () => {
    const resetParams: ProductionQueryParams = {
      page: 1,
      pageSize: localParams?.pageSize || 10,
    };
    setLocalParams(resetParams);
    onReset();
  };

  const updateParams = (partial: Partial<ProductionQueryParams>) => {
    const nextParams = {
      ...localParams,
      ...partial,
      page: 1,
    };
    setLocalParams(nextParams);
    onSearch(nextParams);
  };

  const [dateRange, setDateRange] = React.useState<[Dayjs | null, Dayjs | null] | null>(null);

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <StandardSearchBar
          searchValue={localParams.orderNo || ''}
          onSearchChange={(value) => updateParams({ orderNo: value })}
          searchPlaceholder="搜索订单号/款号/加工厂"
          dateValue={dateRange}
          onDateChange={(value) => {
            setDateRange(value);
            if (value && value[0] && value[1]) {
              updateParams({
                startDate: value[0].format('YYYY-MM-DD'),
                endDate: value[1].format('YYYY-MM-DD'),
              });
              return;
            }
            updateParams({ startDate: undefined, endDate: undefined });
          }}
          statusValue={localParams.status || ''}
          onStatusChange={(value) => updateParams({ status: value })}
          statusOptions={[
            { label: '待生产', value: 'pending' },
            { label: '生产中', value: 'production' },
            { label: '已完成', value: 'completed' },
            { label: '已逾期', value: 'delayed' },
          ]}
        />

        <Space wrap>
          <Button onClick={handleReset}>
            重置
          </Button>
          {onExport && (
            <Button
              icon={<DownloadOutlined />}
              onClick={onExport}
              disabled={selectedCount === 0}
            >
              导出 {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  );
};

export default FilterPanel;
