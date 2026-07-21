import { useState, useMemo, useEffect, useRef } from 'react';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { factoryApi } from '@/services/system/factoryApi';
import { organizationApi } from '@/services/system/organizationApi';
import type { Factory, OrganizationUnit } from '@/types/system';
import { CATEGORY_CODE_OPTIONS, normalizeCategoryQuery } from '@/utils/styleCategory';
import { productionOrderApi, type FactoryCapacityItem } from '@/services/production/productionApi';
import {
  type CuttingFactoryMode,
  type StyleOption,
  type CuttingCreateOrderLine,
  type CuttingProcessNode,
  type ProcessUnitPrice,
  isSelectableInternalUnit,
  createEmptyOrderLine,
} from './cuttingCreateTaskHelpers';
import { useCuttingProcessNodes } from './useCuttingProcessNodes';

export type { CuttingFactoryMode, CuttingCreateOrderLine, CuttingProcessNode, ProcessUnitPrice };

interface UseCuttingCreateTaskOptions {
  message: any;
  navigate: (path: string) => void;
  fetchTasks: () => Promise<void> | void;
}

export function useCuttingCreateTask({ message, navigate, fetchTasks }: UseCuttingCreateTaskOptions) {
  const { user } = useUser();

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
  const [createStyleImageUrl, setCreateStyleImageUrl] = useState<string | null>(null);
  const [createCustomerName, setCreateCustomerName] = useState<string>('');
  const [createRemarks, setCreateRemarks] = useState<string>('');
  const [createUrgencyLevel, setCreateUrgencyLevel] = useState<'urgent' | 'normal'>('normal');
  const [createCategory, setCreateCategory] = useState<string>('');
  const [factoryCapacities, setFactoryCapacities] = useState<FactoryCapacityItem[]>([]);
  const [dynamicProcessMapping, setDynamicProcessMapping] = useState<Record<string, string>>({});
  const mappingLoadedRef = useRef(false);

  // 跟单员/下单员
  const [tenantUsers, setTenantUsers] = useState<Array<{ id: number; name: string; username: string }>>([]);
  const [createMerchandiser, setCreateMerchandiser] = useState<string>('');
  const [createOrderPlacer, setCreateOrderPlacer] = useState<string>('');

  const {
    createProcessNodes,
    setCreateProcessNodes,
    addProcessNode,
    addProcessNodeToStage,
    removeProcessNode,
    updateProcessNode,
    importFromTemplate,
    buildCuttingWorkflowJson,
  } = useCuttingProcessNodes({ message, dynamicProcessMapping });

  useEffect(() => {
    if (mappingLoadedRef.current) return;
    mappingLoadedRef.current = true;
    api.get<{ code: number; data: Record<string, string> }>('/production/process-mapping/list')
      .then((res) => {
        if (res.code === 200 && res.data) {
          setDynamicProcessMapping(res.data);
        }
      })
      .catch((err) => console.error('加载工序映射失败:', err));
  }, []);

  useEffect(() => {
    productionOrderApi.getFactoryCapacity()
      .then((res) => {
        if (res?.data) setFactoryCapacities(res.data);
      })
      .catch((err) => console.error('加载工厂产能数据失败:', err));
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

  const fetchTenantUsers = async () => {
    try {
      const orgUsers = await organizationApi.assignableUsers();
      if (orgUsers.length > 0) {
        const mapped = orgUsers
          .filter(u => u.name || u.username)
          .map(u => ({ id: Number(u.id) || 0, name: u.name || u.username, username: u.username }));
        const seen = new Set<string>();
        setTenantUsers(mapped.filter(u => {
          if (seen.has(u.name)) return false;
          seen.add(u.name);
          return true;
        }));
        return;
      }
    } catch { /* 组织成员加载失败，回退到用户列表 */ }
    try {
      const response = await api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>('/system/user/list', { params: { page: 1, pageSize: 1000, status: 'active' } });
      if (response.code === 200) {
        setTenantUsers(response.data.records || []);
      }
    } catch {
      setTenantUsers([]);
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
    setCreateCategory('');
    setCreateUrgencyLevel('normal');
    setCreateMerchandiser('');
    setCreateOrderPlacer(user?.name || user?.username || '');
    setCreateTaskOpen(true);
    fetchStyleInfoOptions('');
    fetchInternalUnitOptions();
    fetchTenantUsers();
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
        customerName: String(createCustomerName || '').trim() || undefined,
        remarks: String(createRemarks || '').trim() || undefined,
        urgencyLevel: createUrgencyLevel,
        productCategory: normalizeCategoryQuery(createCategory) || undefined,
        merchandiser: String(createMerchandiser || '').trim() || undefined,
        orderPlacer: String(createOrderPlacer || '').trim() || undefined,
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
    createCustomerName, setCreateCustomerName,
    createRemarks, setCreateRemarks,
    createUrgencyLevel, setCreateUrgencyLevel,
    createCategory, setCreateCategory,
    createMerchandiser, setCreateMerchandiser,
    createOrderPlacer, setCreateOrderPlacer,
    tenantUsers,
    categoryOptions: CATEGORY_CODE_OPTIONS,
    selectedFactoryStat,
    addProcessNode, addProcessNodeToStage, removeProcessNode, updateProcessNode,
    importFromTemplate,
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
