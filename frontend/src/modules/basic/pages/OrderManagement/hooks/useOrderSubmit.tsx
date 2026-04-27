import { useState, useMemo, useEffect } from 'react';
import { App, Form, Tag } from 'antd';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { StyleInfo, StyleBom } from '@/types/style';
import type { SizePriceRecord } from '../utils/orderIntelligence';
import { OrderLine, PricingProcess, ProgressNode, defaultProgressNodes } from '../types';
import { buildOrderQtyStats, calcBomRequirementQty, getMatchedOrderQty, normalizeMatchKey } from '../utils/orderBomMetrics';
import { buildOrderSubmitPayload } from '../utils/buildOrderSubmitPayload';
import { analyzeOrderOrchestration, computeProcessBasedUnitPrice } from '../utils/orderIntelligence';
import { computeReferenceKilograms } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { normalizeCategoryQuery } from '@/utils/styleCategory';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { ProductionOrder } from '@/types/production';

export const useOrderSubmit = (deps: {
  form: ReturnType<typeof Form.useForm>[0];
  selectedStyle: StyleInfo | null;
  setSelectedStyle: (s: StyleInfo | null) => void;
  setVisible: (v: boolean) => void;
  setActiveTabKey: (k: string) => void;
  setCreatedOrder: (o: any) => void;
  setBomList: (list: StyleBom[]) => void;
  setSizePriceRows: (rows: SizePriceRecord[]) => void;
  setSchedulingResult: (v: any) => void;
  setOrderLines: (lines: OrderLine[]) => void;
  setProgressNodes: (nodes: ProgressNode[]) => void;
  setFactoryMode: (m: 'INTERNAL' | 'EXTERNAL') => void;
  setPricingModeTouched: (v: boolean) => void;
  setBomLoading: (v: boolean) => void;
  setSizePriceLoading: (v: boolean) => void;
  setSubmitLoading: (v: boolean) => void;
  orderLines: OrderLine[];
  sizePriceRows: SizePriceRecord[];
  progressNodes: ProgressNode[];
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  watchedPricingMode: 'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL';
  resolvedOrderUnitPrice: number;
  processBasedUnitPrice: number;
  sizeBasedUnitPrice: number;
  totalCostUnitPrice: number;
  quotationUnitPrice: number;
  suggestedQuotationUnitPrice: number;
  factories: any[];
  departments: any[];
  fetchStyles: () => void;
  normalizeSizeKey: (v: unknown) => string;
  displaySizeLabel: (v: unknown) => string;
  splitOptions: (value?: string) => string[];
  mergeDistinctOptions: (...groups: Array<string[] | undefined>) => string[];
  parseSizeColorConfig: (raw: unknown) => { sizes: string[]; colors: string[] };
  bomByType: { fabric: StyleBom[]; lining: StyleBom[]; accessory: StyleBom[] };
  orderOrchestration: ReturnType<typeof analyzeOrderOrchestration>;
  deliverySuggestion: any;
  suggestionLoading: boolean;
  selectedFactoryStat: any;
  watchedFactoryId: string | undefined;
  watchedOrgUnitId: string | undefined;
  factoryCapacities: any[];
  users: any[];
  categoryOptions: any[];
  orderLearningLoading: boolean;
  orderLearningRecommendation: any;
  schedulingLoading: boolean;
  schedulingPlans: any[];
}) => {
  const { modal, message } = App.useApp();

  const confirmPricingReady = () =>
    new Promise<boolean>((resolve) => {
      modal.confirm({
        width: 560,
        title: '下单提醒',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: '#595959' }}>请在提交前确认价格编排与面辅料编排都已核对完成。</div>
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>价格编排</span>
                <Tag color={deps.orderOrchestration.pricingStatus === 'error' ? 'error' : deps.orderOrchestration.pricingStatus === 'warning' ? 'warning' : deps.orderOrchestration.pricingStatus === 'success' ? 'success' : 'default'}>
                  {deps.watchedPricingMode === 'MANUAL'
                    ? '手动单价'
                    : deps.watchedPricingMode === 'SIZE'
                      ? '尺码单价'
                      : deps.watchedPricingMode === 'COST'
                        ? '整件成本价'
                        : deps.watchedPricingMode === 'QUOTE'
                          ? '报价单价'
                          : '工序单价'}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#595959' }}>{deps.orderOrchestration.pricingSummary}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#1677ff' }}>下单锁定单价：¥{deps.resolvedOrderUnitPrice.toFixed(2)} / 件</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>面辅料编排</span>
                <Tag color={deps.orderOrchestration.scatterStatus === 'error' ? 'error' : deps.orderOrchestration.scatterStatus === 'warning' ? 'warning' : 'success'}>
                  {deps.orderOrchestration.scatterMode}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#595959' }}>{deps.orderOrchestration.scatterSummary}</div>
            </div>
          </div>
        ),
        okText: '确认下单',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const buildProgressNodesFromTemplate = (rows: any[]): ProgressNode[] => {
    return (Array.isArray(rows) ? rows : [])
      .map((n: any) => {
        const name = String(n?.name || n?.processName || '').trim();
        if (!name) return null;
        const id = String(n?.id || n?.processCode || name || '').trim() || name;
        const p = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        const progressStage = String(n?.progressStage || name).trim();
        const machineType = String(n?.machineType || '').trim();
        const standardTime = Number(n?.standardTime) || 0;
        return {
          id,
          name,
          progressStage,
          machineType,
          standardTime,
          processes: [{ id: `${id}-0`, processName: name, unitPrice, progressStage, machineType, standardTime }],
        } as unknown as ProgressNode;
      })
      .filter(Boolean) as ProgressNode[];
  };

  const loadProgressNodesForStyle = async (styleNo: string) => {
    const sn = String(styleNo || '').trim();
    if (!sn) return;
    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(sn);
      const result = res as Record<string, unknown>;
      if (result.code !== 200) return;
      const rows = Array.isArray(result.data) ? result.data : [];
      const normalized = buildProgressNodesFromTemplate(rows);
      if (normalized.length) {
        deps.setProgressNodes(normalized);
      }
    } catch (e) {
      console.error('[订单] 加载工序模板失败:', e);
    }
  };

  const buildProgressWorkflowJson = (nodes: ProgressNode[]) => {
    const allProcesses: Array<{
      id: string; name: string; unitPrice: number; progressStage: string;
      machineType: string; standardTime: number; sortOrder: number;
    }> = [];

    (Array.isArray(nodes) ? nodes : []).forEach((n, idx) => {
      const name = String(n?.name || '').trim();
      if (!name) return;
      const id = String(n?.id || name || '').trim() || name;
      const progressStage = String((n as any)?.progressStage || name).trim();
      const machineType = String((n as any)?.machineType || '').trim();
      const standardTime = Number((n as any)?.standardTime) || 0;
      const processes = (Array.isArray(n?.processes) ? n.processes : []) as PricingProcess[];
      const unitPrice = processes.reduce((sum, p) => sum + (Number(p?.unitPrice) || 0), 0);
      allProcesses.push({ id, name, unitPrice, progressStage, machineType, standardTime, sortOrder: idx });
    });

    const ensuredProcesses = allProcesses.length > 0
      ? allProcesses
      : defaultProgressNodes.map((n, idx) => ({
          id: n.id, name: n.name,
          unitPrice: (Array.isArray(n.processes) ? n.processes : []).reduce((sum, p) => sum + (Number(p.unitPrice) || 0), 0),
          progressStage: n.name, machineType: '', standardTime: 0, sortOrder: idx,
        }));

    const processesByNode: Record<string, typeof ensuredProcesses> = {};
    for (const p of ensuredProcesses) {
      const stage = p.progressStage || p.name;
      if (!processesByNode[stage]) processesByNode[stage] = [];
      processesByNode[stage].push(p);
    }

    return JSON.stringify({ nodes: ensuredProcesses, processesByNode });
  };

  const generateOrderNo = async () => {
    try {
      const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
      if (res.code === 200 && typeof res.data === 'string' && res.data) {
        deps.form.setFieldsValue({ orderNo: res.data });
      }
    } catch { /* intentionally empty */ }
  };

  const fetchBom = async (styleId: string | number) => {
    deps.setBomLoading(true);
    try {
      const res = await api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?styleId=${styleId}`);
      if (res.code === 200) deps.setBomList(res.data || []);
      else deps.setBomList([]);
    } catch { deps.setBomList([]); } finally { deps.setBomLoading(false); }
  };

  const fetchSizePrices = async (styleId: string | number) => {
    deps.setSizePriceLoading(true);
    try {
      const res = await api.get<{ code: number; data: SizePriceRecord[] }>('/style/size-price/list', { params: { styleId } });
      if (res.code === 200) deps.setSizePriceRows(Array.isArray(res.data) ? res.data : []);
      else deps.setSizePriceRows([]);
    } catch { deps.setSizePriceRows([]); } finally { deps.setSizePriceLoading(false); }
  };

  const openCreate = (style: StyleInfo) => {
    deps.setSelectedStyle(style);
    deps.setVisible(true);
    deps.setActiveTabKey('base');
    deps.setCreatedOrder(null);
    deps.setProgressNodes(defaultProgressNodes);
    void loadProgressNodesForStyle(String(style.styleNo || '').trim());
    if (style.id !== undefined && style.id !== null && String(style.id)) {
      fetchBom(style.id);
      fetchSizePrices(style.id);
    } else {
      deps.setBomList([]);
      deps.setSizePriceRows([]);
    }
    deps.setSchedulingResult(null);

    const parsedConfig = deps.parseSizeColorConfig((style as any)?.sizeColorConfig);
    const initColors = deps.mergeDistinctOptions(deps.splitOptions(style.color), parsedConfig.colors);
    const initSizes = deps.mergeDistinctOptions(deps.splitOptions(style.size), parsedConfig.sizes);
    if (initColors.length && initSizes.length) {
      deps.setOrderLines([]);
    } else {
      const initColor = deps.splitOptions(style.color)[0] || style.color || parsedConfig.colors[0] || '';
      const initSize = deps.splitOptions(style.size)[0] || style.size || parsedConfig.sizes[0] || '';
      deps.setOrderLines([{ id: String(Date.now()), color: initColor, size: initSize, quantity: 1 }]);
    }

    const today = dayjs();
    deps.form.setFieldsValue({
      orderNo: '', factoryId: undefined, plateType: undefined,
      merchandiser: style.orderType || undefined,
      company: style.customer || undefined,
      productCategory: normalizeCategoryQuery(style.category) || undefined,
      patternMaker: style.sampleSupplier || undefined,
      orderQuantity: 1, pricingMode: 'PROCESS', manualOrderUnitPrice: undefined,
      scatterPricingMode: 'FOLLOW_ORDER', manualScatterUnitPrice: undefined,
      plannedStartDate: today, plannedEndDate: today.add(7, 'day'),
    });
    deps.setPricingModeTouched(false);
    generateOrderNo();
  };

  const closeDialog = () => {
    deps.setVisible(false);
    deps.setSelectedStyle(null);
    deps.setCreatedOrder(null);
    deps.setBomList([]);
    deps.setSizePriceRows([]);
    deps.setSchedulingResult(null);
    deps.setActiveTabKey('base');
    deps.setOrderLines([]);
    deps.setProgressNodes(defaultProgressNodes);
    deps.setFactoryMode('INTERNAL');
    deps.setPricingModeTouched(false);
    deps.form.resetFields();
  };

  const handleSubmit = async () => {
    if (!deps.selectedStyle) return;
    try {
      const confirmed = await confirmPricingReady();
      if (!confirmed) return;
      deps.setSubmitLoading(true);

      if (!deps.orderLines.length) {
        message.error('请至少填写一条下单数量');
        deps.setActiveTabKey('base');
        return;
      }

      const invalid = deps.orderLines.find(l => !String(l.color || '').trim() || !String(l.size || '').trim() || (Number(l.quantity) || 0) <= 0);
      if (invalid) {
        message.error('下单数量需填写颜色、码数且数量>0');
        deps.setActiveTabKey('base');
        return;
      }

      const computedQty = deps.orderLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      if (computedQty <= 0) {
        message.error('订单总数量必须大于0');
        deps.setActiveTabKey('detail');
        return;
      }

      if (deps.watchedPricingMode === 'SIZE' && deps.orderOrchestration.missingPriceRecords.length > 0) {
        message.error('当前选择了尺码单价，但还有码价缺失，请补齐或改为工序单价/手动单价');
        deps.setActiveTabKey('base');
        return;
      }

      if (deps.resolvedOrderUnitPrice <= 0) {
        message.error('单价必须大于0');
        deps.setActiveTabKey('base');
        return;
      }

      const values = await deps.form.validateFields() as Record<string, any>;

      let ensuredOrderNo = values.orderNo;
      if (!ensuredOrderNo) {
        const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
        if (res.code === 200 && typeof res.data === 'string' && res.data) {
          ensuredOrderNo = res.data;
          deps.form.setFieldsValue({ orderNo: ensuredOrderNo });
        }
      }

      let resolvedFactoryId: string | null = null;
      let resolvedOrgUnitId: string | null = null;
      let resolvedFactoryName = '';
      if (deps.factoryMode === 'INTERNAL') {
        const dept = deps.departments.find(d => d.id === values.orgUnitId);
        resolvedOrgUnitId = values.orgUnitId || null;
        resolvedFactoryName = dept?.nodeName || '';
      } else {
        const factory = deps.factories.find(f => f.id === values.factoryId);
        resolvedFactoryId = values.factoryId || null;
        resolvedFactoryName = factory?.factoryName || '';
      }

      const orderLineColors = Array.from(new Set(deps.orderLines.map(l => (l.color || '').trim()).filter(Boolean)));
      const orderLineSizes = Array.from(new Set(deps.orderLines.map(l => (l.size || '').trim()).filter(Boolean)));
      const colorLabel = orderLineColors.length ? orderLineColors.join(',') : undefined;
      const sizeLabel = orderLineSizes.length ? orderLineSizes.join(',') : undefined;
      const materialPriceSource = '物料采购系统';
      const materialPriceAcquiredAt = dayjs().toISOString();
      const materialPriceVersion = 'purchase.v1';

      const { payload } = buildOrderSubmitPayload({
        values, selectedStyle: deps.selectedStyle, ensuredOrderNo, colorLabel, sizeLabel,
        resolvedFactoryId, resolvedFactoryName, resolvedOrgUnitId, factoryMode: deps.factoryMode,
        orderLines: deps.orderLines, computedQty, orderOrchestration: deps.orderOrchestration,
        materialPriceSource, materialPriceAcquiredAt, materialPriceVersion,
        processBasedUnitPrice: deps.processBasedUnitPrice,
        sizeBasedUnitPrice: deps.sizeBasedUnitPrice,
        totalCostUnitPrice: deps.totalCostUnitPrice,
        quotationUnitPrice: deps.quotationUnitPrice,
        suggestedQuotationUnitPrice: deps.suggestedQuotationUnitPrice,
        resolvedOrderUnitPrice: deps.resolvedOrderUnitPrice,
        buildProgressWorkflowJson, progressNodes: deps.progressNodes,
      });

      const response = await api.post<{ code: number; message: string; data: ProductionOrder }>('/production/order', payload);
      if (response.code === 200) {
        deps.setCreatedOrder(response.data || payload);
        deps.setActiveTabKey('bom');
        message.success('已下单');
        deps.fetchStyles();
      } else {
        message.error(response.message || '下单失败');
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        const ef = error as { errorFields?: Array<{ errors?: string[] }> };
        message.error(ef.errorFields?.[0]?.errors?.[0] || '表单校验失败');
      } else {
        message.error(error instanceof Error ? error.message : '下单失败');
      }
    } finally {
      deps.setSubmitLoading(false);
    }
  };

  return {
    confirmPricingReady,
    buildProgressNodesFromTemplate,
    loadProgressNodesForStyle,
    buildProgressWorkflowJson,
    generateOrderNo,
    fetchBom,
    fetchSizePrices,
    openCreate,
    closeDialog,
    handleSubmit,
  };
};
