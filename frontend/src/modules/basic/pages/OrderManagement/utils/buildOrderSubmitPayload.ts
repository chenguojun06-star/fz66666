import type { StyleInfo } from '@/types/style';
import type { OrderLine, ProgressNode } from '../types';

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
    plannedStartDate: values.plannedStartDate ? values.plannedStartDate.format('YYYY-MM-DDTHH:mm:ss') : null,
    plannedEndDate: values.plannedEndDate ? values.plannedEndDate.format('YYYY-MM-DDTHH:mm:ss') : null,
    progressWorkflowJson: buildProgressWorkflowJson(progressNodes),
  };

  return { payload, pricingSnapshot, orderDetails };
};
