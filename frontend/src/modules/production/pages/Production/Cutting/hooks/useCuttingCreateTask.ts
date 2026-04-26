import { useState, useRef, useMemo, useEffect } from 'react';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { factoryApi, type Factory } from '@/services/system/factoryApi';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit } from '@/types/system';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { CUTTING_STAGE_ORDER } from '@/utils/productionStage';
import { productionOrderApi, type FactoryCapacityItem } from '@/services/production/productionApi';

export type CuttingFactoryMode = 'INTERNAL' | 'EXTERNAL';

const INTERNAL_UNIT_KEYWORDS = ['组', '车间', '班组', '产线', '裁剪', '车缝', '缝制', '尾部', '后整', '整烫', '包装', '质检', '工艺'];

const isSelectableInternalUnit = (unit: OrganizationUnit) => {
  if (unit.nodeType !== 'DEPARTMENT') {
    return false;
  }
  const name = String(unit.unitName || unit.nodeName || '').trim();
  const path = String(unit.pathNames || '').trim();
  const content = `${name} ${path}`;
  return INTERNAL_UNIT_KEYWORDS.some((keyword) => content.includes(keyword));
};

interface StyleOption {
  id: number | string;
  styleNo: string;
  styleName?: string;
}

export interface CuttingCreateOrderLine {
  color: string;
  size: string;
  quantity: number | null;
}

const createEmptyOrderLine = (): CuttingCreateOrderLine => ({
  color: '',
  size: '',
  quantity: null,
});

export interface CuttingProcessNode {
  id: string;
  name: string;
  progressStage: string;
  unitPrice: number;
}

const defaultCuttingProcessNodes: CuttingProcessNode[] = [
  { id: '01', name: '裁剪', progressStage: '裁剪', unitPrice: 0 },
  { id: '02', name: '整件', progressStage: '车缝', unitPrice: 0 },
  { id: '03', name: '尾部', progressStage: '尾部', unitPrice: 0 },
];

export interface ProcessUnitPrice {
  processName: string;
  unitPrice: number | null;
  processCode?: string;
}

interface UseCuttingCreateTaskOptions {
  message: any;
  navigate: (path: string) => void;
  fetchTasks: () => Promise<void> | void;
}

