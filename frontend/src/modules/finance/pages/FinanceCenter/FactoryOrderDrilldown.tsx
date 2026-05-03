import React, { useEffect, useState } from 'react';
import { Modal, Table, Tag, Descriptions, App, Empty } from 'antd';
import api from '@/utils/api';
import { toMoney } from './chartConfigs';

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
      // 批量查询订单明细
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
        const m: Record<string, { color: string; text: string }> = {
          production: { color: 'blue', text: '生产中' },
          completed: { color: 'green', text: '已完成' },
        };
        const info = m[v] || { color: 'default', text: v || '-' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    { title: '下单数', dataIndex: 'orderQuantity', width: 80, align: 'right' as const },
    { title: '入库数', dataIndex: 'warehousedQuantity', width: 80, align: 'right' as const },
    {
      title: '次品', dataIndex: 'defectQuantity', width: 60, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: 'red' }}>{v}</span> : '-',
    },
    { title: '面辅料成本', dataIndex: 'materialCost', width: 110, align: 'right' as const, render: (v: number) => `¥${toMoney(v)}` },
    { title: '生产成本', dataIndex: 'productionCost', width: 100, align: 'right' as const, render: (v: number) => `¥${toMoney(v)}` },
    { title: '次品报废', dataIndex: 'defectLoss', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: 'red' }}>¥{toMoney(v)}</span> : '-' },
    { title: '金额', dataIndex: 'totalAmount', width: 100, align: 'right' as const, render: (v: number) => <strong>¥{toMoney(v)}</strong> },
    {
      title: '利润', dataIndex: 'profit', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? 'green' : 'red', fontWeight: 500 }}>¥{toMoney(v)}</span>,
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
      <Descriptions column={6} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="工厂类型">
          <Tag color={factoryType === 'EXTERNAL' ? 'purple' : 'orange'}>
            {factoryType === 'EXTERNAL' ? '外发工厂' : '内部工厂'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="订单数">{orderNos.length}</Descriptions.Item>
        <Descriptions.Item label="下单总量">{totalOrderQuantity?.toLocaleString() ?? 0}</Descriptions.Item>
        <Descriptions.Item label="入库总量">{totalWarehousedQuantity?.toLocaleString() ?? 0}</Descriptions.Item>
        <Descriptions.Item label="次品量">
          <span style={{ color: totalDefectQuantity > 0 ? 'red' : undefined }}>{totalDefectQuantity}</span>
        </Descriptions.Item>
        <Descriptions.Item label="利润">
          <span style={{ color: totalProfit >= 0 ? 'green' : 'red', fontWeight: 600 }}>¥{toMoney(totalProfit)}</span>
        </Descriptions.Item>
        <Descriptions.Item label="面辅料成本">¥{toMoney(totalMaterialCost)}</Descriptions.Item>
        <Descriptions.Item label="生产成本">¥{toMoney(totalProductionCost)}</Descriptions.Item>
        <Descriptions.Item label="总金额">
          <strong style={{ color: 'var(--primary-color)' }}>¥{toMoney(totalAmount)}</strong>
        </Descriptions.Item>
      </Descriptions>

      {orders.length > 0 ? (
        <Table
          columns={columns}
          dataSource={orders}
          rowKey="orderId"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 1300 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <strong>合计 {orders.length} 单</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">{orders.reduce((s, o) => s + (o.orderQuantity || 0), 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">{orders.reduce((s, o) => s + (o.warehousedQuantity || 0), 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">{orders.reduce((s, o) => s + (o.defectQuantity || 0), 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">¥{toMoney(orders.reduce((s, o) => s + (o.materialCost || 0), 0))}</Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">¥{toMoney(orders.reduce((s, o) => s + (o.productionCost || 0), 0))}</Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">¥{toMoney(orders.reduce((s, o) => s + (o.defectLoss || 0), 0))}</Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right"><strong>¥{toMoney(orders.reduce((s, o) => s + (o.totalAmount || 0), 0))}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={11} align="right">
                  <span style={{ color: orders.reduce((s, o) => s + (o.profit || 0), 0) >= 0 ? 'green' : 'red', fontWeight: 600 }}>
                    ¥{toMoney(orders.reduce((s, o) => s + (o.profit || 0), 0))}
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={12} align="right">{orders.length > 0 ? (orders.reduce((s, o) => s + (o.profit || 0), 0) / Math.max(1, orders.reduce((s, o) => s + (o.totalAmount || 0), 0)) * 100).toFixed(1) : 0}%</Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : (
        !loading && <Empty description="暂无订单明细" />
      )}
    </Modal>
  );
};

export default FactoryOrderDrilldown;
