import React, { useState } from 'react';
import { Button, Card, Space } from 'antd';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { StyleQueryParams } from '@/types/style';
import type { Dayjs } from 'dayjs';

interface StyleFilterPanelProps {
  queryParams: Partial<StyleQueryParams>;
  onQueryChange: (params: Partial<StyleQueryParams>) => void;
  onSearch: () => void;
  loading?: boolean;
}

/**
 * 款式信息筛选面板
 * 包含款号、款名搜索
 */
const StyleFilterPanel: React.FC<StyleFilterPanelProps> = ({
  queryParams,
  onQueryChange,
  onSearch,
  loading = false
}) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [statusValue, setStatusValue] = useState('');

  return (
    <Card size="small" className="filter-card mb-sm">
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <StandardSearchBar
          searchValue={queryParams.styleNo || ''}
          onSearchChange={(value) => {
            onQueryChange({ ...queryParams, styleNo: value });
            onSearch();
          }}
          searchPlaceholder="搜索款号/款名"
          dateValue={dateRange}
          onDateChange={setDateRange}
          statusValue={statusValue}
          onStatusChange={setStatusValue}
          statusOptions={[]}
        />
        <Space>
          <Button type="primary" onClick={onSearch} loading={loading}>
            查询
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default StyleFilterPanel;
