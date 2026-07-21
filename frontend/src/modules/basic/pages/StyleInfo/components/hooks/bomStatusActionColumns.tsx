import React from 'react';
import { Tag, Space, Button } from 'antd';
import { StyleBom } from '@/types/style';
import RowActions from '@/components/common/RowActions';
import { getStockStatusConfig, type BomColumnsContext } from './bomColumnsHelpers';

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

  return [
    {
      title: '库存状态',
      dataIndex: 'stockStatus',
      width: 110,
      render: (status: string, _record: StyleBom) => {
        if (!status) {
          return <Tag color="default">未检查</Tag>;
        }
        const config = getStockStatusConfig(status);
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '操作',
      dataIndex: 'operation',
      width: 150,
      resizable: false,
      render: (_: unknown, record: StyleBom) => {
        if (locked) {
          return (
            <Space>
              <Tag color="default">已完成</Tag>
              <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
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
