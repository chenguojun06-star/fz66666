/**
 * OrderTable - 订单表格组件（简化版）
 * 功能：可配置列、排序、操作按钮、工序进度条
 */
import React from 'react';
import { Table, Tag, Button, Space } from 'antd';
import { StyleCoverThumb, StyleAttachmentsButton } from '@/components/StyleAssets';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import RowActions from '@/components/common/RowActions';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import { useNavigate } from 'react-router-dom';
import { EditOutlined, InfoCircleOutlined, SyncOutlined } from '@ant-design/icons';

interface OrderTableProps {
  dataSource: ProductionOrder[];
  loading?: boolean;
  pagination?: any;
  onRowClick?: (record: ProductionOrder) => void;
  onQuickEdit?: (record: ProductionOrder) => void;
  onProcessDetail?: (record: ProductionOrder, type: string) => void;
  onSyncProcess?: (record: ProductionOrder) => void;
  visibleColumns?: Record<string, boolean>;
  isMobile?: boolean;
}

const safeString = (v: any, def = '-') => String(v || '').trim() || def;

const getStatusConfig = (status: ProductionOrder['status']) => {
  const configs: Record<string, { text: string; color: string }> = {
    pending: { text: '待生产', color: 'default' },
    in_progress: { text: '生产中', color: 'processing' },
    completed: { text: '已完成', color: 'success' },
    cancelled: { text: '已取消', color: 'error' },
    on_hold: { text: '暂停', color: 'warning' },
  };
  return configs[status] || { text: status, color: 'default' };
};

const OrderTable: React.FC<OrderTableProps> = ({
  dataSource,
  loading,
  pagination,
  onRowClick,
  onQuickEdit,
  onProcessDetail,
  onSyncProcess,
  visibleColumns = {},
  isMobile = false,
}) => {
  const navigate = useNavigate();

  // 定义所有列
  const allColumns = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 72,
      render: (_: any, record: ProductionOrder) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={record.styleCover || null}
          size={48}
          borderRadius={6}
        />
      ),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      fixed: isMobile ? undefined : ('left' as const),
      render: (v: any, record: ProductionOrder) => (
        <a
          style={{ color: 'var(--primary-color)' }}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/production/order-flow?orderId=${record.id}&orderNo=${record.orderNo}&styleNo=${record.styleNo}`);
          }}
        >
          {safeString(v)}
        </a>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (v: any) => safeString(v),
    },
    {
      title: '公司',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 120,
      ellipsis: true,
      render: (v: any) => safeString(v),
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 100,
      render: (_: any, record: ProductionOrder) => (
        <StyleAttachmentsButton
          styleId={record.styleId}
          styleNo={record.styleNo}
          onlyActive
        />
      ),
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
    },
    {
      title: '订单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '下单时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: (v: any) => formatDateTime(v),
    },
    {
      title: '预计出货',
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => formatDateTime(v),
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (v: any) => safeString(v),
    },
    // 工序进度列
    {
      title: '采购',
      dataIndex: 'procurementCompletionRate',
      key: 'procurementSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: 4,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onProcessDetail?.(record, 'procurement');
          }}
        >
          <LiquidProgressBar percent={rate || 0} width="100%" height={12} />
          <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)', minWidth: 40 }}>
            {rate || 0}%
          </span>
        </div>
      ),
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingCompletionRate',
      key: 'cuttingSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: 4,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onProcessDetail?.(record, 'cutting');
          }}
        >
          <LiquidProgressBar percent={rate || 0} width="100%" height={12} />
          <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)', minWidth: 40 }}>
            {rate || 0}%
          </span>
        </div>
      ),
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: 4,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onProcessDetail?.(record, 'carSewing');
          }}
        >
          <LiquidProgressBar percent={rate || 0} width="100%" height={12} />
          <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)', minWidth: 40 }}>
            {rate || 0}%
          </span>
        </div>
      ),
    },
    {
      title: '入库',
      dataIndex: 'warehousingQualifiedQuantity',
      key: 'warehousingQualifiedQuantity',
      width: 140,
      render: (_: any, record: ProductionOrder) => {
        const qualified = Number(record.warehousingQualifiedQuantity ?? 0) || 0;
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 1;
        const rate = Math.min(100, Math.round((qualified / total) * 100));

        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onProcessDetail?.(record, 'warehousing');
            }}
          >
            <div style={{ position: 'relative', width: 36, height: 36 }}>
              <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="16" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke={rate === 100 ? '#059669' : rate > 0 ? '#3b82f6' : '#e5e7eb'}
                  strokeWidth="3"
                  strokeDasharray={`${(rate / 100) * 100.53} 100.53`}
                  strokeLinecap="round"
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {rate}%
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>
                {qualified}/{total}
              </span>
              <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
                {qualified > 0 ? '已入库' : '未入库'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: '生产进度',
      dataIndex: 'productionProgress',
      key: 'productionProgress',
      width: 100,
      render: (value: number) => `${value || 0}%`,
      align: 'right' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ProductionOrder['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: isMobile ? undefined : ('right' as const),
      width: 140,
      render: (_: any, record: ProductionOrder) => (
        <RowActions
          actions={[
            {
              label: '详情',
              icon: <InfoCircleOutlined />,
              onClick: (e) => {
                e.stopPropagation();
                onRowClick?.(record);
              }
            },
            {
              label: '快编',
              icon: <EditOutlined />,
              onClick: (e) => {
                e.stopPropagation();
                onQuickEdit?.(record);
              }
            },
            {
              label: '同步',
              icon: <SyncOutlined />,
              onClick: (e) => {
                e.stopPropagation();
                onSyncProcess?.(record);
              }
            }
          ]}
        />
        </Space>
      ),
    },
  ];

  // 过滤可见列
  const columns = allColumns.filter((col) => {
    if (!col.key) return true; // 无key的列总是显示
    if (visibleColumns[col.key] === false) return false; // 显式隐藏
    return true; // 默认显示
  });

  return (
    <Table
      dataSource={dataSource}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={pagination}
      scroll={{ x: 'max-content', y: 'calc(100vh - 360px)' }}
      size="small"
      onRow={(record) => ({
        onClick: () => onRowClick?.(record),
        style: { cursor: 'pointer' },
      })}
    />
  );
};

export default OrderTable;
