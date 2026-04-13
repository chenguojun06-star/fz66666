import React, { useState } from 'react';
import { Tag, App, Space, Tooltip, Modal } from 'antd';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';

import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '@/types/production';
import { formatMaterialSpecWidth } from '@/utils/materialType';
import { analyzePurchase, renderPurchaseTooltip } from '../utils/purchaseIntelligence';
import { formatDateTime } from '@/utils/datetime';
import { formatMaterialQuantityWithUnit, formatReferenceKilograms, getStatusConfig, subtractMaterialQuantity } from '../utils';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
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
  onRemark: (record: MaterialPurchaseType) => void;
  onRefresh?: () => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  purchaseSortField: string;
  purchaseSortOrder: 'asc' | 'desc';
  onPurchaseSort: (field: string, order: 'asc' | 'desc') => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onDelete?: (record: MaterialPurchaseType) => void;
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
  onRemark,
  onRefresh,
  sortField,
  sortOrder,
  onSort,
  purchaseSortField,
  purchaseSortOrder,
  onPurchaseSort,
  isOrderFrozenForRecord,
  onDelete,
}) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [, setCancelLoading] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaterialPurchaseType | null>(null);
  const [cancelConfirmLoading, setCancelConfirmLoading] = useState(false);

  const handleCancelConfirm = async (reason: string) => {
    if (!cancelTarget) return;
    setCancelConfirmLoading(true);
    setCancelLoading(cancelTarget.id as string);
    try {
      await api.post('/production/purchase/cancel-receive', {
        purchaseId: cancelTarget.id,
        reason,
      });
      message.success('撤回成功，采购单已恢复为待处理');
      setCancelTarget(null);
      onRefresh?.();
    } catch {
      // error shown by api interceptor
    } finally {
      setCancelConfirmLoading(false);
      setCancelLoading(null);
    }
  };

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
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={40} borderRadius={6} />
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
      render: (v: string, _record: MaterialPurchaseType) => {
        const orderNo = String(v || '').trim();
        if (!orderNo || orderNo === '-') return '-';

        // 智能采购分析（关键路径 + 供应商 + 裁剪可行性 + 建议）
        const orderRecs = dataSource.filter(r => r.orderNo === orderNo && r.status !== 'cancelled');
        let tooltipContent: React.ReactNode = null;
        if (orderRecs.length > 0) {
          const insight = analyzePurchase(orderRecs);
          tooltipContent = renderPurchaseTooltip(insight, orderNo);
        }

        return tooltipContent
          ? (
            <Tooltip title={tooltipContent} placement="right" color="white" styles={{ container: { color: '#333', boxShadow: '0 3px 12px rgba(0,0,0,0.12)' } }}>
              <span style={{ borderBottom: '1px dotted var(--color-primary)', cursor: 'help' }}>{orderNo}</span>
            </Tooltip>
          )
          : orderNo;
      },
    },
    {
      title: '生产方',
      key: 'factoryName',
      width: 120,
      render: (_: any, record: MaterialPurchaseType) => {
        const name = record.factoryName as string | undefined;
        const type = record.factoryType as 'INTERNAL' | 'EXTERNAL' | undefined;
        const bizType = record.orderBizType as string | undefined;
        const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
        if (!name) return '-';
        return (
          <Space size={4}>
            {type === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
            {type === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
            <span style={{ fontSize: 12 }}>{name}</span>
            {bizType && <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>{bizType}</Tag>}
          </Space>
        );
      },
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
          return record.purchaseQuantity ? formatMaterialQuantityWithUnit(record.purchaseQuantity, record.unit) : '-';
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
      render: (v: string) => <MaterialTypeTag value={v} />,
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
      title: '规格/幅宽',
      key: 'specWidth',
      width: 150,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchaseType) => formatMaterialSpecWidth(record.specifications, record.fabricWidth),
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 90,
      ellipsis: true,
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
      width: 140,
      ellipsis: true,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchaseType) => (
        <SupplierNameTooltip
          name={record.supplierName}
          contactPerson={(record as any).supplierContactPerson}
          contactPhone={(record as any).supplierContactPhone}
        />
      ),
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => formatMaterialQuantityWithUnit(v, record.unit),
    },
    {
      title: '参考公斤数',
      key: 'referenceKilograms',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, record: MaterialPurchaseType) =>
        formatReferenceKilograms(record.purchaseQuantity, record.conversionRate, record.unit),
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => formatMaterialQuantityWithUnit(v, record.unit),
    },
    {
      title: '待到数量',
      key: 'remainingQuantity',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const remaining = subtractMaterialQuantity(record?.purchaseQuantity, record?.arrivedQuantity);
        return formatMaterialQuantityWithUnit(remaining, record.unit);
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
      width: 120,
      render: (status: MaterialPurchaseType['status'] | string, record: MaterialPurchaseType) => {
        const config = getStatusConfig(status as MaterialPurchaseType['status']);
        const s = String(status || '').toLowerCase();
        if ((s === 'partial' || s === 'partial_arrival') && Number(record.purchaseQuantity) > 0) {
          const pct = Math.round(((Number(record.arrivedQuantity) || 0) / Number(record.purchaseQuantity)) * 100);
          return <Tag color={config.color}>{config.text} {pct}%</Tag>;
        }
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
      render: (v: string) => v ? formatDateTime(v) : '-',
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
      width: 140,
      render: (v: any, record: MaterialPurchaseType) => {
        const dateStr = v ? formatDateTime(v) : '-';
        if (!v || (['completed', 'received', 'cancelled'] as string[]).includes(record.status as string)) {
          return <span>{dateStr}</span>;
        }
        const daysLeft = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
        const riskTag = isNaN(daysLeft) ? null
          : daysLeft < 0 ? <Tag color="red" style={{ fontSize: 10, marginLeft: 4, lineHeight: '16px' }}>已延误{Math.abs(daysLeft)}天</Tag>
          : daysLeft <= 3 ? <Tag color="orange" style={{ fontSize: 10, marginLeft: 4, lineHeight: '16px' }}>仅剩{daysLeft}天</Tag>
          : daysLeft <= 7 ? <Tag color="gold" style={{ fontSize: 10, marginLeft: 4, lineHeight: '16px' }}>需关注</Tag>
          : null;
        return <span>{dateStr}{riskTag}</span>;
      },
    },
    {
      title: '采购时间',
      dataIndex: 'receivedTime',
      key: 'receivedTime',
      width: 160,
      render: (v: string) => v ? formatDateTime(v) : '-',
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
        const status = String(record?.status || '').trim().toLowerCase();
        const isPending = status === MATERIAL_PURCHASE_STATUS.PENDING;
        const canCancelReceive = !isPending
          && !['completed', 'cancelled'].includes(status)
          && !frozen;
        return (
          <RowActions
            actions={[
              {
                key: 'view',
                label: isPending ? '采购' : '查看',
                onClick: () => onView(record),
                primary: true,
              },
              {
                key: 'edit',
                label: '编辑',
                onClick: () => onEdit(record),
                disabled: frozen,
              },
              {
                key: 'remark',
                label: '备注',
                onClick: () => onRemark(record),
              },
              ...(canCancelReceive ? [{
                key: 'cancel-receive',
                label: '取消领取',
                danger: true as const,
                onClick: () => setCancelTarget(record),
              }] : []),
              ...(record.isOrphan ? [{
                key: 'delete-orphan',
                label: '删除孤儿单',
                danger: true as const,
                onClick: () => {
                  Modal.confirm({
                    title: '确认删除此孤儿采购单？',
                    content: '该采购单的父订单已被删除，确认删除此孤儿单？此操作不可撤回。',
                    okText: '确认删除',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => onDelete?.(record),
                  });
                },
              }] : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
    <style>{`.material-row-overdue { background-color: rgba(255, 77, 79, 0.06) !important; }`}</style>
    <RejectReasonModal
      open={cancelTarget !== null}
      title="撤回采购"
      description={cancelTarget ? (
        <div>
          <p style={{ marginBottom: 8 }}>确定撤回「{cancelTarget.materialName || cancelTarget.materialCode}」的采购记录？</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>领取人：{cancelTarget.receiverName || '-'}，到货数量：{formatMaterialQuantityWithUnit(cancelTarget.arrivedQuantity || 0, cancelTarget.unit)}</p>
        </div>
      ) : null}
      fieldLabel="撤回原因"
      okText="确认撤回"
      placeholder="请填写撤回原因（必填）"
      required
      okDanger
      loading={cancelConfirmLoading}
      onOk={handleCancelConfirm}
      onCancel={() => setCancelTarget(null)}
    />
    <ResizableTable<MaterialPurchaseType>
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 'max-content' }}
      rowClassName={(record: MaterialPurchaseType) => {
        const s = String(record.status || '').toLowerCase();
        if (['completed', 'cancelled', 'received'].includes(s)) return '';
        const exp = record.expectedShipDate;
        if (exp && new Date(exp).getTime() < Date.now()) return 'material-row-overdue';
        return '';
      }}
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
    </>
  );
};

export default MaterialTable;
