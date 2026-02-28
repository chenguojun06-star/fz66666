import React, { useCallback, useState } from 'react';
import { Tag, App, Input } from 'antd';

import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '@/types/production';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { MATERIAL_TYPES } from '@/constants/business';
import { getStatusConfig } from '../utils';
import api from '@/utils/api';

interface MaterialTableProps {
  loading: boolean;
  dataSource: MaterialPurchaseType[];
  total: number;
  queryParams: MaterialQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<MaterialQueryParams>>;
  isMobile: boolean;
  onView: (record: MaterialPurchaseType) => void;
  onEdit: (record: MaterialPurchaseType) => void;
  onRefresh?: () => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  purchaseSortField: string;
  purchaseSortOrder: 'asc' | 'desc';
  onPurchaseSort: (field: string, order: 'asc' | 'desc') => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
}

const MaterialTable: React.FC<MaterialTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  isMobile,
  onView,
  onEdit,
  onRefresh,
  sortField,
  sortOrder,
  onSort,
  purchaseSortField,
  purchaseSortOrder,
  onPurchaseSort,
  isOrderFrozenForRecord,
}) => {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [cancelLoading, setCancelLoading] = useState<string | null>(null);

  /** 撤回采购领取/到货登记 */
  const handleCancelReceive = useCallback((record: MaterialPurchaseType) => {
    let reason = '';
    modal.confirm({
      title: '撤回采购领取',
      width: 440,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            确定撤回「{record.materialName || record.materialCode}」的领取记录？
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>
            领取人：{record.receiverName || '-'}，到货数量：{record.arrivedQuantity || 0} {record.unit || ''}
          </p>
          <p style={{ fontSize: 13, marginBottom: 4 }}>撤回原因：</p>
          <Input.TextArea
            placeholder="请填写撤回原因（必填）"
            autoSize={{ minRows: 2, maxRows: 4 }}
            onChange={e => { reason = e.target.value; }}
          />
        </div>
      ),
      okText: '确认撤回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!reason.trim()) {
          message.error('请填写撤回原因');
          throw new Error('请填写撤回原因');
        }
        setCancelLoading(record.id as string);
        try {
          await api.post('/production/purchase/cancel-receive', {
            purchaseId: record.id,
            reason: reason.trim(),
          });
          message.success('领取已撤回，采购单已恢复为待处理');
          onRefresh?.();
        } finally {
          setCancelLoading(null);
        }
      },
    });
  }, [modal, message, onRefresh]);

  const cleanRemark = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const cleaned = raw
      .replace(/(^|[；;]\s*)回料确认:[^；;]*/g, '')
      .replace(/^[；;\s]+|[；;\s]+$/g, '')
      .replace(/[；;\s]{2,}/g, ' ')
      .trim();
    return cleaned;
  };

  const resolveCompletedTime = (record: MaterialPurchaseType) => {
    return record.returnConfirmTime || record.actualArrivalDate || '';
  };

  const resolveOperatorName = (record: MaterialPurchaseType) => {
    return String(record.returnConfirmerName || '').trim() || String(record.receiverName || '').trim();
  };

  const columns: ColumnsType<MaterialPurchaseType> = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 72,
      render: (_: any, record: MaterialPurchaseType) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
      )
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (v: any, record: MaterialPurchaseType) => {
        const styleNo = String(v || '').trim();
        const orderNo = String((record as any).orderNo || '').trim();
        return (
          <a
            onClick={() => {
              if (styleNo) {
                const qs = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : '';
                navigate(`/production/material/${styleNo}${qs}`);
              }
            }}
            style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
          >
            {styleNo || '-'}
          </a>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '下单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => {
        // 样衣开发款（MP开头）没有订单数量，显示采购数量
        if (!v && record.purchaseNo?.startsWith('MP')) {
          return record.purchaseQuantity ? `${record.purchaseQuantity} ${record.unit || ''}` : '-';
        }
        return v ? `${v} 件` : '-';
      },
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: string) => (
        <Tag color={
          getMaterialTypeCategory(v) === MATERIAL_TYPES.ACCESSORY ? 'purple' :
            getMaterialTypeCategory(v) === MATERIAL_TYPES.LINING ? 'cyan' : 'geekblue'
        }>
          {getMaterialTypeLabel(v)}
        </Tag>
      ),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
      ellipsis: true,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 90,
      ellipsis: true,
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 120,
      ellipsis: true,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => `${v || 0} ${record.unit || ''}`,
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => `${v || 0} ${record.unit || ''}`,
    },
    {
      title: '待到数量',
      key: 'remainingQuantity',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const total = Number(record?.purchaseQuantity || 0);
        const arrived = Number(record?.arrivedQuantity || 0);
        const remaining = Math.max(0, total - arrived);
        return `${remaining} ${record.unit || ''}`;
      },
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v: number) => Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: MaterialPurchaseType['status'] | string) => {
        const config = getStatusConfig(status as MaterialPurchaseType['status']);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '来源',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 80,
      render: (v: string) => {
        if (v === 'sample') {
          return <Tag color="orange">样衣</Tag>;
        }
        if (v === 'batch' || v === 'stock' || v === 'manual') {
          return <Tag color="green">批量采购</Tag>;
        }
        return <Tag color="blue">订单</Tag>;
      },
    },
    {
      title: <SortableColumnTitle
        title="下单时间"
        sortField={sortField}
        fieldName="createTime"
        sortOrder={sortOrder}
        onSort={onSort}
        align="left"
      />,
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-',
    },
    {
      title: (
        <SortableColumnTitle
          title="预计出货"
          sortField={purchaseSortField}
          fieldName="expectedShipDate"
          sortOrder={purchaseSortOrder}
          onSort={onPurchaseSort}
          align="left"
        />
      ),
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '采购时间',
      dataIndex: 'receivedTime',
      key: 'receivedTime',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-',
    },
    {
      title: '采购完成',
      dataIndex: 'actualArrivalDate',
      key: 'actualArrivalDate',
      width: 160,
      render: (_: string, record: MaterialPurchaseType) => {
        const completedTime = resolveCompletedTime(record);
        return completedTime ? formatDateTime(completedTime) : '-';
      },
    },
    {
      title: '采购员',
      dataIndex: 'receiverName',
      key: 'receiverName',
      width: 100,
      ellipsis: true,
      render: (_: string, record: MaterialPurchaseType) => resolveOperatorName(record) || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (v: string) => {
        const text = cleanRemark(v) || '-';
        return <span title={text}>{text}</span>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const frozen = isOrderFrozenForRecord(record);
        // 已领取/已到货状态可撤回（pending/cancelled 不可撤回）
        const canCancelReceive = !frozen
          && record.status !== 'pending'
          && record.status !== 'cancelled';
        return (
          <RowActions
            actions={[
              {
                key: 'view',
                label: '查看',
                onClick: () => onView(record),
                primary: true,
              },
              {
                key: 'quickEdit',
                label: '编辑',
                disabled: frozen,
                onClick: () => onEdit(record),
              },
              ...(canCancelReceive ? [{
                key: 'cancelReceive',
                label: cancelLoading === record.id ? '撤回中...' : '撤回领取',
                danger: true as const,
                disabled: cancelLoading === record.id,
                onClick: () => handleCancelReceive(record),
              }] : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <ResizableTable<MaterialPurchaseType>
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 'max-content' }}
      size={isMobile ? 'small' : 'middle'}
      pagination={{
        current: queryParams.page,
        pageSize: queryParams.pageSize,
        total: total,
        onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
        showTotal: (total) => `共 ${total} 条`,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        size: isMobile ? 'small' : 'default',
      }}
    />
  );
};

export default MaterialTable;