export function useCuttingCreateTask({ message, navigate, fetchTasks }: UseCuttingCreateTaskOptions) {
  useAuth();

  // 用于防止 loadProcessNodesForStyle 异步竞态：记录最新发起的款号请求
  const pendingStyleNoRef = useRef<string>('');

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createOrderDate, setCreateOrderDate] = useState('');
  const [createDeliveryDate, setCreateDeliveryDate] = useState('');
  const [createOrderLines, setCreateOrderLines] = useState<CuttingCreateOrderLine[]>([createEmptyOrderLine()]);
  const [createStyleOptions, setCreateStyleOptions] = useState<StyleOption[]>([]);
  const [createStyleLoading, setCreateStyleLoading] = useState(false);
  const [createStyleNo, setCreateStyleNo] = useState<string>('');
  const [createStyleName, setCreateStyleName] = useState<string>('');
  const [createFactoryMode, setCreateFactoryMode] = useState<CuttingFactoryMode>('INTERNAL');
  const [createOrgUnitId, setCreateOrgUnitId] = useState<string>('');
  const [createInternalUnitOptions, setCreateInternalUnitOptions] = useState<OrganizationUnit[]>([]);
  const [createFactoryId, setCreateFactoryId] = useState<string>('');
  const [createFactoryOptions, setCreateFactoryOptions] = useState<Factory[]>([]);
  const [createFactoryLoading, setCreateFactoryLoading] = useState(false);
  const [createProcessNodes, setCreateProcessNodes] = useState<CuttingProcessNode[]>([...defaultCuttingProcessNodes]);
  const [createStyleImageUrl, setCreateStyleImageUrl] = useState<string | null>(null);
  const [factoryCapacities, setFactoryCapacities] = useState<FactoryCapacityItem[]>([]);

  useEffect(() => {
    productionOrderApi.getFactoryCapacity()
      .then((res) => {
        if (res?.data) setFactoryCapacities(res.data);
      })
      .catch(() => {});
  }, []);

  const selectedFactoryStat = useMemo(() => {
    if (!factoryCapacities.length) return null;
    if (createFactoryMode === 'EXTERNAL' && createFactoryId) {
      const factory = createFactoryOptions.find(f => String(f.id || '').trim() === String(createFactoryId || '').trim());
      if (!factory) return null;
      return factoryCapacities.find(c => c.factoryName === factory.factoryName) ?? null;
    }
    if (createFactoryMode === 'INTERNAL' && createOrgUnitId) {
      const dept = createInternalUnitOptions.find(d => String(d.id || '').trim() === String(createOrgUnitId || '').trim());
      if (!dept) return null;
      const deptName = dept.nodeName || dept.pathNames || '';
      if (!deptName) return null;
      return factoryCapacities.find(c => deptName.includes(c.factoryName) || c.factoryName.includes(deptName)) ?? null;
    }
    return null;
  }, [createFactoryMode, createFactoryId, createOrgUnitId, factoryCapacities, createFactoryOptions, createInternalUnitOptions]);

  const fetchStyleInfoOptions = async (keyword?: string) => {
    setCreateStyleLoading(true);
    try {
      const res = await api.get<{ code: number; data: Array<{ styleNo: string; styleName?: string }> }>('/template-library/process-price-style-options', {
        params: { keyword: String(keyword || '').trim() },
      });
      if (res.code === 200) {
        const records = Array.isArray(res.data) ? res.data : [];
        setCreateStyleOptions(
          records
            .map((r) => ({
              id: String(r?.styleNo || '').trim(),
              styleNo: String(r?.styleNo || '').trim(),
              styleName: String(r?.styleName || '').trim(),
            }))
            .filter((x) => x.styleNo)
        );
      }
    } catch {
      // Intentionally empty
    } finally {
      setCreateStyleLoading(false);
    }
  };

  const fetchFactoryOptions = async (keyword?: string, factoryType: CuttingFactoryMode = createFactoryMode) => {
    setCreateFactoryLoading(true);
    try {
      const res = await factoryApi.list({
        page: 1,
        pageSize: 200,
        status: 'active',
        factoryType,
        factoryName: String(keyword || '').trim() || undefined,
      });
      if (res.code === 200) {
        const records = Array.isArray(res.data?.records) ? res.data.records : [];
        setCreateFactoryOptions(records.filter((item) => String(item?.factoryName || '').trim()));
      }
    } catch {
      // Intentionally empty
    } finally {
      setCreateFactoryLoading(false);
    }
  };

  const fetchInternalUnitOptions = async () => {
    setCreateFactoryLoading(true);
    try {
      const records = await organizationApi.departments();
      setCreateInternalUnitOptions((Array.isArray(records) ? records : []).filter(isSelectableInternalUnit));
    } catch {
      setCreateInternalUnitOptions([]);
    } finally {
      setCreateFactoryLoading(false);
    }
  };

  // onChange：每次输入变化时仅更新款号显示值，不触发异步模板加载（防止竞态导致工序列表意外变更）
  const handleStyleNoChange = (value: string) => {
    const sn = String(value || '').trim();
    setCreateStyleNo(sn);
    const hit = createStyleOptions.find((x) => x.styleNo === sn);
    setCreateStyleName(String(hit?.styleName || '').trim());
    if (!sn) {
      // 清空时重置工序节点
      pendingStyleNoRef.current = '';
      setCreateProcessNodes([...defaultCuttingProcessNodes]);
    }
  };

  // onSelect / onBlur：用户明确确认款号后才加载模板工序（避免打字过程中异步覆盖）
  const handleStyleNoSelect = (value: string) => {
    const sn = String(value || '').trim();
    setCreateStyleNo(sn);
    const hit = createStyleOptions.find((x) => x.styleNo === sn);
    setCreateStyleName(String(hit?.styleName || '').trim());
    if (sn) {
      loadProcessNodesForStyle(sn);
    } else {
      pendingStyleNoRef.current = '';
      setCreateProcessNodes([...defaultCuttingProcessNodes]);
    }
  };

  const loadProcessNodesForStyle = async (styleNo: string) => {
    // 标记本次请求的款号；若款号在等待过程中被更新，本次结果将被丢弃
    pendingStyleNoRef.current = styleNo;
    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
      // 竞态保护：若已有更新的款号请求，丢弃本次结果
      if (pendingStyleNoRef.current !== styleNo) return;
      const result = res as Record<string, unknown>;
      if (result.code !== 200) return;
      const rows = Array.isArray(result.data) ? result.data : [];
      if (rows.length === 0) return;
      const nodes: CuttingProcessNode[] = rows
        .filter((r: any) => {
          const name = String(r?.name || r?.processName || '').trim();
          const stage = String(r?.progressStage || '').trim();
          return name && !['采购'].includes(stage) && !['采购'].includes(name);
        })
        .map((r: any, idx: number) => {
          let stage = String(r?.progressStage || '').trim();
          if (!stage || !CUTTING_STAGE_ORDER.includes(stage)) {
            stage = '车缝';
          }
          return {
            id: String(r?.id || r?.processCode || String(idx + 1).padStart(2, '0')).trim(),
            name: String(r?.name || r?.processName || '').trim(),
            progressStage: stage,
            unitPrice: Number(r?.unitPrice || r?.price || 0) || 0,
          };
        });
      if (nodes.length > 0) {
        setCreateProcessNodes(nodes);
      }
    } catch {
      if (pendingStyleNoRef.current === styleNo) {
        setCreateProcessNodes([...defaultCuttingProcessNodes]);
      }
    }
  };

  const addProcessNodeToStage = (stage: string) => {
    const targetStage = CUTTING_STAGE_ORDER.includes(stage) ? stage : '车缝';
    const maxSort = createProcessNodes.length;
    const nextId = String(maxSort + 1).padStart(2, '0');
    setCreateProcessNodes((prev) => [...prev, { id: nextId, name: '', progressStage: targetStage, unitPrice: 0 }]);
  };

  const addProcessNode = () => {
    addProcessNodeToStage('车缝');
  };

  const removeProcessNode = (index: number) => {
    setCreateProcessNodes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateProcessNode = (index: number, field: keyof CuttingProcessNode, value: string | number) => {
    setCreateProcessNodes((prev) => prev.map((node, idx) => {
      if (idx !== index) return node;
      return { ...node, [field]: value };
    }));
  };

  const buildCuttingWorkflowJson = (): string => {
    const sorted = [...createProcessNodes].sort((a, b) => {
      const sa = CUTTING_STAGE_ORDER.indexOf(a.progressStage || '车缝');
      const sb = CUTTING_STAGE_ORDER.indexOf(b.progressStage || '车缝');
      if (sa !== sb) return sa - sb;
      return 0;
    });
    const nodes = sorted
      .filter((n) => String(n.name || '').trim())
      .map((n, idx) => ({
        id: String(idx + 1).padStart(2, '0'),
        name: n.name,
        processCode: String(idx + 1).padStart(2, '0'),
        progressStage: n.progressStage,
        unitPrice: n.unitPrice,
      }));
    return JSON.stringify({ nodes });
  };

  const openCreateTask = () => {
    setCreateOrderDate('');
    setCreateDeliveryDate('');
    setCreateOrderLines([createEmptyOrderLine()]);
    setCreateStyleNo('');
    setCreateStyleName('');
    setCreateFactoryMode('INTERNAL');
    setCreateOrgUnitId('');
    setCreateFactoryId('');
    setCreateProcessNodes([...defaultCuttingProcessNodes]);
    setCreateStyleImageUrl(null);
    setCreateTaskOpen(true);
    fetchStyleInfoOptions('');
    fetchInternalUnitOptions();
  };

  const updateCreateOrderLine = (index: number, field: keyof CuttingCreateOrderLine, value: string | number | null) => {
    setCreateOrderLines((prev) => prev.map((line, idx) => {
      if (idx !== index) return line;
      return {
        ...line,
        [field]: field === 'quantity' ? (typeof value === 'number' ? value : null) : String(value || ''),
      };
    }));
  };

  const addCreateOrderLine = () => {
    setCreateOrderLines((prev) => [...prev, createEmptyOrderLine()]);
  };

  const removeCreateOrderLine = (index: number) => {
    setCreateOrderLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleSubmitCreateTask = async () => {
    const styleNo = String(createStyleNo || '').trim();
    const orderLines = createOrderLines
      .map((line) => ({
        color: String(line.color || '').trim(),
        size: String(line.size || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.color || line.size || line.quantity > 0);
    if (!styleNo) {
      message.error('请输入或选择款号');
      return;
    }
    if (orderLines.length === 0) {
      message.error('请至少填写一行颜色、尺码、数量');
      return;
    }
    if (createFactoryMode === 'INTERNAL' && !String(createOrgUnitId || '').trim()) {
      message.error('请选择内部生产组/车间');
      return;
    }
    if (createFactoryMode === 'EXTERNAL' && !String(createFactoryId || '').trim()) {
      message.error('请选择外发工厂');
      return;
    }
    const invalidLineIndex = orderLines.findIndex((line) => !line.color || !line.size || !Number.isFinite(line.quantity) || line.quantity <= 0);
    if (invalidLineIndex >= 0) {
      message.error(`第 ${invalidLineIndex + 1} 行请完整填写颜色、尺码、数量`);
      return;
    }

    setCreateTaskSubmitting(true);
    try {
      const factory = createFactoryOptions.find((item) => String(item.id || '').trim() === String(createFactoryId || '').trim());
      const orgUnit = createInternalUnitOptions.find((item) => String(item.id || '').trim() === String(createOrgUnitId || '').trim());
      const res = await api.post<{ code: number; message: string; data?: Record<string, unknown> }>('/production/cutting-task/custom/create', {
        styleNo,
        factoryType: createFactoryMode,
        factoryId: createFactoryMode === 'EXTERNAL' ? String(createFactoryId || '').trim() : undefined,
        factoryName: createFactoryMode === 'EXTERNAL'
          ? (String(factory?.factoryName || '').trim() || undefined)
          : (String(orgUnit?.unitName || orgUnit?.nodeName || '').trim() || undefined),
        orgUnitId: createFactoryMode === 'INTERNAL' ? String(createOrgUnitId || '').trim() : undefined,
        orderDate: String(createOrderDate || '').trim() || undefined,
        deliveryDate: String(createDeliveryDate || '').trim() || undefined,
        orderLines,
        progressWorkflowJson: buildCuttingWorkflowJson(),
        styleImageUrl: String(createStyleImageUrl || '').trim() || undefined,
      });
      if (res.code === 200) {
        message.success('新建裁剪任务成功');
        setCreateTaskOpen(false);
        fetchTasks();
        const on = String(res.data && (res.data as Record<string, unknown>)?.productionOrderNo || '').trim();
        if (on) {
          navigate(`/production/cutting/task/${encodeURIComponent(on)}`);
        }
      } else {
        message.error(res.message || '新建失败');
      }
    } catch {
      message.error('新建失败');
    } finally {
      setCreateTaskSubmitting(false);
    }
  };

  return {
    createTaskOpen, setCreateTaskOpen,
    createTaskSubmitting,
    createOrderDate, setCreateOrderDate,
    createDeliveryDate, setCreateDeliveryDate,
    createOrderLines, setCreateOrderLines,
    updateCreateOrderLine,
    addCreateOrderLine,
    removeCreateOrderLine,
    createStyleOptions, createStyleLoading, createStyleNo, setCreateStyleNo,
    createStyleName, setCreateStyleName,
    createFactoryMode, setCreateFactoryMode,
    createOrgUnitId, setCreateOrgUnitId,
    createInternalUnitOptions,
    createFactoryId, setCreateFactoryId,
    createFactoryOptions, createFactoryLoading,
    createProcessNodes, setCreateProcessNodes,
    createStyleImageUrl, setCreateStyleImageUrl,
    selectedFactoryStat,
    addProcessNode, addProcessNodeToStage, removeProcessNode, updateProcessNode,
    fetchStyleInfoOptions,
    fetchFactoryOptions,
    fetchInternalUnitOptions,
    handleStyleNoChange,
    handleStyleNoSelect,
    openCreateTask,
    handleSubmitCreateTask,
  };
}

export type { StyleOption };
export type CuttingCreateTaskState = ReturnType<typeof useCuttingCreateTask>;
