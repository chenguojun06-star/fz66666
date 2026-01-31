/**
 * OrderFilterPanel - 订单筛选面板组件
 * 功能：订单号、款号、状态筛选、日期范围选择
 */
import React from 'react';
import { Form, Input, Select, Button, Space, Card } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import dayjs from 'dayjs';

interface OrderFilterPanelProps {
  onSearch: (filters: any) => void;
  onReset: () => void;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  onDateRangeChange: (range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
}

const OrderFilterPanel: React.FC<OrderFilterPanelProps> = ({
  onSearch,
  onReset,
  dateRange,
  onDateRangeChange,
}) => {
  const [form] = Form.useForm();

  const handleSearch = () => {
    const values = form.getFieldsValue();
    onSearch(values);
  };

  const handleReset = () => {
    form.resetFields();
    onDateRangeChange(null);
    onReset();
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Form form={form} layout="inline">
        <Form.Item name="orderNo" label="订单号">
          <Input
            placeholder="请输入订单号"
            allowClear
            style={{ width: 200 }}
          />
        </Form.Item>

        <Form.Item name="styleNo" label="款号">
          <Input
            placeholder="请输入款号"
            allowClear
            style={{ width: 200 }}
          />
        </Form.Item>

        <Form.Item name="status" label="状态">
          <Select
            placeholder="请选择状态"
            allowClear
            style={{ width: 150 }}
            options={[
              { label: '待生产', value: 'pending' },
              { label: '生产中', value: 'in_progress' },
              { label: '已完成', value: 'completed' },
              { label: '已取消', value: 'cancelled' },
            ]}
          />
        </Form.Item>

        <Form.Item label="日期范围">
          <UnifiedRangePicker
            value={dateRange}
            onChange={onDateRangeChange}
            style={{ width: 260 }}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
            >
              搜索
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReset}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default OrderFilterPanel;
