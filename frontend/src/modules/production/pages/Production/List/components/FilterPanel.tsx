/**
 * FilterPanel - 生产订单筛选面板
 * 功能：订单号/款号/加工厂/状态筛选、日期范围、批量导出
 */
import React from 'react';
import { Button, Card, Input, Select, Space, DatePicker } from 'antd';
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import { ProductionQueryParams } from '@/types/production';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface FilterPanelProps {
  queryParams: ProductionQueryParams;
  onSearch: (params: ProductionQueryParams) => void;
  onReset: () => void;
  onExport?: () => void;
  selectedCount?: number;
  loading?: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  queryParams,
  onSearch,
  onReset,
  onExport,
  selectedCount = 0,
  loading = false,
}) => {
  const [localParams, setLocalParams] = React.useState<ProductionQueryParams>(queryParams);

  React.useEffect(() => {
    setLocalParams(queryParams);
  }, [queryParams]);

  const handleSearch = () => {
    onSearch(localParams);
  };

  const handleReset = () => {
    const resetParams: ProductionQueryParams = {
      page: 1,
      pageSize: queryParams.pageSize || 10,
    };
    setLocalParams(resetParams);
    onReset();
  };

  const handleFieldChange = (field: keyof ProductionQueryParams, value: any) => {
    setLocalParams(prev => ({
      ...prev,
      [field]: value,
      page: 1, // 修改筛选条件时重置页码
    }));
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 第一行：主要筛选条件 */}
        <Space wrap>
          <Input
            placeholder="订单号"
            value={localParams.orderNo || ''}
            onChange={(e) => handleFieldChange('orderNo', e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 160 }}
            allowClear
          />
          <Input
            placeholder="款号"
            value={localParams.styleNo || ''}
            onChange={(e) => handleFieldChange('styleNo', e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 160 }}
            allowClear
          />
          <Input
            placeholder="款名"
            value={localParams.styleName || ''}
            onChange={(e) => handleFieldChange('styleName', e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 160 }}
            allowClear
          />
          <Input
            placeholder="加工厂"
            value={localParams.factoryName || ''}
            onChange={(e) => handleFieldChange('factoryName', e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 160 }}
            allowClear
          />
          <Select
            placeholder="状态"
            value={localParams.status || undefined}
            onChange={(value) => handleFieldChange('status', value)}
            style={{ width: 120 }}
            allowClear
          >
            <Option value="pending">待生产</Option>
            <Option value="production">生产中</Option>
            <Option value="completed">已完成</Option>
            <Option value="delayed">已逾期</Option>
          </Select>
        </Space>

        {/* 第二行：日期筛选和操作按钮 */}
        <Space wrap>
          <RangePicker
            value={
              localParams.startDate && localParams.endDate
                ? [dayjs(localParams.startDate), dayjs(localParams.endDate)]
                : null
            }
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                handleFieldChange('startDate', dates[0].format('YYYY-MM-DD'));
                handleFieldChange('endDate', dates[1].format('YYYY-MM-DD'));
              } else {
                setLocalParams(prev => {
                  const { startDate, endDate, ...rest } = prev;
                  return rest;
                });
              }
            }}
            placeholder={['开始日期', '结束日期']}
            style={{ width: 240 }}
          />

          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
          >
            搜索
          </Button>

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
