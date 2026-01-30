import React from 'react';
import { Button, Card, Form, Input, Select, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { WarehousingQueryParams } from '@/types/production';

const { Option } = Select;

interface SearchFormProps {
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  onSearch: () => void;
}

const SearchForm: React.FC<SearchFormProps> = ({ queryParams, setQueryParams, onSearch }) => {
  return (
    <Card size="small" className="filter-card mb-sm">
      <Form layout="inline" size="small">
        <Form.Item label="质检入库号">
          <Input
            placeholder="请输入质检入库号"
            value={queryParams.warehousingNo}
            onChange={(e) => setQueryParams({ ...queryParams, warehousingNo: e.target.value })}
            style={{ width: 150 }}
          />
        </Form.Item>
        <Form.Item label="订单号">
          <Input
            placeholder="请输入订单号"
            value={queryParams.orderNo}
            onChange={(e) => setQueryParams({ ...queryParams, orderNo: e.target.value })}
            style={{ width: 150 }}
          />
        </Form.Item>
        <Form.Item label="款号">
          <Input
            placeholder="请输入款号"
            value={queryParams.styleNo}
            onChange={(e) => setQueryParams({ ...queryParams, styleNo: e.target.value })}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item label="仓库">
          <Select
            placeholder="请选择仓库"
            value={queryParams.warehouse}
            onChange={(value) => setQueryParams({ ...queryParams, warehouse: value })}
            style={{ width: 100 }}
            allowClear
          >
            <Option value="">全部</Option>
            <Option value="A仓">A仓</Option>
            <Option value="B仓">B仓</Option>
          </Select>
        </Form.Item>
        <Form.Item className="filter-actions">
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
              查询
            </Button>
            <Button onClick={() => setQueryParams({ page: 1, pageSize: 10 })}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default SearchForm;
