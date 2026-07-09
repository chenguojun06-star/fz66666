import React, { useState } from 'react';
import { Tag, App, Space, Tooltip, Modal, InputNumber, Form, Button, Checkbox, Descriptions } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import SmallModal from '@/components/common/SmallModal';

import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '@/types/production';
import { formatMaterialSpecWidth } from '@/utils/materialType';
import { formatMoney } from '@/utils/format';
import { analyzePurchase, renderPurchaseTooltip } from '../utils/purchaseIntelligence';
import { formatDateTime } from '@/utils/datetime';
import { formatMaterialQuantityWithUnit, formatReferenceKilograms, getStatusConfig, subtractMaterialQuantity } from '../utils';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { ORDER_BIZ_TYPE_MAP } from '@/constants/statusMaps';
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
  onConfirmReturn?: (record: MaterialPurchaseType) => void;
  onReturnReset?: (record: MaterialPurchaseType) => void;
  onQualityIssue?: (record: MaterialPurchaseType) => void;
  isSupervisorOrAbove?: boolean;
  onOpenDetail?: (styleNo: string, orderNo?: string) => void;
  onBatchAddToCart?: (records: MaterialPurchaseType[]) => void;
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
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  isSupervisorOrAbove,
  onOpenDetail,
  onBatchAddToCart,
}) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [, setCancelLoading] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<MaterialPurchaseType[]>([]);
  const [cancelTarget, setCancelTarget] = useState<MaterialPurchaseType | null>(null);
  const [cancelConfirmLoading, setCancelConfirmLoading] = useState(false);
  const [arrivalTarget, setArrivalTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalLoading, setArrivalLoading] = useState(false);
  const [arrivalForm] = Form.useForm();

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
        <StyleCoverThumb 
          styleId={record.styleId} 
          styleNo={record.styleNo} 
          src={record.styleCover || null} 
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={40} 
          borderRadius={6} 
        />
      )
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (v: any) => {
        const styleNo = String(v || '').trim();
        return <span>{styleNo || '-'}</span>;
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
            <Tooltip title={tooltipContent} placement="right" color="white" styles={{ container: { color: 'var(--color-text-primary)', boxShadow: '0 3px 12px rgba(0,0,0,0.12)' } }}>
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
            <FactoryTypeTag factoryType={type} />
            <SupplierNameTooltip name={name} />
            {bizType && <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{ORDER_BIZ_TYPE_MAP[bizType]?.text ?? '未知'}</Tag>}
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
      render: (v: string, record: MaterialPurchaseType) => {
        const styleNo = String(record.styleNo || '').trim();
        const orderNo = String((record as any).orderNo || '').trim();
        const purchaseNo = String(record.purchaseNo || v || '').trim();
        if (!v || v === '-') return '-';
        return (
          <a
            onClick={() => {
              if (onOpenDetail) {
                if (styleNo) {
                  onOpenDetail(styleNo, orderNo);
                } else if (purchaseNo) {
                  onOpenDetail('_', purchaseNo);
                }
              } else {
                if (styleNo) {
                  // 有款号：按款号+订单号跳转
                  const qs = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : '';
                  navigate(`/production/material/${encodeURIComponent(styleNo)}${qs}`);
                } else if (purchaseNo) {
                  // 无款号（如仓库独立采购单）：按采购单号跳转
                  navigate(`/production/material/_?purchaseNo=${encodeURIComponent(purchaseNo)}`);
                }
              }
            }}
            style={{ color: 'var(--color-primary)', cursor: 'pointer' }}
          >
            {v}
          </a>
        );
      },
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
      render: (v: number) => Number.isFinite(Number(v)) ? formatMoney(Number(v)) : '-',
    },
    {
      title: '对账状态',
      dataIndex: 'reconciliationStatus',
      key: 'reconciliationStatus',
      width: 100,
      render: (_: any, record: MaterialPurchaseType) => {
        const status = (record as any).reconciliationStatus;
        if (!status) return <span style={{ color: 'var(--color-text-tertiary)' }}>未对账</span>;
        const statusMap: Record<string, { text: string; color: string }> = {
          pending: { text: '待核对', color: 'orange' },
          verified: { text: '已核对', color: 'blue' },
          approved: { text: '已审批', color: 'cyan' },
          paid: { text: '已付款', color: 'green' },
          rejected: { text: '已驳回', color: 'red' },
        };
        const cfg = statusMap[status];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : <span>未知</span>;
      },
    },
    {
      title: '结算金额',
      dataIndex: 'settlementAmount',
      key: 'settlementAmount',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const amount = (record as any).settlementAmount;
        return Number.isFinite(Number(amount)) ? formatMoney(Number(amount)) : '-';
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

  return (
    <>
    <style>{`.material-row-overdue { background-color: rgba(255, 77, 79, 0.06) !important; }`}</style>
    <RejectReasonModal
      open={cancelTarget !== null}
      title="撤回采购"
      description={cancelTarget ? (
        <div>
          <p style={{ marginBottom: 8 }}>确定撤回「{cancelTarget.materialName || cancelTarget.materialCode}」的采购记录？</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>领取人：{cancelTarget.receiverName || '-'}，到货数量：{formatMaterialQuantityWithUnit(cancelTarget.arrivedQuantity || 0, cancelTarget.unit)}</p>
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
    <SmallModal
      open={Boolean(arrivalTarget)}
      title={`${arrivalTarget?.materialName || arrivalTarget?.materialCode || ''} — 到货入库`}
      okText="确认入库"
      confirmLoading={arrivalLoading}
      onOk={() => arrivalForm.submit()}
      onCancel={() => { setArrivalTarget(null); arrivalForm.resetFields(); }}
      destroyOnHidden
    >
      <Form form={arrivalForm} layout="vertical" onFinish={async (values) => {
        if (!arrivalTarget) return;
        setArrivalLoading(true);
        try {
          await api.post('/production/material/inbound/confirm-arrival', { purchaseId: arrivalTarget.id, arrivedQuantity: values.arrivedQuantity });
          message.success('入库成功，库存已更新');
          setArrivalTarget(null);
          arrivalForm.resetFields();
          onRefresh?.();
        } catch { message.error('入库失败'); }
        finally { setArrivalLoading(false); }
      }}>
        <Descriptions bordered column={3} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="物料类型">{arrivalTarget?.materialType ? <MaterialTypeTag value={arrivalTarget.materialType} /> : '-'}</Descriptions.Item>
          <Descriptions.Item label="物料名称">{arrivalTarget?.materialName || '-'}</Descriptions.Item>
          <Descriptions.Item label="物料编码">{arrivalTarget?.materialCode || '-'}</Descriptions.Item>
          <Descriptions.Item label="颜色">{arrivalTarget?.color || '-'}</Descriptions.Item>
          <Descriptions.Item label="规格/幅宽">{formatMaterialSpecWidth(arrivalTarget?.specifications, arrivalTarget?.fabricWidth)}</Descriptions.Item>
          <Descriptions.Item label="单位">{arrivalTarget?.unit || '-'}</Descriptions.Item>
          <Descriptions.Item label="采购数量">{formatMaterialQuantityWithUnit(arrivalTarget?.purchaseQuantity, arrivalTarget?.unit)}</Descriptions.Item>
          <Descriptions.Item label="已到货">{formatMaterialQuantityWithUnit(arrivalTarget?.arrivedQuantity || 0, arrivalTarget?.unit)}</Descriptions.Item>
          <Descriptions.Item label="待到货">{formatMaterialQuantityWithUnit(arrivalTarget ? Math.max(0, Number(arrivalTarget.purchaseQuantity || 0) - Number(arrivalTarget.arrivedQuantity || 0)) : 0, arrivalTarget?.unit)}</Descriptions.Item>
        </Descriptions>
        <Form.Item name="arrivedQuantity" label="本次到货数量" rules={[{ required: true, message: '请输入到货数量' }]}>
          <InputNumber
            min={0.01}
            max={arrivalTarget ? Math.max(0.01, Number(arrivalTarget.purchaseQuantity || 0) - Number(arrivalTarget.arrivedQuantity || 0)) : 1}
            step={0.01} precision={2}
            style={{ width: '100%' }}
            placeholder="请输入到货数量（支持小数）"
            autoFocus
          />
        </Form.Item>
      </Form>
    </SmallModal>
    {selectedRows.length > 0 && (
      <div style={{
        padding: '8px 16px',
        marginBottom: 8,
        background: 'var(--color-bg-highlight)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Space>
          <span>已选择 <strong>{selectedRows.length}</strong> 项</span>
          <Button size="small" onClick={() => setSelectedRows([])}>清空</Button>
        </Space>
        <Button
          type="primary"
          icon={<ShoppingCartOutlined />}
          size="small"
          onClick={() => onBatchAddToCart?.(selectedRows)}
        >
          加入购物车
        </Button>
      </div>
    )}
    <ResizableTable<MaterialPurchaseType>
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      emptyDescription="暂无采购任务"
      rowSelection={{
        selectedRowKeys: selectedRows.map(r => r.id as string),
        onChange: (keys, rows) => setSelectedRows(rows),
      }}
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
        pageSizeOptions: ['20', '50', '100', '200'],
        size: isMobile ? 'small' : 'default',
      }}
    />
    </>
  );
};

export default MaterialTable;
