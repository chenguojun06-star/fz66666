import { useState, useMemo, useEffect, useRef } from 'react';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { factoryApi, type Factory } from '@/services/system/factoryApi';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit } from '@/types/system';
import { CUTTING_STAGE_ORDER } from '@/utils/productionStage';
import { productionOrderApi, type FactoryCapacityItem } from '@/services/production/productionApi';

export type CuttingFactoryMode = 'INTERNAL' | 'EXTERNAL';

const INTERNAL_UNIT_KEYWORDS = ['组', '车间', '班组', '产线', '裁剪', '车缝', '缝制', '尾部', '后整', '整烫', '包装', '质检', '工艺', '部', '生产'];

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

// 已移除 defaultCuttingProcessNodes（2026-04-28）：不再使用自动模板加载
// 用户现在必须手动从零开始配置工序

const FIXED_PARENT_NODES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

const SYNONYM_TO_PARENT: Record<string, string> = {
  '采购': '采购', '物料采购': '采购', '面辅料采购': '采购', '备料': '采购', '到料': '采购', '进料': '采购', '物料': '采购',
  '裁剪': '裁剪', '裁床': '裁剪', '剪裁': '裁剪', '开裁': '裁剪', '裁片': '裁剪', '裁切': '裁剪',
  '二次工艺': '二次工艺', '二次': '二次工艺',
  '车缝': '车缝', '缝制': '车缝', '缝纫': '车缝', '车工': '车缝', '生产': '车缝', '制作': '车缝',
  '车位': '车缝', '车间生产': '车缝', '整件': '车缝',
  '尾部': '尾部', '后整理': '尾部', '后道': '尾部',
  '入库': '入库', '仓储': '入库', '上架': '入库', '进仓': '入库', '入仓': '入库', '验收': '入库', '成品入库': '入库',
};

function resolveProgressStage(processName: string, dynamicMapping?: Record<string, string>): string {
  if (!processName?.trim()) return '';
  const name = processName.trim();
  if (FIXED_PARENT_NODES.includes(name)) return name;
  if (dynamicMapping && dynamicMapping[name]) return dynamicMapping[name];
  if (SYNONYM_TO_PARENT[name]) return SYNONYM_TO_PARENT[name];
  for (const [keyword, parent] of Object.entries(SYNONYM_TO_PARENT)) {
    if (name.includes(keyword)) return parent;
  }
  if (dynamicMapping) {
    for (const [keyword, parent] of Object.entries(dynamicMapping)) {
      if (name.includes(keyword)) return parent;
    }
  }
  return '';
}

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
  const [createProcessNodes, setCreateProcessNodes] = useState<CuttingProcessNode[]>([]);
  const [createStyleImageUrl, setCreateStyleImageUrl] = useState<string | null>(null);
  const [factoryCapacities, setFactoryCapacities] = useState<FactoryCapacityItem[]>([]);
  const [dynamicProcessMapping, setDynamicProcessMapping] = useState<Record<string, string>>({});
  const mappingLoadedRef = useRef(false);

  useEffect(() => {
    if (mappingLoadedRef.current) return;
    mappingLoadedRef.current = true;
    api.get<{ code: number; data: Record<string, string> }>('/production/process-mapping/list')
      .then((res) => {
        if (res.code === 200 && res.data) {
          setDynamicProcessMapping(res.data);
        }
      })
      .catch(() => {});
  }, []);

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
      setCreateProcessNodes([]);
    }
  };

  // onSelect：仅更新款号和名称，不自动加载模板工序（由用户手动配置）
  const handleStyleNoSelect = (value: string) => {
    const sn = String(value || '').trim();
    setCreateStyleNo(sn);
    const hit = createStyleOptions.find((x) => x.styleNo === sn);
    setCreateStyleName(String(hit?.styleName || '').trim());
    if (!sn) {
      setCreateProcessNodes([]);
    }
  };

  const handleStyleNoBlur = () => {
    // 不做任何操作 - 禁用自动模板加载功能
  };

  const addProcessNodeToStage = (stage: string) => {
    const targetStage = CUTTING_STAGE_ORDER.includes(stage) ? stage : '裁剪';
    const maxSort = createProcessNodes.length;
    const nextId = String(maxSort + 1).padStart(2, '0');
    setCreateProcessNodes((prev) => [...prev, { id: nextId, name: '', progressStage: targetStage, unitPrice: 0 }]);
  };

  const addProcessNode = () => {
    addProcessNodeToStage('裁剪');
  };

  const removeProcessNode = (index: number) => {
    setCreateProcessNodes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateProcessNode = (index: number, field: keyof CuttingProcessNode, value: string | number) => {
    setCreateProcessNodes((prev) => prev.map((node, idx) => {
      if (idx !== index) return node;
      const updated = { ...node, [field]: value };
      if (field === 'name' && typeof value === 'string') {
        const resolved = resolveProgressStage(value, dynamicProcessMapping);
        if (resolved && CUTTING_STAGE_ORDER.includes(resolved)) {
          updated.progressStage = resolved;
        }
      }
      return updated;
    }));
  };

  const buildCuttingWorkflowJson = (): string | undefined => {
    const sorted = [...createProcessNodes].sort((a, b) => {
      const stageA = a.progressStage || resolveProgressStage(a.name, dynamicProcessMapping) || '裁剪';
      const stageB = b.progressStage || resolveProgressStage(b.name, dynamicProcessMapping) || '裁剪';
      const sa = CUTTING_STAGE_ORDER.indexOf(stageA);
      const sb = CUTTING_STAGE_ORDER.indexOf(stageB);
      if (sa !== sb) return sa - sb;
      return 0;
    });
    const nodes = sorted
      .filter((n) => String(n.name || '').trim())
      .map((n, idx) => ({
        id: String(idx + 1).padStart(2, '0'),
        name: n.name,
        processCode: String(idx + 1).padStart(2, '0'),
        progressStage: n.progressStage || resolveProgressStage(n.name, dynamicProcessMapping) || '',
        unitPrice: n.unitPrice,
      }));
    if (nodes.length === 0) return undefined;
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
    setCreateProcessNodes([]);
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
    handleStyleNoBlur,
    handleSubmitCreateTask,
  };
}

export type { StyleOption };
export type CuttingCreateTaskState = ReturnType<typeof useCuttingCreateTask>;
