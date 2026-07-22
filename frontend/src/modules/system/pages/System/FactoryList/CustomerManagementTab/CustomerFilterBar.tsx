import React from 'react';
import { Button, Card, Input, Select, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import SchemaPrint from '@/components/common/SchemaPrint';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { Customer } from '@/services/crm/customerApi';
import { CUSTOMER_LEVEL_OPTIONS, CUSTOMER_STATUS_OPTIONS, type CustomerQueryParams } from './customerHelpers';

interface CustomerFilterBarProps {
  queryParams: CustomerQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<CustomerQueryParams>>;
  setKeywordInput: (v: string) => void;
  fieldConfigs: FieldConfigItem[];
  customers: Customer[];
  total: number;
  onGoToFieldConfig: () => void;
  onCreate: () => void;
}

const CustomerFilterBar: React.FC<CustomerFilterBarProps> = ({
  queryParams, setQueryParams, setKeywordInput,
  fieldConfigs, customers, total,
  onGoToFieldConfig, onCreate,
}) => {
  return (
    <Card className="filter-card mb-sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
        <Space wrap size={12}>
          <Input
            placeholder="客户名称/联系人/电话"
            style={{ width: 240 }}
            allowClear
            value={queryParams.keyword || ''}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
          <Select
            placeholder="客户标签"
            style={{ width: 160 }}
            allowClear
            value={queryParams.customerLevel || undefined}
            options={CUSTOMER_LEVEL_OPTIONS}
            onChange={(value) => setQueryParams((prev) => ({ ...prev, customerLevel: value, page: 1 }))}
          />
          <Select
            placeholder="状态"
            style={{ width: 140 }}
            allowClear
            value={queryParams.status || undefined}
            options={CUSTOMER_STATUS_OPTIONS}
            onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value, page: 1 }))}
          />
          <Button type="primary" onClick={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}>
            查询
          </Button>
          <Button
            onClick={() =>
              setQueryParams((prev) => ({
                page: 1,
                pageSize: prev.pageSize,
                keyword: '',
                status: '',
                customerLevel: '',
              }))
            }
          >
            重置
          </Button>
        </Space>
        <Space>
          <a onClick={onGoToFieldConfig} style={{ fontSize: 13 }}>
            <SettingOutlined /> 字段配置
          </a>
          <SchemaPrint
            mode="list"
            fields={fieldConfigs}
            data={customers as unknown as Record<string, unknown>[]}
            title="客户列表"
            subtitle={`共 ${total} 条记录`}
            buttonText="打印列表"
            type="default"
          />
          <Button type="primary" onClick={onCreate}>
            新增客户
          </Button>
        </Space>
      </div>
    </Card>
  );
};

export default CustomerFilterBar;
