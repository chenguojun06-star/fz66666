import React, { useState } from 'react';
import { Alert, Steps, Tabs } from 'antd';
import {
  ApiOutlined, CarOutlined, EditOutlined,
  RiseOutlined, RollbackOutlined, ShopOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import EcommerceReturnTab from './EcommerceReturnTab';
import OrdersTab from './OrdersTab';
import PricingTab from './PricingTab';
import type { EcOrder } from './types';

const EcommerceOrders: React.FC = () => {
  const [selectedOrder, setSelectedOrder] = useState<EcOrder | null>(null);
  const [activeTab, setActiveTab] = useState('orders');
  return (
    <>
      <div style={{ padding: 20 }}>
        <Alert style={{ marginBottom: 14, fontSize: 14 }} type="info" showIcon
          title="电商对接全流程"
          description={
            <Steps style={{ marginTop: 8 }}
              items={[
                { title: '配置平台',  content: '应用商店填写 AppKey/Secret',    icon: <ShopOutlined style={{ color: 'var(--color-primary)' }} /> },
                { title: '平台推单',  content: 'Webhook 自动接收，自动匹配款号',  icon: <ApiOutlined style={{ color: 'var(--color-warning)' }} /> },
                { title: '待处理',    content: '未匹配到的点「待处理」卡片筛选处理', icon: <ShoppingCartOutlined style={{ color: 'var(--color-danger)' }} /> },
                { title: '关联/出库', content: '关联排产或现货直发→自动扣库存',   icon: <CarOutlined style={{ color: 'var(--color-accent-cyan)' }} /> },
                { title: '自动核算',  content: '出库自动生成收入+回传物流+对账',   icon: <RiseOutlined style={{ color: '#eb2f96' }} /> },
              ]}
            />
          }
        />
        <Tabs activeKey={activeTab} onChange={setActiveTab} type="card"
          items={[
            {
              key: 'orders',
              label: <><ShoppingCartOutlined /> 订单管理</>,
              children: <OrdersTab onInitReturn={(r) => { setSelectedOrder(r); setActiveTab('return'); }} />,
            },
            {
              key: 'pricing',
              label: <><EditOutlined /> SKU 定价</>,
              children: <PricingTab />,
            },
            {
              key: 'return',
              label: <><RollbackOutlined /> 退货管理</>,
              children: <EcommerceReturnTab selectedOrder={selectedOrder} onRefreshOrder={() => { setSelectedOrder(null); }} />,
            },
          ]}
        />
      </div>
    </>
  );
};

export default EcommerceOrders;
