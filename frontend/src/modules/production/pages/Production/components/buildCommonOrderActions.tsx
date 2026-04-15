import React from 'react';
import type { RowAction } from '@/components/common/RowActions';
import type { ProductionOrder } from '@/types/production';

type OpenRemarkHandler = (record: ProductionOrder, defaultRole?: string) => void;

interface BuildCommonOrderActionsParams {
  record: ProductionOrder;
  frozen: boolean;
  completed: boolean;
  canManageOrderLifecycle: boolean;
  isSupervisorOrAbove: boolean;
  onQuickEdit?: (record: ProductionOrder) => void;
  handleCloseOrder?: (record: ProductionOrder) => void;
  handleScrapOrder?: (record: ProductionOrder) => void;
  handleTransferOrder?: (record: ProductionOrder) => void;
  handleCopyOrder?: (record: ProductionOrder) => void;
  handleShareOrder?: (record: ProductionOrder) => void;
  onOpenRemark?: OpenRemarkHandler;
}

export function buildCommonOrderActions({
  record,
  frozen,
  completed,
  canManageOrderLifecycle,
  isSupervisorOrAbove,
  onQuickEdit,
  handleCloseOrder,
  handleScrapOrder,
  handleTransferOrder,
  handleCopyOrder,
  handleShareOrder,
  onOpenRemark,
}: BuildCommonOrderActionsParams): RowAction[] {
  return [
    ...(onQuickEdit ? [{
      key: 'quickEdit',
      label: '编辑',
      title: frozen ? '编辑（订单已关单）' : '快速编辑备注和预计出货',
      disabled: frozen,
      onClick: () => onQuickEdit(record),
    }] : []),
    ...(canManageOrderLifecycle && handleCloseOrder ? [
      {
        key: 'close',
        label: <span style={{ color: frozen ? undefined : 'var(--primary-color)' }}>{frozen ? '关单(已完成)' : '关单'}</span>,
        disabled: frozen,
        onClick: () => handleCloseOrder(record),
      },
      ...(isSupervisorOrAbove && handleScrapOrder ? [{
        key: 'scrap',
        label: completed ? '报废(已完成)' : '报废',
        danger: true,
        disabled: completed,
        onClick: () => handleScrapOrder(record),
      }] : []),
      ...(handleTransferOrder ? [{
        key: 'transfer',
        label: '转单',
        title: frozen ? '转单（订单已关单）' : '转给其他人员处理',
        disabled: frozen,
        onClick: () => handleTransferOrder(record),
      }] : []),
      ...(handleCopyOrder ? [{
        key: 'copy',
        label: '复制订单',
        title: '复制此订单（同款不同色/码）',
        onClick: () => handleCopyOrder(record),
      }] : []),
    ] : []),
    ...(handleShareOrder ? [{
      key: 'share',
      label: ' 分享',
      title: '生成客户查看链接（30天有效）',
      onClick: () => handleShareOrder(record),
    }] : []),
    ...(onOpenRemark ? [{
      key: 'remark',
      label: '备注',
      onClick: () => onOpenRemark(record),
    }] : []),
  ];
}
