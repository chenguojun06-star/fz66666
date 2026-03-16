import React, { useState, useCallback, useEffect } from 'react';
import { Input, Button, Space, Tag } from 'antd';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StandardToolbar from '@/components/common/StandardToolbar';
import { productionOrderApi } from '@/services/production/productionApi';
import type { ProductionOrder } from '@/types/production';
import WashLabelPrintModal from './WashLabelPrintModal';
import { message } from '@/utils/antdStatic';

export default function UCodeTab() {
  const [orders, setOrders]               = useState<ProductionOrder[]>([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(false);
  const [page, setPage]                   = useState(1);
  const [orderNoFilter, setOrderNoFilter] = useState('');
  const [styleNoFilter, setStyleNoFilter] = useState('');
  const [printOrder, setPrintOrder]       = useState<ProductionOrder | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const fetchOrders = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const res = await productionOrderApi.list({
        page: pg, pageSize: 20,
        orderNo: orderNoFilter.trim() || undefined,
        styleNo: styleNoFilter.trim() || undefined,
      } as any);
      const records = (res as any)?.data?.records ?? [];
      const tot     = (res as any)?.data?.total   ?? records.length;
      setOrders(records as ProductionOrder[]);
      setTotal(tot);
      setPage(pg);
    } catch {
      void message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [orderNoFilter, styleNoFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchOrders(1); }, []);

  const columns = [
    { title: '订单号', dataIndex: 'orderNo',       key: 'orderNo',       width: 160 },
    { title: '款号',   dataIndex: 'styleNo',       key: 'styleNo',       width: 120 },
    { title: '款名',   dataIndex: 'styleName',     key: 'styleName',     ellipsis: true },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 90,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <span style={{ color: '#bbb' }}>-</span>,
    },
    { title: '码数',   dataIndex: 'size',          key: 'size',          width: 80 },
    { title: '下单数', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 90, align: 'right' as const },
    {
      title: '操作', key: 'action', width: 110, fixed: 'right' as const,
      render: (_: unknown, record: ProductionOrder) => (
        <Button size="small" type="primary" icon={<PrinterOutlined />}
          onClick={() => { setPrintOrder(record); setPrintModalOpen(true); }}>
          打印标签
        </Button>
      ),
    },
  ];

  return (
    <>
      <StandardToolbar
        left={
          <Space>
            <Input placeholder="订单号" allowClear value={orderNoFilter}
              onChange={e => setOrderNoFilter(e.target.value)}
              onPressEnter={() => void fetchOrders(1)} style={{ width: 160 }} />
            <Input placeholder="款号" allowClear value={styleNoFilter}
              onChange={e => setStyleNoFilter(e.target.value)}
              onPressEnter={() => void fetchOrders(1)} style={{ width: 140 }} />
            <Button icon={<SearchOutlined />} onClick={() => void fetchOrders(1)}>查询</Button>
          </Space>
        }
      />
      <ResizableTable
        dataSource={orders} columns={columns} rowKey="id"
        loading={loading} size="small" scroll={{ x: 900 }}
        pagination={{
          current: page, pageSize: 20, total,
          onChange: (pg) => void fetchOrders(pg),
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
      <WashLabelPrintModal
        open={printModalOpen}
        onCancel={() => { setPrintModalOpen(false); setPrintOrder(null); }}
        order={printOrder}
      />
    </>
  );
}
