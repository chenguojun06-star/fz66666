import { useCallback, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { OPERATION_TYPE_MAP, type SubProcessRow } from './SampleProcessList.helpers';
import type { ProcessStageProgress } from './useSampleProcessProgress';
import type { PatternProductionSnapshot } from './styleTableViewUtils.types';
import type { BatchCompleteTarget } from './components/BatchCompleteModal';

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
  /**
   * D-382：该款式下的全部色码任务（每个 颜色×码数 一条 PatternProduction）。
   * 用于「批量完成」——一次勾选多个色码完成同一道工序，替代原来逐个切换色码任务再点完成。
   */
  sampleSnapshots?: PatternProductionSnapshot[];
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
  // 整体有工序配置，但当前切换到的阶段未配置子工序（subProcesses 为空）
  // 此时不应显示冷冰冰的"暂无数据"，而是给出阶段级友好提示
  currentStageEmpty: boolean;
  handleUndo: (row: SubProcessRow) => Promise<void>;
  /** D-382：该款式有多个色码任务时，提供「批量完成」入口 */
  batchCompletable: boolean;
  batchCompleteOpen: boolean;
  setBatchCompleteOpen: (open: boolean) => void;
  batchCompleteRow: SubProcessRow | null;
  batchCompleteSubmitting: boolean;
  handleBatchComplete: (row: SubProcessRow) => void;
  handleBatchCompleteSubmit: (targets: BatchCompleteTarget[]) => Promise<void>;
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
    sampleSnapshots,
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
  // D-382：批量完成（多色多码一次勾选完成，替代逐个切换色码任务）
  const [batchCompleteOpen, setBatchCompleteOpen] = useState(false);
  const [batchCompleteRow, setBatchCompleteRow] = useState<SubProcessRow | null>(null);
  const [batchCompleteSubmitting, setBatchCompleteSubmitting] = useState(false);

  const hasScanRecords = useMemo(() => {
    return stages.some(s => s.percent > 0 || s.subProcesses.some(sp => sp.completed));
  }, [stages]);

  // D-382：多色多码（该款式有 >1 个色码任务）时启用「批量完成」
  const batchCompletable = (sampleSnapshots?.length || 0) > 1;

  const currentStage = useMemo(() => stages.find(s => s.key === activeTab) || stages[0], [stages, activeTab]);

  // 整体有工序配置（!needsConfig）但当前阶段没有子工序：
  // 例如款号配置了裁剪/车缝等子工序，但"采购"阶段未配置任何子工序，
  // 切换到该阶段时表格会显示"暂无数据"，这里给出阶段级友好提示
  const currentStageEmpty = !needsConfig && !!currentStage && currentStage.subProcesses.length === 0;

  const subTableData = useMemo<SubProcessRow[]>(() => {
    if (!currentStage) return [];
    if (needsConfig) return [];
    // 该阶段未配置子工序时返回空数组，不生成占位假工序（历史bug：切换tab会出现一行假工序，刷新消失）
    if (currentStage.subProcesses.length === 0) return [];
    return currentStage.subProcesses.map((sub) => {
      // D-115：行状态取自身完成标记（原取阶段总进度——阶段未到100%时，已完成的行仍显示
      // "待领取/手动完成"，正是"操作了但状态不变、按钮还能点"的根因）。
      // percent>=100 作为兜底（trackingStats 口径完成的行 completed 标记可能缺）
      const subStatus = String(sub.status || '').trim().toUpperCase();
      // D-208：三态——COMPLETED=已完成；CLAIMED=已领取生产中；否则待领取（行级权威状态优先）
      const subDone = subStatus === 'COMPLETED' || (subStatus !== 'CLAIMED' && sub.completed === true);
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
        receiver: sub.claimedBy || (subDone ? receiver : '-'),
        time: sub.claimedTime || (subDone ? (receiveTime || '-') : '-'),
        status: subDone ? 'completed' as const : (subStatus === 'CLAIMED' ? 'claimed' as const : 'pending' as const),
        percent: subDone ? 100 : 0,
        unitPrice: sub.unitPrice,
        // D-382：透传该工序的按颜色明细（多色多码展示与批量完成用）
        colorItems: sub.colorItems,
        // D-384：透传该工序的指派安排（张三 2 件 / 李四 1 件）
        assignments: sub.assignments,
      };
    });
  }, [currentStage, needsConfig, styleNo, color, size, quantity, receiver, receiveTime]);

  const handleUndo = useCallback(async (row: SubProcessRow) => {
    if (!patternProductionId) {
      message.error('样衣生产ID不存在');
      return;
    }
    modal.confirm({
      title: '确认撤回',
      content: `确定撤回「${row.name}」？将抹掉该工序名下的全部领取与完成记录，状态回到待领取。`,
      okText: '确认撤回',
      cancelText: '取消',
      onOk: async () => {
        setActioningKey(row.key);
        try {
          const { default: api } = await import('@/utils/api');
          // D-363：行级撤回下沉后端——按工序行抹掉全部实际记录（完成报工+领取CLAIM+阶段级历史），
          // 匹配口径与状态推导完全一致。原前端全等匹配比后端窄，匹配不到就"未找到对应的扫码记录"，
          // 行状态（领取人/已完成）卡死。
          const res: any = await api.post(`/production/pattern/${patternProductionId}/undo-process`, {
            processName: row.name,
            // D-382：带上当前色码，只撤回该颜色的记录——原来不带颜色会把该工序下
            // 其他颜色的报工记录一起抹掉（多色多码时属于误删）
            color: color || undefined,
          });
          const count = Number(res?.data?.count ?? res?.count ?? 0);
          if (count > 0) {
            message.success(`撤回成功，共抹掉 ${count} 条记录`);
          } else {
            message.warning(res?.data?.message || res?.message || '该工序名下没有可撤回的扫码记录');
          }
          if (onCompleteProcess) await onCompleteProcess(currentStage?.key || '');
          if (onRefresh) await onRefresh();
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '撤回失败');
        } finally {
          setActioningKey('');
        }
      },
    });
  }, [patternProductionId, currentStage, color, modal, message, onCompleteProcess, onRefresh]);

  /** D-382：打开「批量完成」弹窗（多色多码时替代单个「手动完成」） */
  const handleBatchComplete = useCallback((row: SubProcessRow) => {
    setBatchCompleteRow(row);
    setBatchCompleteOpen(true);
  }, []);

  /**
   * D-382：批量完成——对勾选的每个色码任务各提交一次该工序的完成。
   * 与「手动完成」走同一接口（/production/pattern/scan），只是把"逐个切换色码 + 逐个点完成"
   * 收敛成"一次勾选 + 一次确认"。并发提交（PC 端无小程序那样的并发上限）。
   */
  const handleBatchCompleteSubmit = useCallback(async (targets: BatchCompleteTarget[]) => {
    if (!targets.length) return;
    const opType = OPERATION_TYPE_MAP[currentStage?.key || ''] || 'PLATE';
    const rowName = batchCompleteRow?.name || '';
    setBatchCompleteSubmitting(true);
    try {
      const { default: api } = await import('@/utils/api');
      const results = await Promise.allSettled(targets.map((t) => api.post('/production/pattern/scan', {
        patternId: String(t.snapshot.id),
        operationType: opType,
        processName: rowName,
        color: String(t.snapshot.color || t.snapshot.colors?.[0] || '').trim() || undefined,
        // D-382：数量由操作人手填（一个版多人生产，各人实际件数不同，不预设默认值）
        quantity: t.quantity,
        operatorRole: 'PLATE_WORKER',
        remark: 'PC完成工序',
      })));
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - okCount;
      if (okCount > 0) {
        message.success(`已完成 ${okCount} 个色码${failCount > 0 ? `，${failCount} 个失败` : ''}`);
      } else {
        message.error('批量完成失败');
      }
      setBatchCompleteOpen(false);
      if (onCompleteProcess) await onCompleteProcess(currentStage?.key || '');
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '批量完成失败');
    } finally {
      setBatchCompleteSubmitting(false);
    }
  }, [batchCompleteRow, currentStage, message, onCompleteProcess, onRefresh]);

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
      // D-P2-7：把 quantity 一起提交，让后端更新 PatternProduction.quantity
      // 工人在弹窗里明确"我负责多少件"，避免多色多码时不知数量
      await api.put(`/production/pattern/${patternProductionId}/assignee`, {
        assignee: values.assignee,
        quantity: values.quantity,
        processName: assigningRow.name,
        processCode: assigningRow.processCode,
      });
      message.success(`已将「${assigningRow.name}」指派给 ${values.assignee}（${values.quantity}件）`);
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
    currentStageEmpty,
    handleUndo,
    batchCompletable,
    batchCompleteOpen,
    setBatchCompleteOpen,
    batchCompleteRow,
    batchCompleteSubmitting,
    handleBatchComplete,
    handleBatchCompleteSubmit,
    handleAssign,
    handleAssignSubmit,
    handlePurchaseClick,
    handleFieldSave,
    handleStartEdit,
  };
}
