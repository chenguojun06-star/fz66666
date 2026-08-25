import { Tag, Modal, Button, Space, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import RowActions from '@/components/common/RowActions';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import { getStatusConfig } from '../utils';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import {
  cleanRemark,
  resolveCompletedTime,
  resolveOperatorName,
} from './MaterialTable.helpers';
import type { UseMaterialColumnsParams } from './useMaterialColumns';

// 库存状态配置（与 BOM 列表保持一致）
const STOCK_STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  sufficient: { color: 'success', text: '库存充足' },
  insufficient: { color: 'warning', text: '库存不足' },
  none: { color: 'error', text: '无库存' },
  unchecked: { color: 'default', text: '未检查' },
};

/**
 * 状态/时间/操作列：库存状态/状态/来源/下单时间/预计出货/采购时间/采购完成/采购员/备注/操作
 */
export const buildStatusActionColumns = (params: UseMaterialColumnsParams): ColumnsType<MaterialPurchaseType> => {
  const {
    sortField,
    sortOrder,
    onSort,
    purchaseSortField,
    purchaseSortOrder,
    onPurchaseSort,
    isOrderFrozenForRecord,
    onView,
    onEdit,
    onRemark,
    onDelete,
    onConfirmReturn,
    onReturnReset,
    onQualityIssue,
    isSupervisorOrAbove,
    arrivalForm,
    setArrivalTarget,
    setCancelTarget,
    onApplyPickup,
  } = params;
  return [
    {
      title: '库存/领取',
      dataIndex: 'stockStatus',
      key: 'stockStatus',
      width: 130,
      render: (_: unknown, record: MaterialPurchaseType) => {
        const status = record.stockStatus;
        if (!status) {
          return <Tag color="default">未检查</Tag>;
        }
        const config = STOCK_STATUS_CONFIG[status] || { color: 'default', text: status };
        const stockNum = record.availableStock;
        const hasStockNum = stockNum != null && stockNum > 0;
        const stockText = hasStockNum ? `${stockNum}${record.unit || ''}` : '';
        // 领取按钮：库存充足 + 有库存数 + 采购状态非终态（completed/cancelled 不可再领取）
        const recordStatus = String(record?.status || '').toLowerCase();
        const canPickup = status === 'sufficient'
          && !!onApplyPickup
          && hasStockNum
          && !['completed', 'cancelled'].includes(recordStatus);

        if (canPickup) {
          return (
            <Space direction="vertical" size={2} style={{ lineHeight: 1.4 }}>
              <Tag color={config.color} style={{ margin: 0 }}>{config.text}</Tag>
              <Tooltip title="点击领取">
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto', fontSize: '13px', fontWeight: 500 }}
                  onClick={() => onApplyPickup!(record)}
                >
                  {stockText} · 领取
                </Button>
              </Tooltip>
            </Space>
          );
        }
        return (
          <Space direction="vertical" size={2} style={{ lineHeight: 1.4 }}>
            <Tag color={config.color} style={{ margin: 0 }}>{config.text}</Tag>
            {stockText && (
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{stockText}</span>
            )}
          </Space>
        );
      },
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
          : daysLeft < 0 ? <Tag color="red" style={{ fontSize: 14, marginLeft: 4, lineHeight: '16px' }}>已延误{Math.abs(daysLeft)}天</Tag>
          : daysLeft <= 3 ? <Tag color="orange" style={{ fontSize: 14, marginLeft: 4, lineHeight: '16px' }}>仅剩{daysLeft}天</Tag>
          : daysLeft <= 7 ? <Tag color="gold" style={{ fontSize: 14, marginLeft: 4, lineHeight: '16px' }}>需关注</Tag>
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
        const canConfirmArrival = ['received', 'partial', 'partial_arrival'].includes(status) && !frozen;
        return (
          <RowActions
            revealOnHover
            actions={[
              {
                key: 'view',
                label: isPending ? '去采购' : '查看',
                title: isPending ? '打开采购详情，登记领取与到货' : '查看采购详情',
                onClick: () => onView(record),
                primary: true,
              },
              {
                key: 'edit',
                label: '编辑',
                title: '编辑采购信息',
                onClick: () => onEdit(record),
                disabled: frozen || Number(record?.returnConfirmed || 0) === 1,
              },
              ...(canConfirmArrival && Number(record?.returnConfirmed || 0) !== 1 ? [{
                key: 'confirm-arrival',
                label: '登记到货',
                title: '登记本次到货数量',
                onClick: () => {
                  const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                  arrivalForm.setFieldsValue({ arrivedQuantity: maxQty });
                  setArrivalTarget(record);
                },
              }] : []),
              ...(onConfirmReturn && [MATERIAL_PURCHASE_STATUS.RECEIVED, MATERIAL_PURCHASE_STATUS.PARTIAL, MATERIAL_PURCHASE_STATUS.COMPLETED].includes(status as any) && Number(record?.returnConfirmed || 0) !== 1 ? [{
                key: 'confirm-return',
                label: '回料确认',
                title: '确认物料已回料到仓库',
                onClick: () => onConfirmReturn(record),
              }] : []),
              ...(onReturnReset && Number(record?.returnConfirmed || 0) === 1 && isSupervisorOrAbove ? [{
                key: 'return-reset',
                label: '退回',
                title: '退回已确认的回料',
                onClick: () => onReturnReset(record),
              }] : []),
              ...(onQualityIssue && [MATERIAL_PURCHASE_STATUS.RECEIVED, MATERIAL_PURCHASE_STATUS.PARTIAL, MATERIAL_PURCHASE_STATUS.COMPLETED].includes(status as any) && Number(record?.returnConfirmed || 0) !== 1 ? [{
                key: 'quality-issue',
                label: '品质异常',
                title: '登记物料品质问题',
                onClick: () => onQualityIssue(record),
              }] : []),
              {
                key: 'remark',
                label: '备注',
                title: '查看/编辑备注',
                onClick: () => onRemark(record),
              },
              ...(canCancelReceive ? [{
                key: 'cancel-receive',
                label: '撤回采购',
                title: '撤回已领取的采购，恢复为待处理',
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
};
