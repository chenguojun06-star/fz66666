import React, { useMemo } from 'react';
import { Card, Space, Input, Button, Alert } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { Sku } from './types';
import { usePricingData } from './hooks/usePricingData';
import { buildPricingColumns } from './columns';

const PricingTab: React.FC = () => {
  const h = usePricingData();

  const handleCostChange = (val: number | null) => {
    h.setEditRow(prev => prev ? { ...prev, costPrice: val } : null);
  };
  const handleSalesChange = (val: number | null) => {
    h.setEditRow(prev => prev ? { ...prev, salesPrice: val } : null);
  };

  const columns = useMemo(
    () => buildPricingColumns({
      editRow: h.editRow,
      saving: h.saving,
      onEdit: (r: Sku) => h.setEditRow({ id: r.id, costPrice: r.costPrice, salesPrice: r.salesPrice }),
      onCancelEdit: () => h.setEditRow(null),
      onSave: h.handleSave,
      onCostChange: handleCostChange,
      onSalesChange: handleSalesChange,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h.editRow, h.saving],
  );

  return (
    <div>
      <Alert style={{ marginBottom: 14, fontSize: 14 }} type="info" showIcon
        title="此处的【单价】和【成本价】将同步显示在成品仓库的单价列和毛利计算中。点击【定价】按钮直接修改，保存后实时生效。" />
      <Card style={{ marginBottom: 10 }}>
        <Space>
          <Input placeholder="按款式号筛选" allowClear style={{ width: 180 }}
            onChange={e => { if (!e.target.value) { h.setStyleNo(''); h.setPage(1); } }}
            onPressEnter={(e) => { h.setStyleNo((e.target as HTMLInputElement).value); h.setPage(1); }}
            suffix={<SearchOutlined />} />
          <Button icon={<ReloadOutlined />} onClick={h.fetchData}>刷新</Button>
        </Space>
      </Card>
      <ResizableTable
        rowKey="id"
        dataSource={h.data}
        columns={columns}
        loading={h.loading}
        stickyHeader
        emptyDescription="暂无SKU数据"
        scroll={{ x: 900 }}
        pagination={{ current: h.page, pageSize: 20, total: h.total,
          showTotal: t => `共 ${t} 个 SKU`,
          onChange: p => h.setPage(p) }}
      />
    </div>
  );
};

export default PricingTab;
