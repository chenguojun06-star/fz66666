import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Spin, Tag } from 'antd';
import { BulbOutlined, CalendarOutlined, NodeIndexOutlined, RadarChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { StyleIntelligenceProfileResponse, StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';

interface Props {
  style: StyleInfo | null;
  onJumpTab: (tabKey: string) => void;
}

const STAGE_MAP = [
  { key: 'bom', label: 'BOM', done: (style: StyleInfo) => Boolean((style as any)?.bomCompletedTime) },
  { key: 'pattern', label: '纸样', done: (style: StyleInfo) => String(style.patternStatus || '').trim().toUpperCase() === 'COMPLETED' },
  { key: 'size', label: '尺寸', done: (style: StyleInfo) => Boolean((style as any)?.sizeCompletedTime) },
  { key: 'production', label: '制单', done: (style: StyleInfo) => Boolean((style as any)?.productionCompletedTime) },
  { key: 'secondary', label: '二次工艺', done: (style: StyleInfo) => Boolean((style as any)?.secondaryCompletedTime) },
  { key: 'process', label: '工序单价', done: (style: StyleInfo) => Boolean((style as any)?.processCompletedTime) },
  { key: 'sizePrice', label: '码数单价', done: (style: StyleInfo) => Boolean((style as any)?.sizePriceCompletedTime) },
] as const;

const fmtMoney = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `¥${Number(value).toFixed(2)}`;
};

const fmtPercent = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
};

const getDeliveryMeta = (deliveryDate?: string) => {
  if (!deliveryDate) {
    return { label: '待补交期', color: 'default' as const, detail: '当前还没有设置交板日期' };
  }
  const diffDays = dayjs(deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diffDays < 0) {
    return { label: '已延期', color: 'error' as const, detail: `已超期 ${Math.abs(diffDays)} 天` };
  }
  if (diffDays <= 3) {
    return { label: '即将超期', color: 'warning' as const, detail: `${diffDays} 天内到期` };
  }
  return { label: '交期正常', color: 'success' as const, detail: `距交期还有 ${diffDays} 天` };
};

const getProgressMeta = (style: StyleInfo) => {
  const doneCount = STAGE_MAP.filter((item) => item.done(style)).length;
  const percent = Math.round((doneCount / STAGE_MAP.length) * 100);
  if (doneCount === STAGE_MAP.length) {
    return { label: '开发完成', color: 'success' as const, percent };
  }
  if (doneCount >= 4) {
    return { label: '推进中', color: 'processing' as const, percent };
  }
  return { label: '待推进', color: 'warning' as const, percent };
};

const buildFallbackInsights = (style: StyleInfo, quote: StyleQuoteSuggestionResponse | null) => {
  const insights: string[] = [];
  const deliveryMeta = getDeliveryMeta(style.deliveryDate);
  const orderCount = Number(style.orderCount || 0);
  const latestProgress = Number(style.latestProductionProgress || 0);

  if (deliveryMeta.label === '已延期') {
    insights.push(`交期已失守，建议优先检查纸样、工序单价和生产制单三个关键环节。`);
  } else if (deliveryMeta.label === '即将超期') {
    insights.push(`已进入临界交期窗口，建议今天内锁定未完成的开发节点。`);
  }

  if (!(style as any)?.processCompletedTime) {
    insights.push('工序单价尚未锁定，后续大货结算与报价准确性会受影响。');
  }

  if (orderCount > 0 && latestProgress > 0 && latestProgress < 50) {
    insights.push(`已有 ${orderCount} 个关联订单，但最近大货进度仅 ${latestProgress}%，需提前关注产线节奏。`);
  } else if (orderCount === 0) {
    insights.push('当前还未形成生产订单，建议先把开发资料和价格体系固化，减少后续反复。');
  }

  if (quote?.suggestedPrice != null && quote?.currentQuotation != null) {
    const diff = Number(quote.suggestedPrice) - Number(quote.currentQuotation);
    if (Math.abs(diff) >= 1) {
      insights.push(diff > 0 ? 'AI 判断当前报价偏低，建议复核利润空间和二次工艺损耗。' : 'AI 判断当前报价偏高，可结合历史样本复核市场接受度。');
    }
  }

  return insights.slice(0, 4);
};

