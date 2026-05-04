import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Spin } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<OverdueOrder[]>([]);
  // 当前选中的工厂过滤器，null 表示全部
  const [activeFactory, setActiveFactory] = useState<string | null>(null);
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

  // 按工厂过滤后的数据
  const filteredDataSource = useMemo(() => {
    if (!activeFactory) return sortedDataSource;
    return sortedDataSource.filter(
      (order) => (order.factoryName || '未分配工厂') === activeFactory,
    );
  }, [sortedDataSource, activeFactory]);

  // 按工厂统计延期订单数量，用于顶部分布汇总
  const factoryDistribution = useMemo(() => {
    const map = new Map<string, number>();
    dataSource.forEach((order) => {
      const name = order.factoryName || '未分配工厂';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [dataSource]);

  const columns: ColumnsType<OverdueOrder> = [
    {
      title: '款式图',
      dataIndex: 'styleNo',
      key: 'styleCover',
      width: 60,
      align: 'center',
      render: (_value: string, record: OverdueOrder) => (
        <div className="overdue-order-cover-cell">
          <StyleCoverThumb styleNo={record.styleNo} size={36} borderRadius={6} fit="contain" />
        </div>
      ),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      ellipsis: true,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      ellipsis: true,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: <SortableColumnTitle title="交期" fieldName="deliveryDate" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="left" />,
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
    },
    {
      title: <SortableColumnTitle title="延期天数" fieldName="overdueDays" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />,
      dataIndex: 'overdueDays',
      key: 'overdueDays',
      align: 'right',
      render: (value: number) => {
        // 按延期严重程度分级显示颜色：≤0 橙色预警，1-7 天橙红，>7 天红色危险
        const level = value <= 0 ? 'warn' : value <= 7 ? 'mid' : 'danger';
        return (
          <span className={`overdue-days overdue-days-${level}`}>{value} 天</span>
        );
      },
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: '催单',
      key: 'action',
      width: 72,
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
      {/* 工厂分布汇总：点击 chip 过滤表格；点击"全部延期"标签旁边的跳转按钮才会导航 */}
      {dataSource.length > 0 && (
        <div className="overdue-factory-summary">
          <div
            className={`overdue-factory-row overdue-factory-row-total${activeFactory === null ? ' active' : ''}`}
            onClick={() => setActiveFactory(null)}
          >
            <span className="overdue-factory-label">全部延期</span>
            <span className="overdue-factory-count">{dataSource.length} 单</span>
          </div>
          {factoryDistribution.map(({ name, count }) => (
            <div
              key={name}
              className={`overdue-factory-row${activeFactory === name ? ' active' : ''}`}
              onClick={() => setActiveFactory(activeFactory === name ? null : name)}
            >
              <span className="overdue-factory-label">{name}</span>
              <span className="overdue-factory-count">{count} 单</span>
            </div>
          ))}
          {/* 右侧独立跳转按钮，避免整个 chip 区变成导航 */}
          <div className="overdue-factory-nav-btn" onClick={() => navigate('/production?filter=overdue')}>
            查看全部 →
          </div>
        </div>
      )}
      {/* 用 div 包裹 Spin，保持 flex 链不断裂 */}
      <div className="overdue-order-table-body">
        <Spin spinning={loading}>
          <ResizableTable
            storageKey="overdue-order-dashboard-v2"
            columns={columns}
            dataSource={filteredDataSource}
            rowKey="id"
            resizableColumns={false}
            scroll={{ x: 'max-content' }}
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
      </div>
    </Card>
  );
};

export default OverdueOrderTable;
