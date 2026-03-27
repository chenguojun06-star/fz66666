import React from 'react';
import { Form, InputNumber, Select, Tag } from 'antd';
import type { OrderOrchestrationResult } from '../utils/orderIntelligence';

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
  watchedScatterPricingMode: 'FOLLOW_ORDER' | 'MANUAL';
  resolvedOrderUnitPrice: number;
  resolvedScatterUnitPrice: number;
  onPricingModeChange: () => void;
  onScatterPricingModeChange: () => void;
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
  watchedScatterPricingMode,
  resolvedOrderUnitPrice,
  resolvedScatterUnitPrice,
  onPricingModeChange,
  onScatterPricingModeChange,
  orchestration,
}) => {
  const visibleMaterials = orchestration.materialAnalyses.filter((item) => item.requiredMeters > 0).slice(0, 6);
  const scatterDecisionText = (() => {
    if ((orchestration.totalQty || 0) <= 0) {
      return '当前还没录入下单数量，暂时无法判断是多、少还是持平';
    }
    if ((orchestration.qtyGapToNoScatter || 0) > 0) {
      return `当前低于免散剪线，还差 ${orchestration.qtyGapToNoScatter} 件，属于散剪偏高`;
    }
    if ((orchestration.scatterPremiumPerPiece || 0) > 0 || (orchestration.scatterPremiumTotal || 0) > 0) {
      return `当前有散剪加价，单件多 ¥${orchestration.scatterPremiumPerPiece.toFixed(2)}，整单多 ¥${orchestration.scatterPremiumTotal.toFixed(2)}`;
    }
    return '当前已到免散剪线，与基准持平';
  })();

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1f1f1f' }}>下单单价与面辅料分析</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
            {factoryMode === 'EXTERNAL' ? '成本价格已匹配外发整件单价' : '内部工厂继续使用工序单价'} · 报价参考 {quotationUnitPrice > 0 ? `¥${quotationUnitPrice.toFixed(2)}` : '-'}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{sizePriceLoading ? '码价读取中...' : `已维护 ${sizePriceCount} 条码价`}</div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 10,
          alignItems: 'start',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
            <div style={{ paddingTop: 6, fontSize: 12, color: '#595959' }}>下单单价</div>
            <div>
              <Form.Item name="pricingMode" initialValue="PROCESS" style={{ marginBottom: 0 }}>
                <Select
                  onChange={onPricingModeChange}
                  options={[
                    { label: `工序单价 · ¥${processBasedUnitPrice.toFixed(2)}/件`, value: 'PROCESS' },
                    { label: `尺码单价 · ¥${sizeBasedUnitPrice.toFixed(2)}/件`, value: 'SIZE' },
                    { label: `外发整件单价 · ¥${totalCostUnitPrice.toFixed(2)}/件`, value: 'COST' },
                    ...(quotationUnitPrice > 0 ? [{ label: `报价单价 · ¥${quotationUnitPrice.toFixed(2)}/件`, value: 'QUOTE' }] : []),
                    { label: '手动单价', value: 'MANUAL' },
                  ]}
                />
              </Form.Item>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
            <div style={{ paddingTop: 6, fontSize: 12, color: '#595959' }}>锁定价格</div>
            <div>
              {watchedPricingMode === 'MANUAL' ? (
                <Form.Item
                  name="manualOrderUnitPrice"
                  rules={[{ required: true, message: '请输入下单单价' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="输入下单单价" />
                </Form.Item>
              ) : (
                <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', fontSize: 12, color: '#595959' }}>
                  <span style={{ fontWeight: 600, color: '#1677ff' }}>¥{resolvedOrderUnitPrice.toFixed(2)} / 件</span>
                  {suggestedQuotationUnitPrice > 0 ? <span style={{ marginLeft: 8, color: '#8c8c8c' }}>建议报价 ¥{suggestedQuotationUnitPrice.toFixed(2)}</span> : null}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
            <div style={{ paddingTop: 6, fontSize: 12, color: '#595959' }}>散剪单价</div>
            <div>
              <Form.Item name="scatterPricingMode" initialValue="FOLLOW_ORDER" style={{ marginBottom: 0 }}>
                <Select
                  onChange={onScatterPricingModeChange}
                  options={[
                    { label: '跟随下单单价', value: 'FOLLOW_ORDER' },
                    { label: '单独设置散剪单价', value: 'MANUAL' },
                  ]}
                />
              </Form.Item>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
            <div style={{ paddingTop: 6, fontSize: 12, color: '#595959' }}>散剪价格</div>
            <div>
              {watchedScatterPricingMode === 'MANUAL' ? (
                <Form.Item
                  name="manualScatterUnitPrice"
                  rules={[{ required: true, message: '请输入散剪单价' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="输入散剪单价" />
                </Form.Item>
              ) : (
                <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', fontSize: 12, color: '#595959' }}>
                  <span style={{ fontWeight: 600, color: '#d48806' }}>¥{resolvedScatterUnitPrice.toFixed(2)} / 件</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1.2fr',
          gap: 12,
          fontSize: 12,
          color: '#595959',
          lineHeight: '20px',
          marginTop: 4,
        }}
      >
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid #f0f0f0', background: '#fcfcfd', minHeight: 96 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, color: '#1f1f1f' }}>码数与单价</div>
            <Tag color={orchestration.pricingStatus}>{orchestration.pricingMode}</Tag>
          </div>
          <div>尺码：{orchestration.sizeLabels.length ? orchestration.sizeLabels.join('、') : '-'}</div>
          <div>价差工序：{orchestration.differentialProcesses.length ? orchestration.differentialProcesses.join('、') : '无'}</div>
          <div>缺失码价：{orchestration.missingPriceRecords.length ? orchestration.missingPriceRecords.slice(0, 2).join('；') : '无'}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid #f0f0f0', background: '#fcfcfd', minHeight: 96 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, color: '#1f1f1f' }}>面辅料散剪</div>
            <Tag color={orchestration.scatterStatus}>{orchestration.scatterMode}</Tag>
          </div>
          <div>{orchestration.fabricFamily} / {orchestration.fabricSubcategory || '常规品类'}</div>
          <div>{orchestration.primaryFabricName}：约 {orchestration.primaryRequiredMeters || 0} 米</div>
          <div>基准段长：约 {orchestration.benchmarkRollMeters || 0} 米</div>
          <div>免散剪量：约 {orchestration.noScatterQtyThreshold || 0} 件</div>
        </div>
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid #f0f0f0', background: '#fcfcfd', minHeight: 96 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 600, color: '#1f1f1f' }}>面料差异</div>
            <div style={{ color: orchestration.scatterLevel === 'high' ? '#cf1322' : orchestration.scatterLevel === 'medium' ? '#d48806' : '#389e0d' }}>
              {scatterDecisionText}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
            {visibleMaterials.slice(0, 2).map((item) => (
              <div key={item.key} style={{ padding: 8, borderRadius: 8, border: '1px solid #f0f0f0', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, color: '#1f1f1f' }}>{item.categoryLabel}</div>
                  <div style={{ color: '#8c8c8c' }}>{item.label}</div>
                </div>
                <div>需求：{item.requiredMeters} 米</div>
                <div>基准：{item.benchmarkMeters} 米</div>
                <div>免散剪：{item.noScatterQtyThreshold || 0} 件</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>订单：{orchestration.totalQty || 0} 件 / {orchestration.comboCount || 0} 组</span>
              <span>{orchestration.qtyGapToNoScatter > 0 ? `还差 ${orchestration.qtyGapToNoScatter} 件到免散剪线` : '已到免散剪线'}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>散剪偏差：¥{orchestration.scatterPremiumPerPiece.toFixed(2)} / 件</span>
              <span>整单偏差：¥{orchestration.scatterPremiumTotal.toFixed(2)}</span>
            </div>
            <div style={{ color: orchestration.scatterPremiumPerPiece > 0 ? '#cf1322' : '#389e0d', fontWeight: 600 }}>
              {orchestration.scatterPremiumPerPiece > 0
                ? `散剪会让成本单件增加 ¥${orchestration.scatterPremiumPerPiece.toFixed(2)} / 件`
                : '当前散剪不会额外拉高单件成本'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderPricingMaterialPanel;
