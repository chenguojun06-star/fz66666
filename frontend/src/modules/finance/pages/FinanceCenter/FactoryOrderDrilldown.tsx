import React, { useEffect, useState } from 'react';
import { Modal, Tag, Descriptions, App, Empty } from 'antd';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import { toMoney } from './chartConfigs';
import { statusMap } from './useSettlementData';

interface FactoryOrderDrilldownProps {
  open: boolean;
  factoryName: string;
  factoryType?: string;
  orderNos: string[];
  totalAmount: number;
  totalMaterialCost: number;
  totalProductionCost: number;
  totalProfit: number;
  totalDefectQuantity: number;
  totalOrderQuantity: number;
  totalWarehousedQuantity: number;
  onClose: () => void;
}

interface OrderDetail {
  orderId: string;
  orderNo: string;
  styleNo: string;
  status: string;
  orderQuantity: number;
  warehousedQuantity: number;
  defectQuantity: number;
  materialCost: number;
  productionCost: number;
  defectLoss: number;
  totalAmount: number;
  profit: number;
  profitMargin: number;
  factoryName: string;
}

const FactoryOrderDrilldown: React.FC<FactoryOrderDrilldownProps> = ({
  open,
  factoryName,
  factoryType,
  orderNos,
  totalAmount,
  totalMaterialCost,
  totalProductionCost,
  totalProfit,
  totalDefectQuantity,
  totalOrderQuantity,
  totalWarehousedQuantity,
  onClose,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderDetail[]>([]);

  useEffect(() => {
    if (open && orderNos.length > 0) {
      fetchOrderDetails();
    }
  }, [open, orderNos]);

  const fetchOrderDetails = async () => {
    setLoading(true);
    try {
      const promises = orderNos.map(orderNo =>
        api.get('/finance/finished-settlement/detail/' + encodeURIComponent(orderNo))
          .catch(() => null)
      );
      const results = await Promise.all(promises);
      const details: OrderDetail[] = results
        .filter((r: any) => r?.code === 200 && r?.data)
        .map((r: any) => r.data);
      setOrders(details);
    } catch {
      message.error('获取订单明细失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', width: 160 },
    { title: '款号', dataIndex: 'styleNo', width: 120 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const info = statusMap[v] || { text: '未知', color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    { title: '下单数', dataIndex: 'orderQuantity', width: 80, align: 'right' as const },
    { title: '入库数', dataIndex: 'warehousedQuantity', width: 80, align: 'right' as const },
    {
      title: '次品', dataIndex: 'defectQuantity', width: 60, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: 'var(--color-danger)' }}>{v}</span> : '-',
    },
    { title: '面辅料成本', dataIndex: 'materialCost', width: 110, align: 'right' as const, render: (v: number) => `¥${toMoney(v)}` },
    { title: '生产成本', dataIndex: 'productionCost', width: 100, align: 'right' as const, render: (v: number) => `¥${toMoney(v)}` },
    { title: '次品报废', dataIndex: 'defectLoss', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: 'var(--color-danger)' }}>¥{toMoney(v)}</span> : '-' },
    { title: '金额', dataIndex: 'totalAmount', width: 100, align: 'right' as const, render: (v: number) => <strong>¥{toMoney(v)}</strong> },
    {
      title: '利润', dataIndex: 'profit', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>¥{toMoney(v)}</span>,
    },
    { title: '利润率', dataIndex: 'profitMargin', width: 80, align: 'right' as const, render: (v: number) => `${v?.toFixed(1) ?? '-'}%` },
  ];

  return (
    <Modal
      title={`${factoryName} — 订单明细`}
      open={open}
      onCancel={onClose}
      width="90vw"
      footer={null}
      destroyOnHidden
    >
      <Descriptions column={6} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="工厂类型">
          <Tag color={factoryType === 'EXTERNAL' ? 'purple' : 'orange'}>
            {factoryType === 'EXTERNAL' ? '外发工厂' : '内部工厂'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="订单数">{orderNos.length}</Descriptions.Item>
        <Descriptions.Item label="下单总量">{totalOrderQuantity?.toLocaleString() ?? 0}</Descriptions.Item>
        <Descriptions.Item label="入库总量">{totalWarehousedQuantity?.toLocaleString() ?? 0}</Descriptions.Item>
        <Descriptions.Item label="次品量">
          <span style={{ color: totalDefectQuantity > 0 ? 'var(--color-danger)' : undefined }}>{totalDefectQuantity}</span>
        </Descriptions.Item>
        <Descriptions.Item label="利润">
          <span style={{ color: totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>¥{toMoney(totalProfit)}</span>
        </Descriptions.Item>
        <Descriptions.Item label="面辅料成本">¥{toMoney(totalMaterialCost)}</Descriptions.Item>
        <Descriptions.Item label="生产成本">¥{toMoney(totalProductionCost)}</Descriptions.Item>
        <Descriptions.Item label="总金额">
          <strong style={{ color: 'var(--primary-color)' }}>¥{toMoney(totalAmount)}</strong>
        </Descriptions.Item>
      </Descriptions>

      {orders.length > 0 ? (
        <ResizableTable
          storageKey="finance-factory-order-drilldown"
          columns={columns}
          dataSource={orders}
          rowKey="orderId"
          loading={loading}
         
          pagination={false}
          scroll={{ x: 1300 }}
          summary={() => {
            const totOrderQty = orders.reduce((s, o) => s + (o.orderQuantity || 0), 0);
            const totWhQty = orders.reduce((s, o) => s + (o.warehousedQuantity || 0), 0);
            const totDefect = orders.reduce((s, o) => s + (o.defectQuantity || 0), 0);
            const totMatCost = orders.reduce((s, o) => s + (o.materialCost || 0), 0);
            const totProdCost = orders.reduce((s, o) => s + (o.productionCost || 0), 0);
            const totDefectLoss = orders.reduce((s, o) => s + (o.defectLoss || 0), 0);
            const totAmount = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
            const totProfit = orders.reduce((s, o) => s + (o.profit || 0), 0);
            const totMargin = orders.length > 0
              ? (totProfit / Math.max(1, totAmount) * 100).toFixed(1)
              : '0.0';
            return (
              <ResizableTable.Summary fixed>
                <ResizableTable.Summary.Row>
                  <ResizableTable.Summary.Cell index={0} colSpan={3}>
                    <strong>合计 {orders.length} 单</strong>
                  </ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={3} align="right">{totOrderQty}</ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={4} align="right">{totWhQty}</ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={5} align="right">{totDefect}</ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={6} align="right">¥{toMoney(totMatCost)}</ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={7} align="right">¥{toMoney(totProdCost)}</ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={8} align="right">¥{toMoney(totDefectLoss)}</ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={9} align="right"><strong>¥{toMoney(totAmount)}</strong></ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={10} align="right">
                    <span style={{ color: totProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                      ¥{toMoney(totProfit)}
                    </span>
                  </ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={11} align="right">{totMargin}%</ResizableTable.Summary.Cell>
                </ResizableTable.Summary.Row>
              </ResizableTable.Summary>
            );
          }}
        />
      ) : (
        !loading && <Empty description="暂无订单明细" />
      )}
    </Modal>
  );
};

export default FactoryOrderDrilldown;
