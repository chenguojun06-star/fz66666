import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Spin } from 'antd';
import { ColumnsType } from 'antd/es/table';
import api, { getApiMessage, isApiSuccess } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import './styles.css';
import { message } from '@/utils/antdStatic';

interface OverdueOrder {
  id: string;  // 修复：后端返回的是字符串类型的UUID
  orderNo: string;
  styleNo: string;
  quantity: number;
  deliveryDate: string;
  overdueDays: number;
  factoryName?: string;  // 工厂名称
}

const OverdueOrderTable: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<OverdueOrder[]>([]);
  const { sortField, sortOrder, handleSort } = usePersistentSort<'deliveryDate' | 'overdueDays', 'asc' | 'desc'>({
    storageKey: 'dashboard-overdue-orders',
    defaultField: 'deliveryDate',
    defaultOrder: 'desc',
  });
  const [urgedIds, setUrgedIds] = useState<Set<string>>(new Set());
  const [urgingId, setUrgingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 调用真实API获取延期订单列表
      const result = await api.get('/dashboard/overdue-orders');

      // 后端返回格式：{ code: 200, data: [...], message: "...", requestId: "..." }
      // 需要取 result.data 中的数组
      const orders = result?.data || result;

      if (Array.isArray(orders)) {
        setDataSource(orders);
      } else if (Array.isArray(result)) {
        setDataSource(result);
      } else {
        setDataSource([]);
      }
    } catch (error) {
      console.error('Failed to load overdue orders:', error);
      // 错误时显示空列表
      setDataSource([]);
    } finally {
      setLoading(false);
    }
  };

  const sortedDataSource = useMemo(() => {
    const sorted = [...dataSource];
    sorted.sort((a, b) => {
      if (sortField === 'deliveryDate') {
        const dateA = new Date(a.deliveryDate).getTime();
        const dateB = new Date(b.deliveryDate).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      const diff = a.overdueDays - b.overdueDays;
      return sortOrder === 'desc' ? -diff : diff;
    });
    return sorted;
  }, [dataSource, sortField, sortOrder]);

  const columns: ColumnsType<OverdueOrder> = [
    {
      title: '款式图',
      dataIndex: 'styleNo',
      key: 'styleCover',
      width: 72,
      align: 'center',
      render: (_value: string, record: OverdueOrder) => (
        <div className="overdue-order-cover-cell">
          <StyleCoverThumb styleNo={record.styleNo} size={40} borderRadius={8} fit="contain" />
        </div>
      ),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 132,
      ellipsis: true,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 112,
      ellipsis: true,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 72,
      align: 'right',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: <SortableColumnTitle title="交货日期" fieldName="deliveryDate" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="left" />,
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      width: 104,
    },
    {
      title: <SortableColumnTitle title="延期天数" fieldName="overdueDays" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />,
      dataIndex: 'overdueDays',
      key: 'overdueDays',
      width: 84,
      align: 'right',
      render: (value: number) => (
        <span className="overdue-days">{value} 天</span>
      ),
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 132,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: '催单',
      key: 'urge',
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: OverdueOrder) => {
        const urged = urgedIds.has(record.id);
        const urging = urgingId === record.id;
        return (
          <Button
            size="small"
            type="default"
            danger={!urged}
            disabled={urged || urging}
            loading={urging}
            onClick={async () => {
              try {
                setUrgingId(record.id);
                const result = await api.post('/production/order/urge', {
                  orderId: record.id,
                  remark: '仪表盘延期订单催单',
                });
                if (!isApiSuccess(result)) {
                  throw new Error(getApiMessage(result, '催单失败'));
                }
                setUrgedIds(prev => new Set([...Array.from(prev), record.id]));
                message.success(`已发送催单通知：${record.orderNo}`);
              } catch (err: unknown) {
                message.error(err instanceof Error ? err.message : ((err && typeof err === 'object' && 'response' in err ? (err as any)?.response?.data?.message : undefined) || '催单失败'));
              } finally {
                setUrgingId(null);
              }
            }}
          >
            {urged ? '已催' : '催单'}
          </Button>
        );
      },
    },
  ];

  return (
    <Card
      title="延期订单列表"
      className="overdue-order-table-card"
      variant="borderless"
    >
      <Spin spinning={loading}>
        <ResizableTable
          storageKey="overdue-order-dashboard-v2"
          columns={columns}
          dataSource={sortedDataSource}
          rowKey="id"
          resizableColumns={false}
          scroll={{ y: 520 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
          }}
          size="middle"
          className="overdue-order-table"
        />
      </Spin>
    </Card>
  );
};

export default OverdueOrderTable;
