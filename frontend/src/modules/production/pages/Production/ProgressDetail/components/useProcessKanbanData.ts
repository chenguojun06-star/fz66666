// useProcessKanbanData — ProcessKanbanDrawer 业务逻辑 Hook
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变
// 包含所有 useState/useEffect/useCallback + 业务处理函数 + 派生数据

import { useState, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';
import {
  getNodeStats, getProductionProcessTracking,
  qualityInspect, lockBundle, unlockBundle, repairComplete, batchQualityPass,
} from '@/utils/api/production';
import { remarkApi } from '@/services/system/remarkApi';
import type {
  NodeStatsItem, TrackingRecord, QcFilter, QcResult, BatchQcMode,
} from './ProcessKanbanDrawer.types';

interface UseProcessKanbanDataArgs {
  visible: boolean;
  orderId?: string;
  orderNo?: string;
}

export function useProcessKanbanData({ visible, orderId, orderNo }: UseProcessKanbanDataArgs) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('qc');
  const [nodeStats, setNodeStats] = useState<NodeStatsItem[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TrackingRecord[]>([]);
  const [qcFilter, setQcFilter] = useState<QcFilter>('pending');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const [qcRecord, setQcRecord] = useState<TrackingRecord | null>(null);
  const [qcResult, setQcResult] = useState<QcResult>('qualified');
  const [qcForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [remarkPanelOpen, setRemarkPanelOpen] = useState(false);
  const [batchQcMode, setBatchQcMode] = useState<BatchQcMode>(false);
  const [batchQcForm] = Form.useForm();

  const loadData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [statsRes, trackingRes] = await Promise.all([
        getNodeStats({ orderNo }),
        getProductionProcessTracking(orderId),
      ]);

      setNodeStats(((statsRes as any)?.data || []).map((item: any) => ({
        ...item,
        totalRecords: Number(item.totalRecords),
        scannedRecords: Number(item.scannedRecords),
        pendingRecords: Number(item.pendingRecords),
        completionRate: Number(item.completionRate),
      })));
      setTrackingRecords(((trackingRes as any)?.data || []).map((item: any) => {
        let defectProblems: string[] | undefined;
        if (item.defectProblems) {
          try {
            const parsed = typeof item.defectProblems === 'string' ? JSON.parse(item.defectProblems) : item.defectProblems;
            defectProblems = Array.isArray(parsed) ? parsed : undefined;
          } catch { defectProblems = undefined; }
        }
        return { ...item, defectProblems };
      }));
      setSelectedIds(new Set());
    } catch (e) {
      console.error('工序看板数据加载失败', e);
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNo]);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  const handleQualityInspect = (record: TrackingRecord) => {
    setQcRecord(record);
    setQcResult('qualified');
    qcForm.setFieldsValue({
      defectQuantity: 0,
      defectCategory: undefined,
      defectProblems: undefined,
      qualityRemark: undefined,
      lockBundle: false,
    });
  };

  const handleSubmitQuality = async () => {
    if (!qcRecord) return;
    try {
      const values = await qcForm.validateFields();
      const isUnqualified = qcResult === 'unqualified';
      const defectQty = isUnqualified ? (values.defectQuantity || 0) : 0;
      if (isUnqualified && defectQty <= 0) {
        message.error('不合格时次品数量必须大于0');
        return;
      }
      if (defectQty > qcRecord.quantity) {
        message.error('次品数量不能超过菲号总数量');
        return;
      }
      setSubmitting(true);
      await qualityInspect({
        trackingId: qcRecord.id,
        defectQuantity: defectQty,
        defectCategory: values.defectCategory,
        defectProblems: values.defectProblems,
        qualityRemark: values.qualityRemark,
        lockBundle: isUnqualified && values.lockBundle,
      });
      if (isUnqualified && values.qualityRemark) {
        try {
          await remarkApi.add({
            targetType: 'order',
            targetNo: qcRecord.processName ? `${orderNo}` : orderNo || '',
            authorRole: '工序质检',
            content: `[质检不合格] 菲号#${qcRecord.bundleNo} ${qcRecord.processName}: 次品${defectQty}件${values.defectProblems?.length ? '(' + values.defectProblems.join('、') + ')' : ''}${values.qualityRemark ? ' — ' + values.qualityRemark : ''}`,
          });
        } catch { /* ignore */ }
      } else if (!isUnqualified && values.qualityRemark) {
        try {
          await remarkApi.add({
            targetType: 'order',
            targetNo: orderNo || '',
            authorRole: '工序质检',
            content: `[质检合格] 菲号#${qcRecord.bundleNo} ${qcRecord.processName}: ${values.qualityRemark}`,
          });
        } catch { /* ignore */ }
      }
      message.success(isUnqualified
        ? (values.lockBundle ? '质检不合格，已录入次品并锁定菲号' : '质检不合格，已录入次品')
        : '质检合格');
      setQcRecord(null);
      loadData();
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = async (record: TrackingRecord) => {
    try {
      await lockBundle(record.id);
      message.success('已锁定菲号，下游扫码将被阻止');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '锁定失败');
    }
  };

  const handleUnlock = async (record: TrackingRecord) => {
    try {
      await unlockBundle(record.id);
      message.success('已解锁菲号，可继续扫码验收');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '解锁失败');
    }
  };

  const handleRepairComplete = async (record: TrackingRecord) => {
    try {
      await repairComplete(record.id);
      message.success('返修完成，菲号进入待复检状态');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const handleBatchQualityPass = async () => {
    if (selectedIds.size === 0) {
      message.warning('请先勾选要质检的菲号');
      return;
    }
    setBatchLoading(true);
    try {
      const res = await batchQualityPass(Array.from(selectedIds));
      const data = (res as any)?.data;
      message.success(data?.message || '批量质检完成');
      setSelectedIds(new Set());
      setBatchQcMode(false);
      loadData();
    } catch (e: any) {
      message.error(e?.message || '批量质检失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchQualityUnqualified = async () => {
    if (selectedIds.size === 0) {
      message.warning('请先勾选要质检的菲号');
      return;
    }
    try {
      const values = await batchQcForm.validateFields();
      const defectQty = values.defectQuantity || 0;
      if (defectQty <= 0) {
        message.error('次品数量必须大于0');
        return;
      }
      setBatchLoading(true);
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map(id => qualityInspect({
          trackingId: id,
          defectQuantity: defectQty,
          defectCategory: values.defectCategory,
          defectProblems: values.defectProblems,
          qualityRemark: values.qualityRemark,
          lockBundle: values.lockBundle,
        }))
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed === 0) {
        message.success(`${succeeded} 条菲号全部标记为不合格`);
      } else {
        message.warning(`${succeeded} 条成功，${failed} 条失败`);
      }
      if (values.qualityRemark) {
        try {
          await remarkApi.add({
            targetType: 'order',
            targetNo: orderNo || '',
            authorRole: '工序质检',
            content: `[批量质检不合格] ${ids.length}条菲号: 次品${defectQty}件/条${values.defectProblems?.length ? '(' + values.defectProblems.join('、') + ')' : ''}${values.qualityRemark ? ' — ' + values.qualityRemark : ''}`,
          });
        } catch { /* ignore */ }
      }
      setSelectedIds(new Set());
      setBatchQcMode(false);
      batchQcForm.resetFields();
      loadData();
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // —— 派生数据 ——
  const scannedRecords = trackingRecords.filter(r => r.scanStatus === 'scanned');
  const pendingQc = scannedRecords.filter(r => !r.qualityStatus);
  const unqualified = scannedRecords.filter(r => r.qualityStatus === 'unqualified');
  const repairDone = scannedRecords.filter(r => r.repairStatus === 'repair_done');

  const filteredRecords = (() => {
    let list: TrackingRecord[];
    switch (qcFilter) {
      case 'pending': list = pendingQc; break;
      case 'unqualified': list = unqualified; break;
      case 'repair_done': list = repairDone; break;
      default: list = scannedRecords;
    }
    if (!searchText) return list;
    const kw = searchText.toLowerCase();
    return list.filter(r =>
      String(r.bundleNo).includes(kw) ||
      (r.processName || '').toLowerCase().includes(kw) ||
      (r.color || '').toLowerCase().includes(kw) ||
      (r.size || '').toLowerCase().includes(kw) ||
      (r.operatorName || '').toLowerCase().includes(kw)
    );
  })();

  const selectableIds = filteredRecords
    .filter(r => !r.qualityStatus)
    .map(r => r.id);

  return {
    // state
    loading, activeTab, nodeStats, trackingRecords,
    qcFilter, searchText, selectedIds, batchLoading,
    qcRecord, qcResult, submitting, remarkPanelOpen, batchQcMode,
    // forms
    qcForm, batchQcForm,
    // state setters
    setActiveTab, setQcFilter, setSearchText, setSelectedIds,
    setQcRecord, setQcResult, setRemarkPanelOpen, setBatchQcMode,
    // actions
    loadData,
    handleQualityInspect, handleSubmitQuality,
    handleLock, handleUnlock, handleRepairComplete,
    handleBatchQualityPass, handleBatchQualityUnqualified,
    toggleSelect, toggleSelectAll,
    // derived
    scannedRecords, pendingQc, unqualified, repairDone,
    filteredRecords, selectableIds,
  };
}
