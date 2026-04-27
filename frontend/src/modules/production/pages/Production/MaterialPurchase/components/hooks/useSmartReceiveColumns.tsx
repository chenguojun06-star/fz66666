import { useMemo } from 'react';
import { Button, InputNumber, Space, Tag, Tooltip } from 'antd';
import { ShopOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialItem, PickingRecord } from '../smartReceiveTypes';
import { getMaterialTypeName, getMaterialTypeColor } from '../smartReceiveHelpers';

type UseSmartReceiveColumnsParams = {
  actionLoading: Record<string, boolean>;
  isSupervisorOrAbove: boolean;
  updatePickQty: (purchaseId: string, value: number | null) => void;
  handleWarehousePick: (item: MaterialItem) => void;
  handlePurchaseOnly: (item: MaterialItem) => void;
  handleCancelPicking: (record: PickingRecord) => void;
};

const renderStatusTag = (status: string, item: MaterialItem) => {
  if (status === 'completed' || status === 'received') return <Tag color="green">已完成</Tag>;
  if (status === 'partial') return <Tag color="orange">部分到料</Tag>;
  if (status === 'cancelled') return <Tag color="default">已取消</Tag>;
  if (status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING) return <Tag color="blue">待仓库出库</Tag>;
  if (status === 'purchasing') return <Tag color="purple">采购中</Tag>;
  if (item.availableStock <= 0) return <Tag color="red">无库存</Tag>;
  if (item.availableStock >= item.requiredQty) return <Tag color="green">库存充足</Tag>;
  return <Tag color="orange">部分有货</Tag>;
};

export const useSmartReceiveColumns = ({
  actionLoading, isSupervisorOrAbove, updatePickQty,
  handleWarehousePick, handlePurchaseOnly, handleCancelPicking,
}: UseSmartReceiveColumnsParams) => {
  const materialColumns = useMemo(() => [
    { title: '物料编号', dataIndex: 'materialCode', key: 'materialCode', width: 100, render: (code: string) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-secondary)' }}>{code || '-'}</span> },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 140, render: (text: string, record: MaterialItem) => (<div><div style={{ fontWeight: 500 }}>{text || '无'}</div>{record.materialType && <Tag color={getMaterialTypeColor(record.materialType)} style={{ fontSize: 11, marginTop: 2 }}>{getMaterialTypeName(record.materialType)}</Tag>}</div>) },
    { title: '颜色/尺码', key: 'colorSize', width: 100, render: (_: unknown, record: MaterialItem) => <span>{record.color || '无'} / {record.size || '无'}</span> },
    { title: '需求数量', dataIndex: 'requiredQty', key: 'requiredQty', width: 90, align: 'center' as const, render: (qty: number, record: MaterialItem) => <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{qty || '无'} {record.unit || ''}</span> },
    { title: '仓库库存', dataIndex: 'availableStock', key: 'availableStock', width: 90, align: 'center' as const, render: (stock: number, record: MaterialItem) => { if (record.purchaseStatus !== 'pending') return <span style={{ color: 'var(--color-text-tertiary)' }}>{stock}</span>; const color = stock <= 0 ? 'var(--color-danger)' : stock < record.requiredQty ? 'var(--color-warning)' : 'var(--color-success)'; return <span style={{ fontWeight: 600, color }}>{stock}</span>; } },
    { title: '领取数量', key: 'pickQty', width: 110, align: 'center' as const, render: (_: unknown, record: MaterialItem) => { if (record.purchaseStatus !== 'pending') return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>; const maxQty = record.availableStock > 0 ? Math.min(record.availableStock, record.requiredQty) : 0; return <InputNumber min={0} max={maxQty} value={record.userPickQty} onChange={(v) => updatePickQty(record.purchaseId, v)} size="small" style={{ width: 80 }} disabled={record.availableStock <= 0} placeholder={record.availableStock <= 0 ? '无库存' : '填写'} />; } },
    { title: '需采购', key: 'purchaseQty', width: 80, align: 'center' as const, render: (_: unknown, record: MaterialItem) => { if (record.purchaseStatus !== 'pending') return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>; const pQty = Math.max(0, record.requiredQty - (record.userPickQty || 0)); if (pQty === 0) return <span style={{ color: 'var(--color-success)', fontWeight: 600 }}> 0</span>; return <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{pQty}</span>; } },
    { title: '状态', key: 'status', width: 85, align: 'center' as const, render: (_: unknown, record: MaterialItem) => renderStatusTag(record.purchaseStatus, record) },
    { title: '操作', key: 'actions', width: 180, render: (_: unknown, record: MaterialItem) => { if (record.purchaseStatus === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING) return <span style={{ color: 'var(--color-primary)', fontSize: 12 }}>⏳ 待仓库出库确认</span>; if (record.purchaseStatus !== 'pending') return <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>已处理</span>; const userPick = record.userPickQty || 0; const remainQty = record.requiredQty - userPick; if (record.availableStock <= 0) return <Button type="primary" size="small" ghost icon={<SendOutlined />} loading={actionLoading[record.purchaseId]} onClick={() => handlePurchaseOnly(record)}>一键采购</Button>; return <Space size={4}><Tooltip title={userPick <= 0 ? '请先填写领取数量' : `领取 ${userPick}${remainQty > 0 ? `，差额 ${remainQty} 自动采购` : ''}`}><Button type="primary" size="small" icon={<ShopOutlined />} disabled={userPick <= 0} loading={actionLoading[record.purchaseId]} onClick={() => handleWarehousePick(record)}>仓库领取</Button></Tooltip></Space>; } },
  ], [actionLoading, updatePickQty, handleWarehousePick, handlePurchaseOnly]);

  const pickingColumns = useMemo(() => [
    { title: '出库单号', dataIndex: 'pickingNo', key: 'pickingNo', width: 160, render: (text: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (status: string) => { if (status === 'cancelled') return <Tag color="red">已撤销</Tag>; if (status === 'pending') return <Tag color="blue">待仓库确认</Tag>; return <Tag color="green">已出库</Tag>; } },
    { title: '领料人', dataIndex: 'pickerName', key: 'pickerName', width: 80 },
    { title: '领料时间', dataIndex: 'pickTime', key: 'pickTime', width: 140, render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
    { title: '物料明细', key: 'items', width: 200, render: (_: unknown, record: PickingRecord) => { const items = record.items || []; if (!items.length) return '-'; return <div>{items.map((item, i) => <div key={i} style={{ fontSize: 12 }}>{item.materialName} {item.color ? `(${item.color})` : ''} × {item.quantity}</div>)}</div>; } },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true },
    ...(isSupervisorOrAbove ? [{ title: '操作', key: 'actions', width: 80, render: (_: unknown, record: PickingRecord) => record.status !== 'cancelled' ? <Button type="link" size="small" danger icon={<UndoOutlined />} onClick={() => handleCancelPicking(record)}>撤销</Button> : <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>已撤销</span> }] : []),
  ], [isSupervisorOrAbove, handleCancelPicking]);

  return { materialColumns, pickingColumns };
};
