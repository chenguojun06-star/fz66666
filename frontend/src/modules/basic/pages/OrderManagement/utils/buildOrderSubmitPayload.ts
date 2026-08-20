import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import type { OrderLine, ProgressNode } from '../types';

/**
 * 安全格式化时间字段：
 * 表单值可能是 dayjs 对象（正常选择）也可能是字符串（编辑回填/持久化恢复/异常路径），
 * 直接调用 .format() 会在字符串上报 "plannedStartDate.format is not a function"。
 * 统一 dayjs() 包装 + 空值兜底 null。
 */
const safeFormatDateTime = (value: unknown): string | null => {
  if (!value) return null;
  const d = dayjs(value as any);
  return d.isValid() ? d.format('YYYY-MM-DDTHH:mm:ss') : null;
};

interface BuildOrderSubmitPayloadArgs {
  values: Record<string, any>;
  selectedStyle: StyleInfo;
  ensuredOrderNo: string;
  colorLabel?: string;
  sizeLabel?: string;
  resolvedFactoryId: string | null;
  resolvedFactoryName: string;
  resolvedOrgUnitId: string | null;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  orderLines: OrderLine[];
  computedQty: number;
  orderOrchestration: {
    pricingSummary: string;
    scatterSummary: string;
    sizeLabels: string[];
    differentialProcesses: string[];
  };
  materialPriceSource: string;
  materialPriceAcquiredAt: string;
  materialPriceVersion: string;
  processBasedUnitPrice: number;
  sizeBasedUnitPrice: number;
  totalCostUnitPrice: number;
  quotationUnitPrice: number;
  suggestedQuotationUnitPrice: number;
  resolvedOrderUnitPrice: number;
  buildProgressWorkflowJson: (nodes: ProgressNode[]) => string;
  progressNodes: ProgressNode[];
  extJson?: string;
}

export const buildOrderSubmitPayload = ({
  values,
  selectedStyle,
  ensuredOrderNo,
  colorLabel,
  sizeLabel,
  resolvedFactoryId,
  resolvedFactoryName,
  resolvedOrgUnitId,
  factoryMode,
  orderLines,
  computedQty,
  orderOrchestration,
  materialPriceSource,
  materialPriceAcquiredAt,
  materialPriceVersion,
  processBasedUnitPrice,
  sizeBasedUnitPrice,
  totalCostUnitPrice,
  quotationUnitPrice,
  suggestedQuotationUnitPrice,
  resolvedOrderUnitPrice,
  buildProgressWorkflowJson,
  progressNodes,
  extJson,
}: BuildOrderSubmitPayloadArgs) => {
  const pricingSnapshot = {
    pricingMode: values.pricingMode || 'PROCESS',
    processBasedUnitPrice,
    sizeBasedUnitPrice,
    totalCostUnitPrice,
    quotationUnitPrice,
    suggestedQuotationUnitPrice,
    orderUnitPrice: resolvedOrderUnitPrice,
    pricingSummary: orderOrchestration.pricingSummary,
    scatterSummary: orderOrchestration.scatterSummary,
    sizeLabels: orderOrchestration.sizeLabels,
    differentialProcesses: orderOrchestration.differentialProcesses,
  };

  const orderDetails = JSON.stringify({
    lines: orderLines.map((line) => ({
      color: line.color,
      size: line.size,
      quantity: line.quantity,
      skuCode: `${selectedStyle.styleNo}-${line.color}-${line.size}`,
      skuMode: (selectedStyle as any)?.skuMode || 'AUTO',
      materialPriceSource,
      materialPriceAcquiredAt,
      materialPriceVersion,
    })),
    pricing: pricingSnapshot,
  });

  const payload: any = {
    orderNo: ensuredOrderNo,
    styleId: String(selectedStyle.id ?? ''),
    styleNo: selectedStyle.styleNo,
    styleName: selectedStyle.styleName,
    plateType: values.plateType || null,
    color: colorLabel,
    size: sizeLabel,
    factoryId: resolvedFactoryId,
    factoryName: resolvedFactoryName,
    orgUnitId: resolvedOrgUnitId,
    factoryType: factoryMode,
    merchandiser: values.merchandiser || null,
    company: values.company || null,
    customerId: values.customerId || null,
    customerName: values.customerName || values.company || null,
    productCategory: values.productCategory || null,
    patternMaker: values.patternMaker || null,
    urgencyLevel: values.urgencyLevel || 'normal',
    orderBizType: values.orderBizType || null,
    skc: selectedStyle?.skc || null,
    orderQuantity: computedQty,
    orderDetails,
    factoryUnitPrice: resolvedOrderUnitPrice,
    quotationUnitPrice: quotationUnitPrice > 0 ? quotationUnitPrice : null,
    pricingMode: values.pricingMode || 'PROCESS',
    plannedStartDate: safeFormatDateTime(values.plannedStartDate),
    plannedEndDate: safeFormatDateTime(values.plannedEndDate),
    expectedShipDate: safeFormatDateTime(values.plannedEndDate),
    progressWorkflowJson: buildProgressWorkflowJson(progressNodes),
    extJson,
  };

  return { payload, pricingSnapshot, orderDetails };
};
