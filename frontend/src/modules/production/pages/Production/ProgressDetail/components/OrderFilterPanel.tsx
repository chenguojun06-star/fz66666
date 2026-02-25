/**
 * OrderFilterPanel - 订单筛选面板组件
 * 功能：订单号、款号、状态筛选、日期范围选择
 */
import React, { useState } from 'react';
import { Button, Space, Card } from 'antd';

import StandardSearchBar from '@/components/common/StandardSearchBar';
import type { Dayjs } from 'dayjs';

interface OrderFilterPanelProps {
  onSearch: (filters: any) => void;
  onReset: () => void;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
}

const OrderFilterPanel: React.FC<OrderFilterPanelProps> = ({
  onSearch,
  onReset,
  dateRange,
  onDateRangeChange,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [statusValue, setStatusValue] = useState('');

  const handleSearch = (value: string) => {
    setSearchValue(value);
    onSearch({ orderNo: value, status: statusValue });
  };

  const handleReset = () => {
    setSearchValue('');
    setStatusValue('');
    onDateRangeChange(null);
    onReset();
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <StandardSearchBar
          searchValue={searchValue}
          onSearchChange={handleSearch}
          searchPlaceholder="搜索订单号/款号"
          dateValue={dateRange}
          onDateChange={onDateRangeChange}
          statusValue={statusValue}
          onStatusChange={(value) => {
            setStatusValue(value);
            onSearch({ orderNo: searchValue, status: value });
          }}
          statusOptions={[
            { label: '全部', value: '' },
            { label: '待生产', value: 'pending' },
            { label: '生产中', value: 'in_progress' },
            { label: '已完成', value: 'completed' },
            { label: '已取消', value: 'cancelled' },
          ]}
        />
        <Space>
          <Button onClick={handleReset}>
            重置
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default OrderFilterPanel;
