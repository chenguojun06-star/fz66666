import { useCallback } from 'react';
import { Tag } from 'antd';
import type { ProductionOrder } from '@/types/production';
import { buildCommonOrderActions } from '../../components/buildCommonOrderActions';

interface UseCardViewConfigParams {
  isOrderFrozenByStatus: (record: ProductionOrder) => boolean;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => Promise<void>;
  handleFactoryShip: (record: ProductionOrder) => void;
  handleQuickEdit: (record: ProductionOrder) => void;
  handleShareOrder: (record: ProductionOrder) => void;
  handleCloseOrder: (record: ProductionOrder) => void;
  onOpenRemark?: (record: ProductionOrder) => void;
  isFactoryAccount: boolean;
  canManageOrderLifecycle: boolean;
  embedded: boolean;
}

export function useCardViewConfig({
  isOrderFrozenByStatus,
  setPrintingRecord,
  handlePrintLabel,
  handleFactoryShip,
  handleQuickEdit,
  handleShareOrder,
  handleCloseOrder,
  onOpenRemark,
  isFactoryAccount,
  canManageOrderLifecycle,
  embedded,
}: UseCardViewConfigParams) {
  const cardActions = useCallback((record: ProductionOrder) => {
    const frozen = isOrderFrozenByStatus(record);
    const frozenTitle = '订单已关单/报废/完成，无法操作';
    const commonActions = buildCommonOrderActions({
      record,
      frozen,
      completed: frozen,
      canManageOrderLifecycle: !embedded && canManageOrderLifecycle,
      isSupervisorOrAbove: false,
      onQuickEdit: handleQuickEdit,
      handleCloseOrder,
      handleShareOrder,
      onOpenRemark,
    });

    return [
      {
        key: 'print',
        label: '打印',
        disabled: frozen,
        title: frozen ? frozenTitle : '打印',
        ...(embedded ? { iconOnly: true } : {}),
        onClick: () => setPrintingRecord(record),
      },
      {
        key: 'printLabel',
        label: '打印标签',
        disabled: frozen,
        title: frozen ? frozenTitle : '打印标签',
        onClick: () => void handlePrintLabel(record),
      },
      ...(isFactoryAccount ? [{
        key: 'ship',
        label: '发货',
        disabled: frozen,
        title: frozen ? frozenTitle : '发货',
        onClick: () => handleFactoryShip(record),
      }] : []),
      ...(commonActions.length ? [{
        key: 'divider1',
        type: 'divider' as const,
      }] : []),
      ...commonActions,
    ].filter(Boolean);
  }, [isOrderFrozenByStatus, setPrintingRecord, handlePrintLabel, handleFactoryShip, handleQuickEdit, handleShareOrder, handleCloseOrder, onOpenRemark, isFactoryAccount, canManageOrderLifecycle, embedded]);

  const titleTags = useCallback((record: any) => (
    <>
      {(record as ProductionOrder).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
      {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
      {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
    </>
  ), []);

  return { cardActions, titleTags };
}
