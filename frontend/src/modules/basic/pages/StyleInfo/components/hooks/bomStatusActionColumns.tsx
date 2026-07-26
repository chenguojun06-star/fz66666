import React from 'react';
import { Tag, Space, Button, Tooltip } from 'antd';
import { StyleBom } from '@/types/style';
import RowActions from '@/components/common/RowActions';
import { getStockStatusConfig, type BomColumnsContext } from './bomColumnsHelpers';

/**
 * 渲染库存状态 + 可领取的库存数量
 * - 库存充足：显示绿色 Tag + 可点击的库存数量（点击触发领取）
 * - 库存不足：显示橙色 Tag + 可用数量（不可点击）
 * - 无库存：显示红色 Tag
 * - 未检查：显示灰色 Tag
 */
const StockStatusCell: React.FC<{
  record: StyleBom;
  onApplyPickup?: (record: StyleBom) => void;
  disabled: boolean;
}> = ({ record, onApplyPickup, disabled }) => {
  const status = record.stockStatus;
  if (!status) {
    return <Tag color="default">未检查</Tag>;
  }
  const config = getStockStatusConfig(status);
  const stockNum = record.availableStock;
  const hasStockNum = stockNum != null && stockNum > 0;
  const stockText = hasStockNum ? `${stockNum}${record.unit || ''}` : '';
  const canPickup = status === 'sufficient' && !!onApplyPickup && !disabled && hasStockNum;

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
};

/**
 * 状态与操作列：库存状态 / 操作
 */
export const buildStatusActionColumns = (ctx: BomColumnsContext) => {
  const {
    locked,
    tableEditable,
    editingKey,
    isEditing,
    isSupervisorOrAbove,
    isTempId,
    handleDelete,
    save,
    cancel,
    edit,
    onApplyPickup,
    modal,
  } = ctx;

  // 领取是否可用：编辑中禁用
  const pickupDisabled = editingKey !== '';

  return [
    {
      title: '库存状态',
      dataIndex: 'stockStatus',
      width: 130,
      render: (_: unknown, record: StyleBom) => (
        <StockStatusCell record={record} onApplyPickup={onApplyPickup} disabled={pickupDisabled} />
      ),
    },
    {
      title: '操作',
      dataIndex: 'operation',
      width: 150,
      resizable: false,
      render: (_: unknown, record: StyleBom) => {
        // locked（已完成）时仍允许领取，仅禁止编辑/删除
        if (locked) {
          const canPickup = record.stockStatus === 'sufficient' && !!onApplyPickup && !pickupDisabled;
          return (
            <Space>
              <Tag color="default">已完成</Tag>
              {canPickup ? (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => onApplyPickup!(record)}
                >
                  领取
                </Button>
              ) : (
                <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
              )}
            </Space>
          );
        }
        if (tableEditable) {
          return (
            <Button
              danger
              onClick={() => {
                if (isTempId(record.id)) {
                  handleDelete(record.id!);
                } else {
                  modal.confirm({
                    width: '30vw',
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id!),
                  });
                }
              }}
            >
              删除
            </Button>
          );
        }
        if (!isSupervisorOrAbove) {
          return null;
        }
        const editable = isEditing(record);
        return editable ? (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'save',
                label: '保存',
                title: '保存',
                onClick: () => save(String(record.id!)),
                primary: true,
              },
              {
                key: 'cancel',
                label: '取消',
                title: '取消',
                onClick: () => {
                  modal.confirm({
                    width: '30vw',
                    title: '确定取消?',
                    onOk: cancel,
                  });
                },
              },
            ]}
          />
        ) : (
          <RowActions
            maxInline={3}
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                disabled: editingKey !== '',
                onClick: () => edit(record),
                primary: true,
              },
              {
                key: 'apply_pickup',
                label: '领取',
                title: record.stockStatus === 'sufficient' ? '申请领取面辅料' : '需先检查库存且库存充足才可申请',
                disabled: editingKey !== '' || !onApplyPickup || record.stockStatus !== 'sufficient',
                onClick: () => onApplyPickup?.(record),
              },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                danger: true,
                disabled: editingKey !== '',
                onClick: () => {
                  if (isTempId(record.id)) {
                    handleDelete(record.id!);
                  } else {
                    modal.confirm({
                      width: '30vw',
                      title: '确定删除?',
                      onOk: () => handleDelete(record.id!),
                    });
                  }
                },
              },
            ]}
          />
        );
      },
    },
  ];
};
