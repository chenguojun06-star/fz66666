import { useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import { StyleInfo, WorkbenchSection } from '@/types/style';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { SmartStage } from './styleTableViewUtils';
import useSampleStage from './useSampleStage';
import useSampleProcessProgress from './useSampleProcessProgress';
import useSampleScanRecords from './useSampleScanRecords';
import useSampleProcurementQuickActions from './useSampleProcurementQuickActions';
import useConfirmStage from './useConfirmStage';
import useStagePanel from './useStagePanel';
import { buildRowData, type StyleTableRowData, type CategoryOption } from './StyleTableView.helpers';

export interface RemarkTarget {
  open: boolean;
  styleNo: string;
  defaultRole?: string;
}

export interface PatternRemarkTarget {
  open: boolean;
  patternId: string;
}

export interface AssigningData {
  open: boolean;
  patternId: string;
  currentAssignee: string;
}

export interface SelectedStage {
  record: StyleInfo;
  stage: SmartStage;
}

export interface UseStyleTableViewDataParams {
  data: StyleInfo[];
  stockStateMap?: Record<string, boolean>;
  categoryOptions: CategoryOption[];
  customFields: FieldConfigItem[];
  dateSortAsc?: boolean;
  focusedStyleId?: string | null;
  onScrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  onRefresh: () => void;
}

/**
 * StyleTableView 的状态管理 Hook。
 * 集中管理所有 useState、子 Hook 编排、行数据派生。
 * 返回 { state, setters, hooks, actions, derived } 五大分组。
 */
export default function useStyleTableViewData(params: UseStyleTableViewDataParams) {
  const {
    data, stockStateMap = {}, categoryOptions, customFields = [],
    dateSortAsc = false, onScrap, onPrint, onMaintenance, onRefresh,
  } = params;

  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { user } = useUser();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  // ── 本组件 state ─────────────────────────────────────────
  const [selectedStage, setSelectedStage] = useState<SelectedStage | null>(null);
  const [developmentDrawerRecord, setDevelopmentDrawerRecord] = useState<StyleInfo | null>(null);
  const [developmentDrawerSection, setDevelopmentDrawerSection] = useState<WorkbenchSection>('bom');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<StyleInfo | null>(null);
  const [remarkTarget, setRemarkTarget] = useState<RemarkTarget>({ open: false, styleNo: '' });
  const [patternRemarkTarget, setPatternRemarkTarget] = useState<PatternRemarkTarget>({ open: false, patternId: '' });
  const [expandedParentStage, setExpandedParentStage] = useState<string | null>(null);
  const [assigningData, setAssigningData] = useState<AssigningData>({ open: false, patternId: '', currentAssignee: '' });
  const [assignForm] = Form.useForm();

  // ── 子 Hook 编排 ─────────────────────────────────────────
  const sample = useSampleStage({ selectedStage, message, onRefresh });
  const scanRecords = useSampleScanRecords();
  const sampleProcessProgress = useSampleProcessProgress(sample.sampleSnapshot?.productionOrderId, sample.sampleSnapshot?.id);
  const procurement = useSampleProcurementQuickActions(selectedStage?.record?.styleNo || null, user);
  const confirm = useConfirmStage({ selectedStage, setSelectedStage, message, onRefresh });
  const panel = useStagePanel({ selectedStage, setSelectedStage, navigate, message, modal, sampleHook: sample, confirmHook: confirm });

  // ── 派生行数据 ───────────────────────────────────────────
  const rows = useMemo(
    () => buildRowData(data, { stockStateMap, categoryOptions, customFields, dateSortAsc }),
    [categoryOptions, data, stockStateMap, dateSortAsc, customFields],
  );

  // ── 业务 actions ─────────────────────────────────────────
  const handleAssignPattern = async () => {
    try {
      const values = await assignForm.validateFields();
      await scanRecords.assignPattern(assigningData.patternId, values.assignee);
      message.success('指派成功');
      setAssigningData({ open: false, patternId: '', currentAssignee: '' });
      onRefresh();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(typeof err?.response?.data?.message === 'string' ? err.response.data.message : '指派失败');
    }
  };

  return {
    // ── 来自 props / 全局 ──
    navigate,
    message,
    modal,
    isSupervisorOrAbove,

    // ── state ──
    selectedStage,
    developmentDrawerRecord,
    developmentDrawerSection,
    copyModalOpen,
    copySource,
    remarkTarget,
    patternRemarkTarget,
    expandedParentStage,
    assigningData,
    assignForm,

    // ── setters ──
    setSelectedStage,
    setDevelopmentDrawerRecord,
    setDevelopmentDrawerSection,
    setCopyModalOpen,
    setCopySource,
    setRemarkTarget,
    setPatternRemarkTarget,
    setExpandedParentStage,
    setAssigningData,

    // ── 子 hook 返回值 ──
    sample,
    scanRecords,
    sampleProcessProgress,
    procurement,
    confirm,
    panel,

    // ── actions ──
    handleAssignPattern,

    // ── 派生数据 ──
    rows,

    // ── 透传外部回调 ──
    onScrap,
    onPrint,
    onMaintenance,
    onRefresh,
  };
}

export type UseStyleTableViewDataReturn = ReturnType<typeof useStyleTableViewData>;
export type { StyleTableRowData };
