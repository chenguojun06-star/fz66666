import React from 'react';
import type { ProductionOrder } from '@/types/production';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { isDirectCuttingOrder, isOrderFrozenByStatus, isOrderFrozenByStatusOrStock } from '@/utils/api';
import { buildCommonOrderActions } from '../../../components/buildCommonOrderActions';
import {
  hasSecondaryProcessForOrder,
} from '../riskBadgeRenderers';
import type { UseProductionColumnsProps } from './types';

export function buildActionColumns({
  handleCloseOrder,
  handleScrapOrder,
  handleCopyOrder,
  openProcessDetail,
  syncProcessFromTemplate,
  setPrintModalVisible,
  setPrintingRecord,
  quickEditModal,
  isSupervisorOrAbove,
  handleShareOrder,
  handlePrintLabel,
  canManageOrderLifecycle = false,
  openSubProcessRemap,
  isFactoryAccount = false,
  onOpenRemark,
  openWorkflowEditor,
  onOpenSmartReceive,
}: UseProductionColumnsProps): any[] {
  return [
    {
      title: '操作',
      key: 'action',
      width: 60,
      onCell: () => ({ className: 'prod-act-cell' }),
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatusOrStock(record);
        const completed = isOrderFrozenByStatus(record);
        const directCutting = isDirectCuttingOrder(record as any);

        return (
          <RowActions
            className="table-actions"
            maxInline={1}
            actions={[
              {
                key: 'print',
                label: '打印',
                title: frozen ? '打印（订单已关单）' : '打印生产制单',
                disabled: frozen,
                onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); },
              },
              ...(handlePrintLabel ? [{
                key: 'printLabel',
                label: '打印标签',
                title: '打印洗水唛 / 吊牌',
                onClick: () => handlePrintLabel(record),
              }] : []),
              ...(!isFactoryAccount ? [{  // RowAction[]
                key: 'process',
                label: '工序',
                title: frozen ? '工序（订单已关单）' : '查看工序详情',
                disabled: frozen,
                children: [
                  { key: 'all', label: ' 全部工序', onClick: () => openProcessDetail(record, 'all') },
                  { type: 'divider' },
                  ...(!directCutting ? [{ key: 'procurement', label: '采购', onClick: () => openProcessDetail(record, 'procurement') }] : []),
                  { key: 'cutting', label: '裁剪', onClick: () => openProcessDetail(record, 'cutting') },
                  { key: 'carSewing', label: '车缝', onClick: () => openProcessDetail(record, 'carSewing') },
                  ...(hasSecondaryProcessForOrder(record) ? [{ key: 'secondaryProcess', label: '二次工艺', onClick: () => openProcessDetail(record, 'secondaryProcess') }] : []),
                  { key: 'tailProcess', label: '尾部', onClick: () => openProcessDetail(record, 'tailProcess') },
                  { type: 'divider' },
                  { key: 'syncProcess', label: ' 从模板同步', onClick: () => syncProcessFromTemplate(record) },
                  ...(directCutting && openWorkflowEditor ? [{ key: 'editWorkflow', label: '编辑工序', onClick: () => openWorkflowEditor(record.styleNo) }] : []),
                ],
              }] as RowAction[] : []),
              ...(isFactoryAccount && openSubProcessRemap ? [{
                key: 'subProcessRemap',
                label: '子工序',
                title: frozen ? '子工序单价配置（订单已关单）' : '子工序单价配置',
                disabled: frozen,
                onClick: () => openSubProcessRemap(record),
              }] : []),
              ...(onOpenSmartReceive ? [{
                key: 'smartReceive',
                label: '入库/出库',
                title: '面辅料智能领取（入库/出库）',
                onClick: () => onOpenSmartReceive(record.orderNo || ''),
              }] : []),
              ...buildCommonOrderActions({
                record,
                frozen,
                completed,
                canManageOrderLifecycle,
                isSupervisorOrAbove,
                onQuickEdit: (r) => quickEditModal.open(r),
                handleCloseOrder,
                handleScrapOrder,
                handleCopyOrder,
                handleShareOrder,
                onOpenRemark,
              }),
            ]}
          />
        );
      },
    },
  ];
}
