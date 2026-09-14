import React, { useMemo } from 'react';
import { Table, Checkbox, InputNumber, Button, Popconfirm, Empty, Spin, Tag, App, Tooltip, Image } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, ScissorOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { PurchaseCartItem, UpdateCartItemRequest } from '@/types/purchaseCart';

interface CartListProps {
  items: PurchaseCartItem[];
  loading: boolean;
  selectedItems: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdate: (id: string, data: UpdateCartItemRequest) => void;
  onDelete: (id: string) => void;
  onSplit: (id: string, splitQuantity: number) => void;
  submitting: boolean;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  FABRIC:    { label: '面料',   color: 'blue' },
  LINING:    { label: '里料',   color: 'cyan' },
  ACCESSORY: { label: '辅料',   color: 'orange' },
  OTHER:     { label: '其他',   color: 'default' },
};

const SOURCE_LABELS: Record<string, string> = {
  ORDER: '订单',
  SAMPLE: '样衣',
  BATCH: '批次',
  PURCHASE_TASK: '采购任务',
};

interface EditingState {
  [id: string]: number | undefined;
}

export const CartList: React.FC<CartListProps> = ({
  items,
  loading,
  selectedItems,
  onToggleSelect,
  onToggleSelectAll,
  onUpdate,
  onDelete,
  submitting,
}) => {
  const { message } = App.useApp();
  const [editingMap, setEditingMap] = React.useState<EditingState>({});

  const allSelected = items.length > 0 && selectedItems.size === items.length;
  const indeterminate = selectedItems.size > 0 && !allSelected;

  const columns: ColumnsType<PurchaseCartItem> = useMemo(() => {
    const startEdit = (id: string, current: number) => {
      setEditingMap(prev => ({ ...prev, [id]: current }));
    };

    const cancelEdit = (id: string) => {
      setEditingMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    const saveEdit = (id: string) => {
      const value = editingMap[id];
      if (value === undefined || value <= 0) {
        message.warning('数量必须大于 0');
        return;
      }
      onUpdate(id, { quantity: value });
      cancelEdit(id);
    };
    return [
    {
      title: '图片',
      dataIndex: 'styleImageUrl',
      width: 60,
      fixed: 'left',
      render: (url: string, record: any) => {
        const imgUrl = url || record.styleImageUrl;
        if (!imgUrl) {
          return (
            <div className="u-br-4 u-d-flex u-ai-center u-jc-center u-fs-10" style={{ width: 40, height: 40, background: 'var(--color-bg-base)', color: 'var(--color-text-tertiary)' }}>
              无图
            </div>
          );
        }
        return <Image src={imgUrl} width={40} height={40} className="u-br-4 u-objf-cover" />;
      },
    },
    {
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          onChange={onToggleSelectAll}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>
            全选 ({selectedItems.size}/{items.length})
          </span>
        </Checkbox>
      ),
      dataIndex: 'id',
      width: 180,
      fixed: 'left',
      render: (id: string, item) => (
        <Checkbox checked={selectedItems.has(id)} onChange={() => onToggleSelect(id)}>
          <div className="u-d-inline-flex u-fd-column u-ml-4" style={{ gap: 2 }}>
            <span className="u-fw-600" style={{ color: 'var(--color-text-primary)' }}>
              {item.materialName}
            </span>
            <span className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>
              {item.materialCode}
              {item.specifications ? ` · ${item.specifications}` : ''}
              {item.color ? ` · ${item.color}` : ''}
            </span>
            {item.styleNo && (
              <span className="u-fs-12 u-cur-pointer" style={{ color: 'var(--color-primary)' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(`/production/material/${encodeURIComponent(item.styleNo ?? '')}`, '_blank');
                }}>
                款号: {item.styleNo}（点击查看详情）
              </span>
            )}
          </div>
        </Checkbox>
      ),
    },
    {
      title: '类型',
      dataIndex: 'materialType',
      width: 80,
      render: (type: string) => {
        const meta = TYPE_LABELS[type] || TYPE_LABELS.OTHER;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '来源',
      key: 'source',
      width: 200,
      render: (_, item) => (
        <div className="u-d-flex u-fd-column" style={{ gap: 2 }}>
          <span className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>
            {SOURCE_LABELS[item.sourceType] ?? '未知'}
          </span>
          {item.sourceNo && (
            <Tooltip title={item.sourceNo}>
              <span className="u-fs-12" style={{ fontFamily: 'monospace' }}>
                {item.sourceNo}
              </span>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      width: 160,
      render: (name?: string) => name || <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>,
    },
    {
      title: '数量',
      key: 'quantity',
      width: 140,
      align: 'right',
      render: (_, item) => {
        const isEditing = editingMap[item.id] !== undefined;
        if (isEditing) {
          return (
            <InputNumber
              size="small"
              value={editingMap[item.id]}
              onChange={(v) => setEditingMap(prev => ({ ...prev, [item.id]: (v as number) || 0 }))}
              min={0.01}
              precision={2}
              style={{ width: 90 }}
              autoFocus
              onPressEnter={() => saveEdit(item.id)}
            />
          );
        }
        return (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {item.quantity} <span style={{ color: 'var(--color-text-secondary)' }}>{item.unit}</span>
          </span>
        );
      },
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      width: 110,
      align: 'right',
      render: (amount?: number) => amount
        ? <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' }}>¥{amount.toFixed(2)}</span>
        : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_, item) => {
        const isEditing = editingMap[item.id] !== undefined;
        if (isEditing) {
          return (
            <div className="u-d-flex u-gap-4">
              <Button
                type="text"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => saveEdit(item.id)}
                loading={submitting}
              />
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => cancelEdit(item.id)}
              />
            </div>
          );
        }
        return (
          <div className="u-d-flex" style={{ gap: 0 }}>
            <Tooltip title="编辑数量">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => startEdit(item.id, item.quantity)}
              />
            </Tooltip>
            <Tooltip title="拆分行">
              <Button
                type="text"
                size="small"
                icon={<ScissorOutlined />}
                disabled={item.quantity <= 1}
                onClick={() => startEdit(item.id, item.quantity)}
              />
            </Tooltip>
            <Popconfirm
              title="确认删除该物料？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(item.id)}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </div>
        );
      },
    },
  ]; }, [items, selectedItems, allSelected, indeterminate, editingMap, submitting, onToggleSelect, onToggleSelectAll, onUpdate, onDelete, message]);

  if (loading) {
    return (
      <div className="u-ta-center" style={{ padding: '80px 0' }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return <Empty description="购物车是空的" style={{ margin: '60px 0' }} />;
  }

  return (
    <div className="purchase-cart-table">
      <Table<PurchaseCartItem>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={items}
        pagination={false}
        scroll={{ x: 1100, y: 'calc(100vh - 360px)' }}
        rowClassName={(item) => selectedItems.has(item.id) ? 'row-selected' : ''}
        onRow={(item) => ({
          onClick: (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('.ant-checkbox-wrapper') || target.closest('.ant-input-number')) {
              return;
            }
            onToggleSelect(item.id);
          },
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
};

export default CartList;
