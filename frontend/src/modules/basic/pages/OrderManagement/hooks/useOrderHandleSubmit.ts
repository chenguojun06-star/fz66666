import { FormInstance } from 'antd';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import { ProductionOrder } from '@/types/production';
import { OrderLine, ProgressNode } from '../types';
import { buildOrderSubmitPayload } from '../utils/buildOrderSubmitPayload';
import { buildProgressWorkflowJson } from '../utils/progressWorkflowBuilder';

interface SubmitDeps {
  form: FormInstance;
  message: { success: (s: string) => void; error: (s: string) => void };
  selectedStyle: StyleInfo | null;
  setActiveTabKey: (k: string) => void;
  setCreatedOrder: (o: any) => void;
  setSubmitLoading: (v: boolean) => void;
  fetchStyles: () => void;
  doConfirmPricingReady: () => Promise<boolean>;
  orderLines: OrderLine[];
  watchedPricingMode: any;
  orderOrchestration: any;
  resolvedOrderUnitPrice: number;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  factories: any[];
  departments: any[];
  orderLineColors: string[];
  orderLineSizes: string[];
  processBasedUnitPrice: number;
  sizeBasedUnitPrice: number;
  totalCostUnitPrice: number;
  quotationUnitPrice: number;
  suggestedQuotationUnitPrice: number;
  progressNodes: ProgressNode[];
}

function validateOrderLines(deps: SubmitDeps): number | null {
  if (!deps.orderLines.length) {
    deps.message.error('请至少填写一条下单数量');
    deps.setActiveTabKey('base');
    return null;
  }
  const invalid = deps.orderLines.find(l => !String(l.color || '').trim() || !String(l.size || '').trim() || (Number(l.quantity) || 0) <= 0);
  if (invalid) {
    deps.message.error('下单数量需填写颜色、码数且数量>0');
    deps.setActiveTabKey('base');
    return null;
  }
  const computedQty = deps.orderLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  if (computedQty <= 0) {
    deps.message.error('订单总数量必须大于0');
    deps.setActiveTabKey('detail');
    return null;
  }
  if (deps.watchedPricingMode === 'SIZE' && deps.orderOrchestration.missingPriceRecords.length > 0) {
    deps.message.error('当前选择了尺码单价，但还有码价缺失，请补齐或改为工序单价/手动单价');
    deps.setActiveTabKey('base');
    return null;
  }
  if (deps.resolvedOrderUnitPrice <= 0) {
    deps.message.error('单价必须大于0');
    deps.setActiveTabKey('base');
    return null;
  }
  return computedQty;
}

async function ensureOrderNo(deps: SubmitDeps, values: any): Promise<string> {
  if (values.orderNo) return values.orderNo;
  const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
  if (res.code === 200 && typeof res.data === 'string' && res.data) {
    deps.form.setFieldsValue({ orderNo: res.data });
    return res.data;
  }
  return values.orderNo;
}

function resolveFactoryInfo(deps: SubmitDeps, values: any) {
  if (deps.factoryMode === 'INTERNAL') {
    const dept = deps.departments.find(d => d.id === values.orgUnitId);
    return { factoryId: null as string | null, orgUnitId: values.orgUnitId || null, factoryName: dept?.nodeName || '' };
  }
  const factory = deps.factories.find(f => f.id === values.factoryId);
  return { factoryId: values.factoryId || null, orgUnitId: null as string | null, factoryName: factory?.factoryName || '' };
}

export function useOrderHandleSubmit(deps: SubmitDeps) {
  return async () => {
    if (!deps.selectedStyle) return;
    try {
      const confirmed = await deps.doConfirmPricingReady();
      if (!confirmed) return;
      deps.setSubmitLoading(true);

      const computedQty = validateOrderLines(deps);
      if (computedQty === null) return;

      const values = await deps.form.validateFields();
      const ensuredOrderNo = await ensureOrderNo(deps, values);
      const { factoryId, orgUnitId, factoryName } = resolveFactoryInfo(deps, values);

      const colorLabel = deps.orderLineColors.length ? deps.orderLineColors.join(',') : undefined;
      const sizeLabel = deps.orderLineSizes.length ? deps.orderLineSizes.join(',') : undefined;

      const { payload } = buildOrderSubmitPayload({
        values,
        selectedStyle: deps.selectedStyle,
        ensuredOrderNo,
        colorLabel,
        sizeLabel,
        resolvedFactoryId: factoryId,
        resolvedFactoryName: factoryName,
        resolvedOrgUnitId: orgUnitId,
        factoryMode: deps.factoryMode,
        orderLines: deps.orderLines,
        computedQty,
        orderOrchestration: deps.orderOrchestration,
        materialPriceSource: '物料采购系统',
        materialPriceAcquiredAt: dayjs().toISOString(),
        materialPriceVersion: 'purchase.v1',
        processBasedUnitPrice: deps.processBasedUnitPrice,
        sizeBasedUnitPrice: deps.sizeBasedUnitPrice,
        totalCostUnitPrice: deps.totalCostUnitPrice,
        quotationUnitPrice: deps.quotationUnitPrice,
        suggestedQuotationUnitPrice: deps.suggestedQuotationUnitPrice,
        resolvedOrderUnitPrice: deps.resolvedOrderUnitPrice,
        buildProgressWorkflowJson,
        progressNodes: deps.progressNodes,
      });
      const response = await api.post<{ code: number; message: string; data: ProductionOrder }>('/production/order', payload);
      if (response.code === 200) {
        deps.setCreatedOrder(response.data || payload);
        deps.setActiveTabKey('bom');
        deps.message.success('已下单');
        deps.fetchStyles();
      } else {
        deps.message.error(response.message || '下单失败');
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        const ef = error as { errorFields?: Array<{ errors?: string[] }> };
        deps.message.error(ef.errorFields?.[0]?.errors?.[0] || '表单校验失败');
      } else {
        deps.message.error(error instanceof Error ? error.message : '下单失败');
      }
    } finally {
      deps.setSubmitLoading(false);
    }
  };
}