const StyleIntelligenceProfileCard: React.FC<Props> = ({ style, onJumpTab }) => {
  const [loading, setLoading] = useState(false);
  const [quoteSuggestion, setQuoteSuggestion] = useState<StyleQuoteSuggestionResponse | null>(null);
  const [profile, setProfile] = useState<StyleIntelligenceProfileResponse | null>(null);

  const styleNo = String(style?.styleNo || '').trim();
  const styleId = style?.id;

  const loadProfile = useCallback(async () => {
    if (!styleNo && !styleId) {
      setProfile(null);
      setQuoteSuggestion(null);
      return;
    }
    setLoading(true);
    try {
      const [profileRes, quoteRes] = await Promise.all([
        intelligenceApi.getStyleIntelligenceProfile({ styleId, styleNo }),
        styleNo ? intelligenceApi.getStyleQuoteSuggestion(styleNo) : Promise.resolve(null as any),
      ]);
      setProfile((profileRes as any)?.data || null);
      setQuoteSuggestion((quoteRes as any)?.data || null);
    } catch {
      setProfile(null);
      setQuoteSuggestion(null);
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const deliveryMeta = useMemo(() => getDeliveryMeta(profile?.deliveryDate || style?.deliveryDate), [profile?.deliveryDate, style?.deliveryDate]);
  const progressMeta = useMemo(() => getProgressMeta(style || { styleNo: '', styleName: '', category: '', price: 0, cycle: 0 }), [style]);
  const insights = useMemo(
    () => (profile?.insights?.length ? profile.insights : buildFallbackInsights(style || { styleNo: '', styleName: '', category: '', price: 0, cycle: 0 }, quoteSuggestion)),
    [profile?.insights, style, quoteSuggestion],
  );

  const stageTags = useMemo(() => {
    if (profile?.stages?.length) {
      return profile.stages.map((item) => ({
        key: item.key,
        label: item.label,
        done: item.status === 'COMPLETED',
      }));
    }
    return STAGE_MAP.map((item) => ({ key: item.key, label: item.label, done: item.done(style || { styleNo: '', styleName: '', category: '', price: 0, cycle: 0 }) }));
  }, [profile?.stages, style]);

  const analysisBlocks = useMemo(() => {
    const production = profile?.production;
    const scan = profile?.scan;
    const stock = profile?.stock;
    const finance = profile?.finance;
    return [
      {
        key: 'production',
        title: '生产联动',
        lines: [
          `关联订单 ${production?.orderCount ?? 0} 单，进行中 ${production?.activeOrderCount ?? 0} 单，延期 ${production?.delayedOrderCount ?? 0} 单。`,
          `平均生产进度 ${production?.avgProductionProgress ?? 0}%，累计完成 ${production?.totalCompletedQuantity ?? 0} 件。`,
          production?.latestOrderNo ? `最近订单 ${production.latestOrderNo}，状态 ${production.latestOrderStatus || '未知'}。` : '当前还没有形成生产订单。',
        ],
      },
      {
        key: 'scan',
        title: '扫码追踪',
        lines: [
          `成功扫码 ${scan?.successRecords ?? 0} 条，共 ${scan?.successQuantity ?? 0} 件；异常 ${scan?.failedRecords ?? 0} 条。`,
          `已结算 ${scan?.settledRecordCount ?? 0} 条，未结算 ${scan?.unsettledRecordCount ?? 0} 条。`,
          scan?.latestProgressStage ? `最近扫码停留在 ${scan.latestProgressStage}${scan.latestProcessName ? ` / ${scan.latestProcessName}` : ''}。` : '当前还没有扫码轨迹。',
        ],
      },
      {
        key: 'stock',
        title: '样衣库存',
        lines: [
          `总库存 ${stock?.totalQuantity ?? 0} 件，可用 ${stock?.availableQuantity ?? 0} 件，借出 ${stock?.loanedQuantity ?? 0} 件。`,
          `开发样 ${stock?.developmentQuantity ?? 0} 件，产前样 ${stock?.preProductionQuantity ?? 0} 件，出货样 ${stock?.shipmentQuantity ?? 0} 件。`,
        ],
      },
      {
        key: 'finance',
        title: '财务预估',
        lines: [
          `当前报价 ${fmtMoney(finance?.currentQuotation)}，AI 建议报价 ${fmtMoney(finance?.suggestedQuotation)}。`,
          `预计营收 ${fmtMoney(finance?.estimatedRevenue)}，加工成本 ${fmtMoney(finance?.estimatedProcessingCost)}，预计毛利 ${fmtMoney(finance?.estimatedGrossProfit)}。`,
          `预计毛利率 ${fmtPercent(finance?.estimatedGrossMargin)}，历史样本 ${finance?.historicalOrderCount ?? 0} 单。`,
        ],
      },
    ];
  }, [profile?.finance, profile?.production, profile?.scan, profile?.stock]);

  if (!style?.id) return null;

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: '1px solid rgba(24,144,255,0.15)',
        background: 'linear-gradient(135deg, #f7fbff 0%, #ffffff 42%, #f6ffed 100%)',
      }}
      bodyStyle={{ padding: 18 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1f1f1f', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <RadarChartOutlined /> 款式智能档案卡
            </span>
            <Tag color="blue">{style.styleNo || '未编号'}</Tag>
            <Tag color={deliveryMeta.color}>{deliveryMeta.label}</Tag>
            <Tag color={profile?.developmentStatus === 'COMPLETED' ? 'success' : profile?.developmentStatus === 'IN_PROGRESS' ? 'processing' : progressMeta.color}>
              {profile?.developmentStatus === 'COMPLETED' ? '开发完成' : profile?.developmentStatus === 'IN_PROGRESS' ? '推进中' : progressMeta.label}
            </Tag>
          </div>
          <div style={{ color: '#595959', fontSize: 13, lineHeight: 1.8 }}>
            <div>款式名称：{style.styleName || '—'}</div>
            <div>当前节点：{profile?.progressNode || style.progressNode || '未启动'} · {deliveryMeta.detail}</div>
            <div>最新订单：{profile?.production?.latestOrderNo || style.latestOrderNo || '暂无'} · 生产进度 {profile?.production?.latestProductionProgress != null ? `${profile.production.latestProductionProgress}%` : style.latestProductionProgress != null ? `${style.latestProductionProgress}%` : '—'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => onJumpTab('7')}>去工序单价</Button>
          <Button onClick={() => onJumpTab('8')}>去生产制单</Button>
          <Button type="primary" onClick={() => onJumpTab('11')}>看工序智能库</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        {[
          {
            key: 'delivery',
            icon: <CalendarOutlined />,
            title: '交期风险',
            value: deliveryMeta.label,
            extra: deliveryMeta.detail,
            color: deliveryMeta.color === 'error' ? '#ff4d4f' : deliveryMeta.color === 'warning' ? '#fa8c16' : '#52c41a',
          },
          {
            key: 'progress',
            icon: <NodeIndexOutlined />,
            title: '开发完成度',
            value: `${profile?.developmentCompletionRate ?? progressMeta.percent}%`,
            extra: `${stageTags.filter((item) => item.done).length}/${stageTags.length} 个关键节点已完成`,
            color: '#1677ff',
          },
          {
            key: 'quote',
            icon: <BulbOutlined />,
            title: 'AI建议报价',
            value: loading ? '计算中' : fmtMoney(profile?.finance?.suggestedQuotation ?? quoteSuggestion?.suggestedPrice),
            extra: `当前报价 ${fmtMoney(profile?.finance?.currentQuotation ?? quoteSuggestion?.currentQuotation)} / 历史样本 ${(profile?.finance?.historicalOrderCount ?? quoteSuggestion?.historicalOrderCount) || 0} 单`,
            color: '#d48806',
          },
          {
            key: 'orders',
            icon: <RadarChartOutlined />,
            title: '系统联动',
            value: `${profile?.production?.orderCount ?? Number(style.orderCount || 0)} 单`,
            extra: profile?.production?.latestOrderStatus ? `最近订单状态 ${profile.production.latestOrderStatus}` : style.latestOrderStatus ? `最近订单状态 ${style.latestOrderStatus}` : '当前还没有关联订单',
            color: '#722ed1',
          },
        ].map((item) => (
          <div
            key={item.key}
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.06)',
              minHeight: 108,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: item.color, fontSize: 12, marginBottom: 8 }}>
              {item.icon}
              <span>{item.title}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1f1f1f', marginBottom: 6 }}>{item.value}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.6 }}>{item.extra}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {stageTags.map((item) => (
          <Tag key={item.key} color={item.done ? 'success' : 'default'}>
            {item.label}{item.done ? ' 已完成' : ' 待处理'}
          </Tag>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(24,144,255,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#1f1f1f' }}>AI全链路判断</div>
        {loading ? (
          <div style={{ padding: '4px 0' }}><Spin size="small" /></div>
        ) : insights.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              {insights.map((item) => (
                <div key={item} style={{ fontSize: 13, color: '#434343', lineHeight: 1.7 }}>• {item}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {analysisBlocks.map((block) => (
                <div
                  key={block.key}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.72)',
                    border: '1px solid rgba(24,144,255,0.08)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 6 }}>{block.title}</div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {block.lines.map((line) => (
                      <div key={line} style={{ fontSize: 12, color: '#595959', lineHeight: 1.7 }}>{line}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#595959' }}>当前款式信息较完整，建议继续保持按节点推进，并在形成订单后接入生产和财务成本回流。</div>
        )}
      </div>
    </Card>
  );
};

export default StyleIntelligenceProfileCard;
