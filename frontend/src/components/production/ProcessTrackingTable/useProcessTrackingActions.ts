import React, { useCallback } from 'react';
import { App } from 'antd';
import { productionScanApi } from '@/services/production/productionApi';
import { formatProcessDisplayName } from '@/utils/productionStage';
import { useUser, isAdminUser } from '@/utils/AuthContext';
import { generateRequestId } from '@/utils/api';
import type { ProcessTrackingRecord } from './processTrackingFilter';

export function useProcessTrackingActions(
  orderId?: string,
  orderNo?: string,
  nodeType?: string,
  processType?: string,
  onUndoSuccess?: () => void,
) {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const _isAdmin = isAdminUser(user);

  const resolveScanType = useCallback((record: ProcessTrackingRecord) => {
    const processCode = String(record.processCode || '').trim().toLowerCase();
    const processName = String(record.processName || '').trim();
    const currentType = String(processType || nodeType || '').trim();
    if (currentType === 'warehousing' || currentType === '入库' || processCode.startsWith('warehousing') || ['入库', '质检入库', '次品入库'].includes(processName)) {
      return 'warehouse';
    }
    if (currentType === 'cutting' || currentType === '裁剪' || processCode.startsWith('cutting') || processName === '裁剪') {
      return 'cutting';
    }
    if (currentType === 'procurement' || currentType === '采购' || processCode.startsWith('procurement') || processName.includes('采购')) {
      return 'production';
    }
    return 'production';
  }, [nodeType, processType]);

  const resolveProgressStage = useCallback((record: ProcessTrackingRecord) => {
    const processCode = String(record.processCode || '').trim().toLowerCase();
    const processName = String(record.processName || '').trim();
    const currentType = String(processType || nodeType || '').trim();
    if (currentType === 'procurement' || currentType === '采购' || processCode.startsWith('procurement') || processName.includes('采购')) return '采购';
    if (currentType === 'cutting' || currentType === '裁剪' || processCode.startsWith('cutting') || processName === '裁剪') return '裁剪';
    if (currentType === 'secondaryProcess' || currentType === '二次工艺' || processCode.startsWith('secondary')) return '二次工艺';
    if (currentType === 'carSewing' || currentType === 'sewing' || currentType === '车缝' || currentType === '整件' || currentType === '缝制' || processCode.startsWith('sewing')) return '车缝';
    if (
      currentType === 'tailProcess' ||
      currentType === '尾部' ||
      currentType === 'ironing' ||
      currentType === 'quality' ||
      currentType === 'packaging' ||
      currentType === '整烫' ||
      currentType === '剪线' ||
      currentType === '包装' ||
      currentType === '质检' ||
      processCode.startsWith('ironing') ||
      processCode.startsWith('pressing') ||
      processCode.startsWith('quality') ||
      processCode.startsWith('packaging') ||
      processName === '剪线'
    ) {
      return '尾部';
    }
    if (currentType === 'warehousing' || currentType === '入库' || processCode.startsWith('warehousing') || ['入库', '质检入库', '次品入库'].includes(processName)) {
      return '入库';
    }
    if (record.progressStage) {
      const ps = String(record.progressStage).trim();
      if (ps) return ps;
    }
    return String(processName || '').trim();
  }, [nodeType, processType]);

  const handleUndo = useCallback(async (record: ProcessTrackingRecord) => {
    modal.confirm({
      width: '30vw',
      title: '确认撤回',
      content: `确定撤回此扫码记录？\n菲号: ${record.bundleNo}\n工序: ${formatProcessDisplayName(record.processCode, record.processName)}\n数量: ${record.quantity || 0}件`,
      okText: '确认撤回',
      cancelText: '取消',
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        try {
          await productionScanApi.undo({ recordId: record.scanRecordId! });
          message.success('撤回成功');
          onUndoSuccess?.();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '撤回失败');
        }
      },
    });
  }, [message, modal, onUndoSuccess]);

  const handleManualComplete = useCallback((record: ProcessTrackingRecord, actioningSetter: (id: string) => void) => {
    const bundleNo = Number(record.bundleNo || 0);
    const operatorLabel = String(user?.username || user?.name || '').trim() || '当前账号';
    modal.confirm({
      width: '30vw',
      title: '确认手动完成',
      content: `确定将此节点标记为完成？\n菲号: ${record.bundleNo}\n工序: ${formatProcessDisplayName(record.processCode, record.processName)}\n数量: ${record.quantity || 0}件\n操作账号: ${operatorLabel}`,
      okText: '确认完成',
      cancelText: '取消',
      onOk: async () => {
        actioningSetter(record.id);
        try {
          const payload = {
            requestId: generateRequestId(),
            orderId: String(orderId || '').trim() || undefined,
            orderNo: String(orderNo || '').trim() || undefined,
            bundleNo: Number.isFinite(bundleNo) && bundleNo > 0 ? bundleNo : undefined,
            quantity: Number(record.quantity || 0) || 0,
            scanType: resolveScanType(record),
            progressStage: resolveProgressStage(record),
            processName: String(record.processName || '').trim() || undefined,
            processCode: String(record.processCode || '').trim() || undefined,
            // 必传：避免后端 fallback 到 order 级聚合标签（如"多码"）触发 SKU 校验失败
            color: String(record.color || '').trim() || undefined,
            size: String(record.size || '').trim() || undefined,
            unitPrice: Number.isFinite(Number(record.unitPrice)) ? Number(record.unitPrice) : undefined,
            scanTime: new Date().toISOString(),
            operatorId: String(user?.id || '').trim() || undefined,
            operatorName: String(user?.username || user?.name || '').trim() || undefined,
            remark: 'PC手动完成',
            manual: true,
          };
          await productionScanApi.execute(payload);
          message.success('已手动完成，数据已按扫码链路同步');
          onUndoSuccess?.();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '手动完成失败');
        } finally {
          actioningSetter('');
        }
      },
    });
  }, [message, modal, onUndoSuccess, orderId, orderNo, resolveProgressStage, resolveScanType, user]);

  const handleBatchComplete = useCallback(async (
    selectedRecords: ProcessTrackingRecord[],
    batchCompletingSetter: (v: boolean) => void,
    selectedKeysSetter: (keys: React.Key[]) => void,
    orderStatus?: string,
  ) => {
    const completableRecords = selectedRecords.filter(r =>
      r.scanStatus !== 'scanned' && !(
        orderStatus && ['completed', 'cancelled', 'closed'].includes(orderStatus.toLowerCase())
      ) && String(r.processName || '').trim() && String(r.bundleNo || '').trim()
    );
    if (completableRecords.length === 0) return;

    const totalQty = completableRecords.reduce((s, r) => s + (r.quantity || 0), 0);
    const operatorLabel = String(user?.username || user?.name || '').trim() || '当前账号';
    modal.confirm({
      width: '30vw',
      title: '确认批量完成',
      content: `确定将选中的 ${completableRecords.length} 条记录标记为完成？\n总数量: ${totalQty} 件\n操作账号: ${operatorLabel}`,
      okText: '确认完成',
      cancelText: '取消',
      onOk: async () => {
        batchCompletingSetter(true);
        let successCount = 0;
        let failCount = 0;
        for (const record of completableRecords) {
          try {
            const bundleNo = Number(record.bundleNo || 0);
            const payload = {
              requestId: generateRequestId(),
              orderId: String(orderId || '').trim() || undefined,
              orderNo: String(orderNo || '').trim() || undefined,
              bundleNo: Number.isFinite(bundleNo) && bundleNo > 0 ? bundleNo : undefined,
              quantity: Number(record.quantity || 0) || 0,
              scanType: resolveScanType(record),
              progressStage: resolveProgressStage(record),
              processName: String(record.processName || '').trim() || undefined,
              processCode: String(record.processCode || '').trim() || undefined,
              // 必传：避免后端 fallback 到 order 级聚合标签（如"多码"）触发 SKU 校验失败
              color: String(record.color || '').trim() || undefined,
              size: String(record.size || '').trim() || undefined,
              unitPrice: Number.isFinite(Number(record.unitPrice)) ? Number(record.unitPrice) : undefined,
              scanTime: new Date().toISOString(),
              operatorId: String(user?.id || '').trim() || undefined,
              operatorName: String(user?.username || user?.name || '').trim() || undefined,
              remark: 'PC批量完成',
              manual: true,
            };
            await productionScanApi.execute(payload);
            successCount++;
          } catch {
            failCount++;
          }
        }
        batchCompletingSetter(false);
        selectedKeysSetter([]);
        if (failCount === 0) {
          message.success(`批量完成成功，共 ${successCount} 条记录`);
        } else {
          message.warning(`完成 ${successCount} 条，失败 ${failCount} 条`);
        }
        onUndoSuccess?.();
      },
    });
  }, [message, modal, onUndoSuccess, orderId, orderNo, resolveScanType, resolveProgressStage, user]);

  return {
    _isAdmin,
    resolveScanType,
    resolveProgressStage,
    handleUndo,
    handleManualComplete,
    handleBatchComplete,
  };
}
