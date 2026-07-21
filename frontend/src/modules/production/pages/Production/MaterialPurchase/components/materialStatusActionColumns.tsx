import { Tag, Modal } from 'antd';
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

/**
 * 状态/时间/操作列：状态/来源/下单时间/预计出货/采购时间/采购完成/采购员/备注/操作
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
  } = params;
  return [
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
                disabled: frozen || Number(record?.returnConfirmed || 0) === 1,
              },
              ...(canConfirmArrival && Number(record?.returnConfirmed || 0) !== 1 ? [{
                key: 'confirm-arrival',
                label: '到货入库',
                onClick: () => {
                  const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                  arrivalForm.setFieldsValue({ arrivedQuantity: maxQty });
                  setArrivalTarget(record);
                },
              }] : []),
              ...(onConfirmReturn && [MATERIAL_PURCHASE_STATUS.RECEIVED, MATERIAL_PURCHASE_STATUS.PARTIAL, MATERIAL_PURCHASE_STATUS.COMPLETED].includes(status as any) && Number(record?.returnConfirmed || 0) !== 1 ? [{
                key: 'confirm-return',
                label: Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认',
                onClick: () => onConfirmReturn(record),
              }] : []),
              ...(onReturnReset && (Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && isSupervisorOrAbove ? [{
                key: 'return-reset',
                label: '退回',
                onClick: () => onReturnReset(record),
              }] : []),
              ...(onQualityIssue && [MATERIAL_PURCHASE_STATUS.RECEIVED, MATERIAL_PURCHASE_STATUS.PARTIAL, MATERIAL_PURCHASE_STATUS.COMPLETED].includes(status as any) && Number(record?.returnConfirmed || 0) !== 1 ? [{
                key: 'quality-issue',
                label: '品质异常',
                onClick: () => onQualityIssue(record),
              }] : []),
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
};
