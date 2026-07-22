import React from 'react';
import { Tabs } from 'antd';
import OrderRankingDashboard from './OrderRankingDashboard';
import OrderAnalysisTab from './OrderAnalysisTab';
import OrderListContent from './OrderListContent';
import type { StyleInfo } from '@/types/style';
import type { StyleQueryParams } from '@/types/style';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

interface OrderManagementTabsProps {
  viewMode: 'table' | 'card';
  setViewMode: (v: 'table' | 'card') => void;
  queryParams: StyleQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<StyleQueryParams>>;
  styles: StyleInfo[];
  total: number;
  loading: boolean;
  columns: any[];
  cardColumns: number;
  openCreate: (style?: StyleInfo) => void;
  fetchStyles: () => void;
  onNoDataOrder: () => void;
  styleFieldConfigs: FieldConfigItem[];
  onGoToFieldConfig: () => void;
}

const OrderManagementTabs: React.FC<OrderManagementTabsProps> = ({
  viewMode,
  setViewMode,
  queryParams,
  setQueryParams,
  styles,
  total,
  loading,
  columns,
  cardColumns,
  openCreate,
  fetchStyles,
  onNoDataOrder,
  styleFieldConfigs,
  onGoToFieldConfig,
}) => {
  return (
    <Tabs defaultActiveKey="list" items={[
      {
        key: 'list',
        label: '下单管理',
        children: (
          <>
            <OrderRankingDashboard onOrderClick={openCreate} />
            <OrderListContent
              viewMode={viewMode}
              setViewMode={setViewMode}
              queryParams={queryParams}
              setQueryParams={setQueryParams}
              styles={styles}
              total={total}
              loading={loading}
              columns={columns as any}
              cardColumns={cardColumns}
              openCreate={openCreate}
              fetchStyles={fetchStyles}
              onNoDataOrder={onNoDataOrder}
              styleFieldConfigs={styleFieldConfigs}
              onGoToFieldConfig={onGoToFieldConfig}
            />
          </>
        ),
      },
      { key: 'analysis', label: '数据分析', children: <OrderAnalysisTab /> },
    ]} />
  );
};

export default OrderManagementTabs;
