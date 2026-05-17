import React from 'react';
import { Button, Card, Input, Select, Space } from 'antd';
import type { OrganizationUnit, FactoryQueryParams } from '@/types/system';
import { getDepartmentLabel } from '../factoryListHelpers';

interface FactoryFilterBarProps {
  queryParams: FactoryQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<FactoryQueryParams>>;
  setFactoryCodeInput: (v: string) => void;
  setFactoryNameInput: (v: string) => void;
  departmentOptions: OrganizationUnit[];
  activeTab: 'ALL' | 'MATERIAL' | 'OUTSOURCE';
  onCreate: () => void;
}

const FactoryFilterBar: React.FC<FactoryFilterBarProps> = ({
  queryParams, setQueryParams, setFactoryCodeInput, setFactoryNameInput,
  departmentOptions, activeTab, onCreate,
}) => {
  return (
    <Card className="filter-card mb-sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
        <Space wrap size={12}>
          <Input
            placeholder="供应商编码"
            style={{ width: 180 }}
            allowClear
            value={String((queryParams as any)?.factoryCode || '')}
            onChange={(e) => setFactoryCodeInput(e.target.value)}
          />
          <Input
            placeholder="供应商名称"
            style={{ width: 220 }}
            allowClear
            value={String((queryParams as any)?.factoryName || '')}
            onChange={(e) => setFactoryNameInput(e.target.value)}
          />
          <Select
            placeholder="状态"
            style={{ width: 140 }}
            allowClear
            value={String((queryParams as any)?.status || '') || undefined}
            options={[
              { value: 'active', label: '启用' },
              { value: 'inactive', label: '停用' },
            ]}
            onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value, page: 1 }))}
          />
          <Select
            placeholder="内外标签"
            style={{ width: 140 }}
            allowClear
            value={String((queryParams as any)?.factoryType || '') || undefined}
            options={[
              { value: 'INTERNAL', label: '内部' },
              { value: 'EXTERNAL', label: '外部' },
            ]}
            onChange={(value) => setQueryParams((prev) => ({ ...prev, factoryType: value, page: 1 }))}
          />
          <Select
            placeholder="归属部门"
            style={{ width: 220 }}
            allowClear
            value={String((queryParams as any)?.parentOrgUnitId || '') || undefined}
            options={departmentOptions.map((item) => ({
              value: String(item.id || ''),
              label: getDepartmentLabel(item),
            }))}
            onChange={(value) => setQueryParams((prev) => ({ ...prev, parentOrgUnitId: value, page: 1 }))}
          />
          <Button type="primary" onClick={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}>
            查询
          </Button>
          <Button
            onClick={() =>
              setQueryParams({
                page: 1,
                pageSize: queryParams.pageSize,
                supplierType: activeTab === 'ALL' ? undefined : activeTab,
              })
            }
          >
            重置
          </Button>
        </Space>
        <Button type="primary" onClick={onCreate}>
          {activeTab === 'OUTSOURCE' ? '新增外发供应商' : '新增面辅料供应商'}
        </Button>
      </div>
    </Card>
  );
};

export default FactoryFilterBar;
