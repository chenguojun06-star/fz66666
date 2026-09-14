import React from 'react';
import { Collapse, Form, InputNumber, Select, Tag } from 'antd';
import type { OrderOrchestrationResult } from '../utils/orderIntelligence';
import { formatMoney } from '@/utils/format';

interface OrderPricingMaterialPanelProps {
  sizePriceLoading: boolean;
  sizePriceCount: number;
  processBasedUnitPrice: number;
  sizeBasedUnitPrice: number;
  totalCostUnitPrice: number;
  quotationUnitPrice: number;
  suggestedQuotationUnitPrice: number;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  watchedPricingMode: 'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL';
  resolvedOrderUnitPrice: number;
  onPricingModeChange: () => void;
  orchestration: OrderOrchestrationResult;
}

const OrderPricingMaterialPanel: React.FC<OrderPricingMaterialPanelProps> = ({
  sizePriceLoading,
  sizePriceCount,
  processBasedUnitPrice,
  sizeBasedUnitPrice,
  totalCostUnitPrice,
  quotationUnitPrice,
  suggestedQuotationUnitPrice,
  factoryMode,
  watchedPricingMode,
  resolvedOrderUnitPrice,
  onPricingModeChange,
  orchestration,
}) => {
  const visibleMaterials = orchestration.materialAnalyses.filter((item) => item.requiredMeters > 0);
  const scatterDecisionText = (() => {
    if ((orchestration.totalQty || 0) <= 0) {
      return '当前还没录入下单数量，暂时无法判断是多、少还是持平';
    }
    if ((orchestration.qtyGapToNoScatter || 0) > 0) {
      return `当前低于免散剪线，还差 ${orchestration.qtyGapToNoScatter} 件，属于散剪偏高`;
    }
    if ((orchestration.scatterPremiumPerPiece || 0) > 0 || (orchestration.scatterPremiumTotal || 0) > 0) {
      return `当前有散剪加价，单件多 ${formatMoney(orchestration.scatterPremiumPerPiece)}，整单多 ${formatMoney(orchestration.scatterPremiumTotal)}`;
    }
    return '当前已到免散剪线，与基准持平';
  })();
  // D-219：计算方式说明——让用户看得懂单件用料怎么来的
  const usageFormulaText = '面料需求 = 单件用料(含损耗) × 对应颜色/码数下单量，各色码求和；单件用料优先取纸样各码用量，未维护纸样时取单件用量。';

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-base)',
      }}
    >
      <div className="u-d-flex u-jc-between u-gap-12 u-fwrap-wrap u-mb-10">
        <div>
          <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>单价与面辅料分析</div>
          <div className="u-mt-4 u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>
            {factoryMode === 'EXTERNAL' ? '成本价格已匹配外发整件单价' : '内部工厂继续使用工序单价'} · 报价参考 {quotationUnitPrice > 0 ? formatMoney(quotationUnitPrice) : '-'}
          </div>
        </div>
        <div className="u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>{sizePriceLoading ? '码价读取中...' : `已维护 ${sizePriceCount} 条码价`}</div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          alignItems: 'start',
          marginBottom: 12,
        }}
      >
        <div className="u-d-grid u-gap-8 u-ai-start" style={{ gridTemplateColumns: '56px minmax(0, 1fr)' }}>
          <div className="u-fs-14" style={{ paddingTop: 6, color: 'var(--color-text-secondary)' }}>单价</div>
          <div>
            <Form.Item name="pricingMode" initialValue="PROCESS" className="u-mb-0">
              <Select
                onChange={onPricingModeChange}
                options={[
                  { label: `工序单价 · ${formatMoney(processBasedUnitPrice)}/件`, value: 'PROCESS' },
                  { label: `尺码单价 · ${formatMoney(sizeBasedUnitPrice)}/件`, value: 'SIZE' },
                  { label: `外发整件单价 · ${formatMoney(totalCostUnitPrice)}/件`, value: 'COST' },
                  ...(quotationUnitPrice > 0 ? [{ label: `报价单价 · ${formatMoney(quotationUnitPrice)}/件`, value: 'QUOTE' }] : []),
                  { label: '手动单价', value: 'MANUAL' },
                ]}
              />
            </Form.Item>
          </div>
        </div>
        <div className="u-d-grid u-gap-8 u-ai-start" style={{ gridTemplateColumns: '56px minmax(0, 1fr)' }}>
          <div className="u-fs-14" style={{ paddingTop: 6, color: 'var(--color-text-secondary)' }}>锁定价格</div>
          <div>
            {watchedPricingMode === 'MANUAL' ? (
              <Form.Item
                name="manualOrderUnitPrice"
                rules={[{ required: true, message: '请输入单价' }]}
                className="u-mb-0"
              >
                <InputNumber min={0.01} precision={2} className="u-w-full" placeholder="输入单价" />
              </Form.Item>
            ) : (
              <div className="u-d-flex u-ai-center u-fs-14" style={{ minHeight: 32, color: 'var(--color-text-secondary)' }}>
                <span className="u-fw-600" style={{ color: 'var(--color-primary)' }}>{formatMoney(resolvedOrderUnitPrice)} / 件</span>
                {suggestedQuotationUnitPrice > 0 ? <span className="u-ml-8" style={{ color: 'var(--color-text-secondary)' }}>建议报价 {formatMoney(suggestedQuotationUnitPrice)}</span> : null}
              </div>
            )}
          </div>
        </div>
      </div>
      <Collapse
        defaultActiveKey={[]}
        ghost
       
        items={[{
          key: 'analysis',
          label: <span className="u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>明细分析</span>,
          children: (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1.2fr',
                gap: 12,
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                lineHeight: '20px',
              }}
            >
        <div className="u-p-12 u-br-8" style={{ border: '1px solid var(--color-border-light)', background: 'var(--color-slate-50)', minHeight: 96 }}>
          <div className="u-d-flex u-jc-between u-gap-8 u-ai-center u-mb-6">
            <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>码数与单价</div>
            <Tag color={orchestration.pricingStatus}>{orchestration.pricingMode}</Tag>
          </div>
          <div>尺码：{orchestration.sizeLabels.length ? orchestration.sizeLabels.join('、') : '-'}</div>
          <div>价差工序：{orchestration.differentialProcesses.length ? orchestration.differentialProcesses.join('、') : '无'}</div>
          <div>缺失码价：{orchestration.missingPriceRecords.length ? orchestration.missingPriceRecords.slice(0, 2).join('；') : '无'}</div>
        </div>
        <div className="u-p-12 u-br-8" style={{ border: '1px solid var(--color-border-light)', background: 'var(--color-slate-50)', minHeight: 96 }}>
          <div className="u-d-flex u-jc-between u-gap-8 u-ai-center u-mb-6">
            <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>面辅料散剪</div>
            <Tag color={orchestration.scatterStatus}>{orchestration.scatterMode}</Tag>
          </div>
          <div>{orchestration.fabricFamily} / {orchestration.fabricSubcategory || '常规品类'}</div>
          {/* D-219：列出全部面料（含里布），每行展示单件用料×下单数=需求量 */}
          {visibleMaterials.length > 0 ? visibleMaterials.map((item) => (
            <div key={item.key}>
              {item.categoryLabel} {item.label}：单件 {item.perPieceMeters} 米 × 下单 {item.matchedOrderQty} 件 ≈ {item.requiredMeters} 米
            </div>
          )) : (
            <div>{orchestration.primaryFabricName}：约 {orchestration.primaryRequiredMeters || 0} 米</div>
          )}
          <div>基准段长：约 {orchestration.benchmarkRollMeters || 0} 米（主面料）</div>
          <div>免散剪量：约 {orchestration.noScatterQtyThreshold || 0} 件</div>
        </div>
        <div className="u-p-12 u-br-8" style={{ border: '1px solid var(--color-border-light)', background: 'var(--color-slate-50)', minHeight: 96 }}>
          <div className="u-d-flex u-jc-between u-gap-8 u-mb-8">
            <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>面料差异</div>
            <div style={{ color: orchestration.scatterLevel === 'high' ? 'var(--color-error)' : orchestration.scatterLevel === 'medium' ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {scatterDecisionText}
            </div>
          </div>
          <div className="u-fs-12 u-mb-8" style={{ color: 'var(--color-text-tertiary)' }}>{usageFormulaText}</div>
          <div className="u-d-grid u-gap-8 u-mb-8" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {visibleMaterials.map((item) => (
              <div key={item.key} className="u-br-8" style={{ padding: 8, border: '1px solid var(--color-border-light)', background: 'var(--color-bg-base)' }}>
                <div className="u-d-flex u-jc-between u-gap-8 u-mb-4">
                  <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>{item.categoryLabel} · {item.label}</div>
                </div>
                <div>单件用料：{item.perPieceMeters} 米/件（含损耗）</div>
                <div>下单数量：{item.matchedOrderQty} 件</div>
                <div>需求：{item.requiredMeters} 米</div>
                <div>基准：{item.benchmarkMeters} 米</div>
                <div>免散剪：{item.noScatterQtyThreshold || 0} 件</div>
              </div>
            ))}
          </div>
          <div className="u-d-grid u-gap-6">
            <div className="u-d-flex u-gap-16 u-fwrap-wrap">
              <span>订单：{orchestration.totalQty || 0} 件 / {orchestration.comboCount || 0} 组</span>
              <span>{orchestration.qtyGapToNoScatter > 0 ? `还差 ${orchestration.qtyGapToNoScatter} 件到免散剪线` : '已到免散剪线'}</span>
            </div>
            <div className="u-d-flex u-gap-16 u-fwrap-wrap">
              <span>散剪偏差：{formatMoney(orchestration.scatterPremiumPerPiece)} / 件</span>
              <span>整单偏差：{formatMoney(orchestration.scatterPremiumTotal)}</span>
            </div>
            <div style={{ color: orchestration.scatterPremiumPerPiece > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
              {orchestration.scatterPremiumPerPiece > 0
                ? `散剪会让成本单件增加 ${formatMoney(orchestration.scatterPremiumPerPiece)} / 件`
                : '当前散剪不会额外拉高单件成本'}
            </div>
          </div>
        </div>
            </div>
          ),
        }]}
      />
    </div>
  );
};

export default OrderPricingMaterialPanel;
