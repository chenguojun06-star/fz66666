import { useCallback, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { OPERATION_TYPE_MAP, type SubProcessRow } from './SampleProcessList.helpers';
import type { ProcessStageProgress } from './useSampleProcessProgress';

// useSampleProcessListData：从 SampleProcessList.tsx 拆分而来
// 封装所有 state、派生数据与事件处理逻辑，保持原 API 路径、参数签名、字段名不变

export interface UseSampleProcessListDataParams {
  stages: ProcessStageProgress[];
  needsConfig?: boolean;
  patternProductionId?: string;
  styleNo: string;
  color: string;
  size: string;
  quantity?: number;
  receiver: string;
  receiveTime: string;
  onCompleteProcess?: (processCode: string) => Promise<void>;
  onRefresh?: () => void;
}

export interface UseSampleProcessListDataResult {
  activeTab: string;
  setActiveTab: (key: string) => void;
  actioningKey: string;
  purchaseDrawerOpen: boolean;
  setPurchaseDrawerOpen: (open: boolean) => void;
  sourceType: 'sample' | 'order';
  assignModalOpen: boolean;
  setAssignModalOpen: (open: boolean) => void;
  assigningRow: SubProcessRow | null;
  assignForm: ReturnType<typeof Form.useForm>[0];
  assignLoading: boolean;
  editing: boolean;
  setEditing: (b: boolean) => void;
  savingField: string | null;
  setSavingField: (s: string | null) => void;
  hasScanRecords: boolean;
  currentStage: ProcessStageProgress | undefined;
  subTableData: SubProcessRow[];
  handleManualComplete: (row: SubProcessRow) => Promise<void>;
  handleUndo: (row: SubProcessRow) => Promise<void>;
  handleAssign: (row: SubProcessRow) => void;
  handleAssignSubmit: () => Promise<void>;
  handlePurchaseClick: () => void;
  handleFieldSave: (value: string) => Promise<void>;
  handleStartEdit: () => void;
}

export default function useSampleProcessListData(
  params: UseSampleProcessListDataParams,
): UseSampleProcessListDataResult {
  const {
    stages,
    needsConfig,
    patternProductionId,
    styleNo,
    color,
    size,
    quantity,
    receiver,
    receiveTime,
    onCompleteProcess,
    onRefresh,
  } = params;

  const { modal, message } = App.useApp();
  const [activeTab, setActiveTab] = useState<string>(stages[0]?.key || 'procurement');
  const [actioningKey, setActioningKey] = useState('');
  const [purchaseDrawerOpen, setPurchaseDrawerOpen] = useState(false);
  const sourceType = patternProductionId ? 'sample' as const : 'order' as const;
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningRow, setAssigningRow] = useState<SubProcessRow | null>(null);
  const [assignForm] = Form.useForm();
  const [assignLoading, setAssignLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  const hasScanRecords = useMemo(() => {
    return stages.some(s => s.percent > 0 || s.subProcesses.some(sp => sp.completed));
  }, [stages]);

  const currentStage = useMemo(() => stages.find(s => s.key === activeTab) || stages[0], [stages, activeTab]);

  const subTableData = useMemo<SubProcessRow[]>(() => {
    if (!currentStage) return [];
    if (needsConfig) return [];
    // 该阶段未配置子工序时返回空数组，不生成占位假工序（历史bug：切换tab会出现一行假工序，刷新消失）
    if (currentStage.subProcesses.length === 0) return [];
    const isDone = currentStage.percent >= 100;
    const isActive = currentStage.percent > 0 && currentStage.percent < 100;
    return currentStage.subProcesses.map((sub) => {
      const subDone = isDone;
      const subActive = isActive;
      let subQty = '-';
      if (currentStage.key === 'procurement') {
        subQty = '1种面料';
      } else if (quantity != null && quantity > 0) {
        subQty = String(quantity);
      }
      return {
        key: sub.id || sub.processCode || sub.name,
        name: sub.name,
        processCode: sub.processCode || sub.id || sub.name,
        styleNo,
        color,
        size,
        quantity: subQty,
        receiver: subDone ? receiver : subActive ? receiver : '-',
        time: subDone ? (receiveTime || '-') : subActive ? (receiveTime || '-') : '-',
        status: subDone ? 'completed' as const : subActive ? 'in_progress' as const : 'pending' as const,
        percent: currentStage.percent,
        unitPrice: sub.unitPrice,
      };
    });
  }, [currentStage, needsConfig, styleNo, color, size, quantity, receiver, receiveTime]);

  const handleManualComplete = useCallback(async (row: SubProcessRow) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    const opType = OPERATION_TYPE_MAP[currentStage?.key || ''] || 'PLATE';
    modal.confirm({
      title: '确认手动完成',
      content: `确定将「${row.name}」标记为完成？`,
      okText: '确认完成',
      cancelText: '取消',
      onOk: async () => {
        setActioningKey(row.key);
        try {
          const { default: api } = await import('@/utils/api');
          await api.post('/production/pattern/scan', {
            patternId: patternProductionId,
            operationType: opType,
            operatorRole: 'PLATE_WORKER',
            remark: 'PC手动完成',
            manual: true,
          });
          message.success(`${row.name}已完成`);
          if (onCompleteProcess) await onCompleteProcess(currentStage?.key || '');
          if (onRefresh) await onRefresh();
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '操作失败');
        } finally {
          setActioningKey('');
        }
      },
    });
  }, [patternProductionId, currentStage, modal, message, onCompleteProcess, onRefresh]);

  const handleUndo = useCallback(async (row: SubProcessRow) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    modal.confirm({
      title: '确认撤回',
      content: `确定撤回「${row.name}」的完成记录？`,
      okText: '确认撤回',
      cancelText: '取消',
      onOk: async () => {
        setActioningKey(row.key);
        try {
          const { default: api } = await import('@/utils/api');
          const opType = OPERATION_TYPE_MAP[currentStage?.key || ''] || '';
          const scanRes: any = await api.get(`/production/pattern/${patternProductionId}/scan-records`);
          const records = Array.isArray(scanRes?.data) ? scanRes.data : Array.isArray(scanRes) ? scanRes : [];
          const matched = records.find((r: any) =>
            r.operationType === opType || r.processName === row.name
          );
          if (matched?.id) {
            await api.delete(`/production/pattern/${patternProductionId}/scan-records/${matched.id}`);
            message.success('撤回成功');
            if (onCompleteProcess) await onCompleteProcess(currentStage?.key || '');
            if (onRefresh) await onRefresh();
          } else {
            message.warning('未找到对应的扫码记录');
          }
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '撤回失败');
        } finally {
          setActioningKey('');
        }
      },
    });
  }, [patternProductionId, currentStage, modal, message, onCompleteProcess, onRefresh]);

  const handleAssign = useCallback((row: SubProcessRow) => {
    setAssigningRow(row);
    assignForm.resetFields();
    setAssignModalOpen(true);
  }, [assignForm]);

  const handleAssignSubmit = useCallback(async () => {
    if (!patternProductionId || !assigningRow) return;
    try {
      const values = await assignForm.validateFields();
      setAssignLoading(true);
      const { default: api } = await import('@/utils/api');
      await api.put(`/production/pattern/${patternProductionId}/assignee`, {
        assignee: values.assignee,
        processName: assigningRow.name,
        processCode: assigningRow.processCode,
      });
      message.success(`已将「${assigningRow.name}」指派给 ${values.assignee}`);
      setAssignModalOpen(false);
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || e?.message || '指派失败');
    } finally {
      setAssignLoading(false);
    }
  }, [patternProductionId, assigningRow, assignForm, message, onRefresh]);

  const handlePurchaseClick = useCallback(() => {
    setPurchaseDrawerOpen(true);
  }, []);

  const handleFieldSave = useCallback(async (value: string) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    const field = savingField;
    if (!field) return;
    try {
      const { default: api } = await import('@/utils/api');
      await api.put(`/production/pattern/${patternProductionId}/basic-info`, { field, value });
      message.success(`${field === 'styleNo' ? '款号' : field === 'color' ? '颜色' : '尺码'}已更新`);
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '更新失败');
    } finally {
      setSavingField(null);
    }
  }, [patternProductionId, savingField, message, onRefresh]);

  const handleStartEdit = useCallback(() => {
    if (hasScanRecords) {
      message.warning('已有扫码记录，不可编辑基本字段');
      return;
    }
    setEditing(true);
  }, [hasScanRecords, message]);

  return {
    activeTab,
    setActiveTab,
    actioningKey,
    purchaseDrawerOpen,
    setPurchaseDrawerOpen,
    sourceType,
    assignModalOpen,
    setAssignModalOpen,
    assigningRow,
    assignForm,
    assignLoading,
    editing,
    setEditing,
    savingField,
    setSavingField,
    hasScanRecords,
    currentStage,
    subTableData,
    handleManualComplete,
    handleUndo,
    handleAssign,
    handleAssignSubmit,
    handlePurchaseClick,
    handleFieldSave,
    handleStartEdit,
  };
}
