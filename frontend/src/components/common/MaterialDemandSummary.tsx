import React from 'react';
import { Collapse, Tag } from 'antd';

/**
 * D-660 物料需求一览（共享模块）
 *
 * 把下单页「单价与面辅料分析」的物料需求可视化语言抽成通用组件，铺到采购链路各处：
 * 每物料一张卡——需求 / 库存 / 在途 / 缺口，一眼看清"要采什么料、还差多少"。
 *
 * 数据口径与智能采购推荐一致：净需求 = 需求(物料用量×下单量，含损耗) − 可用库存 − 在途采购。
 * 调用方自行取数（如 /production/purchase/demand/preview?orderNo=），本组件只管渲染。
 */

export interface MaterialDemandItem {
  key: string;
  /** 类别前缀，如 面料/里布/辅料 */
  categoryLabel?: string;
  /** 物料展示名 */
  label: string;
  /** 需求量（BOM 口径，含损耗） */
  requiredQty: number;
  /** 可用库存 */
  stockQty?: number;
  /** 在途采购未到货 */
  inTransitQty?: number;
  /** 净需求缺口 = max(0, 需求 − 库存 − 在途)；不传时由前三者推算 */
  netQty?: number;
  unit?: string;
}

interface MaterialDemandSummaryProps {
  items: MaterialDemandItem[];
  /** compact：单条物料的横排速览条（嵌入表单/表格行）；默认整卡组 */
  compact?: boolean;
  /** 默认是否展开（整卡组模式） */
  defaultActive?: boolean;
}

const fmt = (v: number | undefined): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};

const computeNet = (item: MaterialDemandItem): number => {
  if (item.netQty != null) return Math.max(0, Number(item.netQty) || 0);
  const stock = item.stockQty != null ? Number(item.stockQty) : 0;
  const transit = item.inTransitQty != null ? Number(item.inTransitQty) : 0;
  return Math.max(0, (Number(item.requiredQty) || 0) - stock - transit);
};

const cardStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid var(--color-border-light)',
  background: 'var(--color-bg-base)',
  borderRadius: 8,
};

/** 单物料速览行（compact 模式 / 卡片内部行） */
const DemandStrip: React.FC<{ item: MaterialDemandItem }> = ({ item }) => {
  const net = computeNet(item);
  const covered = net <= 0;
  const stockKnown = item.stockQty != null;
  return (
    <div className="u-d-flex u-fwrap-wrap u-gap-12 u-ai-center u-fs-14" style={{ lineHeight: '20px' }}>
      <span>{item.categoryLabel ? `${item.categoryLabel} · ` : ''}{item.label}</span>
      <span>需求 <b style={{ color: 'var(--color-text-primary)' }}>{fmt(item.requiredQty)}</b> {item.unit || ''}</span>
      {stockKnown && (
        <span style={{ color: (Number(item.stockQty) || 0) >= (Number(item.requiredQty) || 0) ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
          库存 {fmt(item.stockQty)}
        </span>
      )}
      {item.inTransitQty != null && Number(item.inTransitQty) > 0 && (
        <span style={{ color: 'var(--color-info)' }}>在途 {fmt(item.inTransitQty)}</span>
      )}
      <Tag color={covered ? 'success' : 'error'} style={{ marginRight: 0 }}>
        {covered ? '库存+在途已覆盖' : `还差 ${fmt(net)} ${item.unit || ''}`}
      </Tag>
    </div>
  );
};

const MaterialDemandSummary: React.FC<MaterialDemandSummaryProps> = ({ items, compact = false, defaultActive = false }) => {
  const list = (items || []).filter((i) => i && (Number(i.requiredQty) || 0) > 0 || computeNet(i) > 0);
  if (list.length === 0) return null;

  if (compact) {
    return (
      <div style={{ ...cardStyle, padding: '6px 10px', background: 'var(--color-slate-50)' }}>
        <DemandStrip item={list[0]} />
      </div>
    );
  }

  const stockOkCount = list.filter((i) => i.stockQty != null && (Number(i.stockQty) || 0) >= (Number(i.requiredQty) || 0)).length;
  const transitCount = list.filter((i) => computeNet(i) > 0 && i.stockQty != null && (Number(i.stockQty) || 0) < (Number(i.requiredQty) || 0) && (Number(i.inTransitQty) || 0) > 0).length;
  const toBuyCount = list.filter((i) => computeNet(i) > 0 && (Number(i.inTransitQty) || 0) <= 0).length;
  const netTotal = list.reduce((s, i) => s + computeNet(i), 0);

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-bg-base)', padding: '10px 14px', marginBottom: 12 }}>
      <div className="u-d-flex u-jc-between u-gap-8 u-fwrap-wrap u-ai-center">
        <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>物料需求一览</div>
        <div className="u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>
          共 {list.length} 种 · 库存已够 {stockOkCount} · 在途补 {transitCount} · 还需采购 {toBuyCount}
        </div>
      </div>
      <Collapse
        ghost
        defaultActiveKey={defaultActive ? ['items'] : []}
        items={[{
          key: 'items',
          label: <span className="u-fs-14" style={{ color: 'var(--color-text-secondary)' }}>逐物料明细</span>,
          children: (
            <div className="u-d-grid u-gap-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {list.map((item) => {
                const net = computeNet(item);
                return (
                  <div key={item.key} style={cardStyle}>
                    <div className="u-d-flex u-jc-between u-gap-8 u-ai-center u-mb-4">
                      <div className="u-fs-14 u-fw-500" style={{ color: 'var(--color-text-primary)' }}>
                        {item.categoryLabel ? `${item.categoryLabel} · ` : ''}{item.label}
                      </div>
                      <Tag color={net <= 0 ? 'success' : 'error'} style={{ marginRight: 0 }}>
                        {net <= 0 ? '已覆盖' : '缺料'}
                      </Tag>
                    </div>
                    <div className="u-fs-14" style={{ color: 'var(--color-text-secondary)', lineHeight: '22px' }}>
                      <div>需求：{fmt(item.requiredQty)} {item.unit || ''}（含损耗）</div>
                      {item.stockQty != null && <div>可用库存：{fmt(item.stockQty)} {item.unit || ''}</div>}
                      {item.inTransitQty != null && <div>在途采购：{fmt(item.inTransitQty)} {item.unit || ''}</div>}
                      <div style={{ color: net > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
                        {net > 0 ? `建议采购：${fmt(net)} ${item.unit || ''}` : '库存与在途已覆盖需求'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        }]}
      />
      <div className="u-fs-14" style={{ color: netTotal > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
        {netTotal > 0 ? `全单缺口合计约 ${fmt(netTotal)}（按各物料单位分别计）` : '当前所有物料库存与在途已覆盖需求，无需再采'}
      </div>
    </div>
  );
};

export default MaterialDemandSummary;
