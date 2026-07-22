import React from 'react';
import { Modal } from 'antd';
import RowActions, { RowAction } from '@/components/common/RowActions';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import { message } from '@/utils/antdStatic';
import api from '@/utils/api';
import { printWarehousingQr } from './helpers';
import type { BuildColumnsParams } from './columns';

export function buildActionColumns({ goToDetail, isOrderFrozen }: BuildColumnsParams) {
  return [
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: WarehousingType) => {
        const orderId = String((record as any)?.orderId || '').trim();
        const frozen = isOrderFrozen(orderId);

        const hasWarehouse = Boolean(record.warehouse?.trim());
        const hasWarehousingEndTime = Boolean(record.warehousingEndTime?.trim());
        const isWarehoused = hasWarehouse || hasWarehousingEndTime;

        const qualityStatus = String((record as any)?.qualityStatus || '').trim().toLowerCase();
        const repairStatus = String((record as any)?.repairStatus || '').trim().toLowerCase();
        const bundleStatus = String((record as any)?.bundleStatus || '').trim().toLowerCase();
        const isUnqualified = qualityStatus === 'unqualified';
        const isRepairedWaitingQc = repairStatus === 'repair_done' || bundleStatus === 'repaired_waiting_qc';

        const actions: RowAction[] = [];

        if (isUnqualified && !isRepairedWaitingQc) {
          const isRepairing = repairStatus === 'repairing';
          const bundleId = String((record as any)?.cuttingBundleId || '').trim();

          if (isRepairing) {
            actions.push({
              key: 'markRepaired',
              label: '返修完成',
              title: '标记为返修完成，进入重新质检',
              disabled: frozen,
              onClick: () => {
                if (!bundleId) {
                  message.warning('缺少菲号信息，无法操作');
                  return;
                }
                Modal.confirm({
                  title: '确认返修完成',
                  content: '确认该菲号已完成返修，可重新进行质检？',
                  onOk: async () => {
                    try {
                      const res = await api.post<{ code: number; message?: string }>(
                        '/production/warehousing/mark-bundle-repaired',
                        { bundleId }
                      );
                      if (res.code === 200) {
                        message.success('已标记为返修完成，可重新进行质检');
                        window.location.reload();
                      } else {
                        message.error(res.message || '操作失败');
                      }
                    } catch {
                      message.error('操作失败，请稍后重试');
                    }
                  },
                });
              },
              primary: false,
            });
          } else {
            actions.push({
              key: 'startRepair',
              label: '开始返修',
              title: '标记为返修中',
              disabled: frozen,
              onClick: () => {
                if (!bundleId) {
                  message.warning('缺少菲号信息，无法操作');
                  return;
                }
                Modal.confirm({
                  title: '确认开始返修',
                  content: '确认开始返修该菲号？',
                  onOk: async () => {
                    try {
                      const operatorName = String((record as any)?.qualityOperatorName || '').trim();
                      const res = await api.post<{ code: number; message?: string }>(
                        '/production/warehousing/mark-bundle-repairing',
                        { bundleId, operatorName }
                      );
                      if (res.code === 200) {
                        message.success('已开始返修');
                        window.location.reload();
                      } else {
                        message.error(res.message || '操作失败');
                      }
                    } catch {
                      message.error('操作失败，请稍后重试');
                    }
                  },
                });
              },
              primary: true,
            });

            actions.push({
              key: 'scrapBundle',
              label: '报废',
              title: '报废该菲号（不可撤销）',
              disabled: frozen,
              onClick: () => {
                if (!bundleId) {
                  message.warning('缺少菲号信息，无法操作');
                  return;
                }
                Modal.confirm({
                  title: '报废确认',
                  content: '确认报废该菲号？此操作不可撤销。',
                  okText: '确认报废',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: async () => {
                    try {
                      const res = await api.post<{ code: number; message?: string }>(
                        '/production/warehousing/scrap-bundle',
                        { bundleId }
                      );
                      if (res.code === 200) {
                        message.success('已报废');
                        window.location.reload();
                      } else {
                        message.error(res.message || '操作失败');
                      }
                    } catch {
                      message.error('操作失败，请稍后重试');
                    }
                  },
                });
              },
              primary: false,
            });
          }
        }

        if (isRepairedWaitingQc) {
          actions.push({
            key: 'reInspect',
            label: '重新质检',
            title: '对返修后的产品进行重新质检',
            disabled: frozen,
            onClick: () => goToDetail(record, 'inspect'),
            primary: true,
          });
        }

        actions.push({
          key: 'inspect',
          label: '质检',
          title: frozen ? '质检（订单已关单）' : '质检查看',
          disabled: frozen,
          onClick: () => goToDetail(record, 'inspect'),
          primary: !isRepairedWaitingQc,
        });

        actions.push({
          key: 'complete',
          label: '入库',
          title: isWarehoused ? '已入库' : (frozen ? '入库（订单已关单）' : '入库'),
          disabled: frozen || !orderId || isWarehoused,
          onClick: () => goToDetail(record, 'warehousing'),
          primary: false,
        });

        if (isWarehoused) {
          actions.push({
            key: 'printQr',
            label: '打印二维码',
            onClick: () => printWarehousingQr(
              String(record.warehousingNo || '').trim(),
              String((record as any).orderNo || '').trim()
            ),
          });
        }

        return <RowActions actions={actions} />;
      },
    },
  ];
}
