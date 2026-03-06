import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Spin, Tag } from 'antd';
import { BulbOutlined, CalendarOutlined, NodeIndexOutlined, RadarChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { StyleIntelligenceProfileResponse, StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';

interface Props {
  style: StyleInfo | null;
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

const costPressureLabel = (value?: string | null) => {
  if (value === 'PROCESS') return '工序成本';
  if (value === 'MATERIAL') return '物料成本';
  if (value === 'OTHER') return '其他成本';
  return '成本';
};

const riskTone = (level: 'high' | 'medium' | 'low') => {
  if (level === 'high') {
    return {
      border: '1px solid rgba(255,77,79,0.22)',
      background: 'rgba(255,77,79,0.06)',
      tagBg: '#fff1f0',
      tagColor: '#cf1322',
    };
  }
  if (level === 'medium') {
    return {
      border: '1px solid rgba(250,140,22,0.22)',
      background: 'rgba(250,140,22,0.06)',
      tagBg: '#fff7e6',
      tagColor: '#d46b08',
    };
  }
  return {
    border: '1px solid rgba(82,196,26,0.22)',
    background: 'rgba(82,196,26,0.06)',
    tagBg: '#f6ffed',
    tagColor: '#389e0d',
  };
};

const getDeliveryMeta = (deliveryDate?: string, warningDays = 3) => {
  if (!deliveryDate) {
    return { label: '待补交期', color: 'default' as const, detail: '当前还没有设置交板日期' };
  }
  const diffDays = dayjs(deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diffDays < 0) {
    return { label: '已延期', color: 'error' as const, detail: `已超期 ${Math.abs(diffDays)} 天` };
  }
  if (diffDays <= warningDays) {
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

const StyleIntelligenceProfileCard: React.FC<Props> = ({ style }) => {
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

  const deliveryMeta = useMemo(
    () => getDeliveryMeta(profile?.deliveryDate || style?.deliveryDate, profile?.tenantProfile?.deliveryWarningDays ?? 3),
    [profile?.deliveryDate, profile?.tenantProfile?.deliveryWarningDays, style?.deliveryDate],
  );
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

  const diagnosticCards = useMemo(() => {
    const production = profile?.production;
    const scan = profile?.scan;
    const finance = profile?.finance;
    const cards: Array<{
      key: string;
      title: string;
      level: 'high' | 'medium' | 'low';
      issue: string;
      cause: string;
    }> = [];

    cards.push({
      key: 'production',
      title: '拖期订单',
      level: production?.topRiskOrderNo ? (production?.delayedOrderCount ? 'high' : 'medium') : 'low',
      issue: production?.topRiskOrderNo
        ? `订单 ${production.topRiskOrderNo} 是当前最容易拖慢这款的生产单。`
        : production?.latestOrderNo
          ? '当前还没有出现明确的拖期订单。'
          : '当前还没有形成生产订单。',
      cause: production?.topRiskOrderNo
        ? (production.topRiskReason || '这张订单的进度、状态或交期窗口已经出现风险信号。')
        : production?.latestOrderNo
          ? `${production?.topRiskFactoryName ? `当前主要风险工厂是 ${production.topRiskFactoryName}。` : ''}${production?.topRiskFactoryReason || `最近订单 ${production.latestOrderNo} 状态 ${production.latestOrderStatus || '未知'}，平均生产进度 ${production?.avgProductionProgress ?? 0}%。`}`
          : '没有订单，就暂时无法判断哪一张生产单在拖慢这款。',
    });

    cards.push({
      key: 'scan',
      title: '异常工序',
      level: (scan?.failedRecords ?? 0) >= (profile?.tenantProfile?.anomalyWarningCount ?? 5) ? 'high' : (scan?.failedRecords ?? 0) > 0 ? 'medium' : 'low',
      issue: scan?.topAnomalyProcessName
        ? `${scan.topAnomalyStage ? `${scan.topAnomalyStage} / ` : ''}${scan.topAnomalyProcessName} 是当前最异常的工序。`
        : scan?.latestProgressStage
          ? '当前还没有识别到集中异常工序。'
          : '当前还没有扫码轨迹。',
      cause: scan?.topAnomalyProcessName
        ? `该工序累计出现 ${scan.topAnomalyCount ?? 0} 条异常记录，${(scan.topAnomalyCount ?? 0) >= (profile?.tenantProfile?.anomalyWarningCount ?? 5) ? '已经达到该租户的异常预警线。' : '异常已开始重复出现。'}`
        : scan?.latestProgressStage
          ? `最近扫码停留在 ${scan.latestProgressStage}${scan.latestProcessName ? ` / ${scan.latestProcessName}` : ''}，但还未形成异常聚集。`
          : '没有扫码数据，就暂时无法判断哪道工序最容易出错。',
    });

    const grossMargin = Number(finance?.estimatedGrossMargin ?? 0);
    const quotationGap = Math.abs(Number(finance?.quotationGap ?? 0));
    cards.push({
      key: 'finance',
      title: '利润压力',
      level: grossMargin < 0 ? 'high' : grossMargin < Number(profile?.tenantProfile?.lowMarginThreshold ?? 5) || quotationGap >= 1 ? 'medium' : 'low',
      issue: grossMargin < Number(profile?.tenantProfile?.lowMarginThreshold ?? 5)
        ? `当前预计毛利率只有 ${fmtPercent(finance?.estimatedGrossMargin)}。`
        : quotationGap >= 1
          ? `当前报价和 AI 建议已经偏离 ${fmtMoney(finance?.quotationGap)}。`
          : '当前没有明显的利润压力。',
      cause: finance?.costPressureSource
        ? `${costPressureLabel(finance.costPressureSource)}占压最明显，当前测算规模约 ${fmtMoney(finance.costPressureAmount)}，${grossMargin < Number(profile?.tenantProfile?.lowMarginThreshold ?? 5) ? `已经低于该租户的利润安全线 ${fmtPercent(profile?.tenantProfile?.lowMarginThreshold)}。` : '是当前最主要的利润挤压来源。'}`
        : '当前报价、成本和加工价之间没有看到明显的单点挤压。',
    });

    const goal = profile?.tenantProfile?.primaryGoal;
    const priorityMap: Record<string, number> = goal === 'PROFIT'
      ? { finance: 0, production: 1, scan: 2 }
      : goal === 'CASHFLOW'
        ? { finance: 0, scan: 1, production: 2 }
        : { production: 0, scan: 1, finance: 2 };

    return cards.sort((a, b) => (priorityMap[a.key] ?? 99) - (priorityMap[b.key] ?? 99));
  }, [profile?.finance, profile?.production, profile?.scan, profile?.tenantProfile?.anomalyWarningCount, profile?.tenantProfile?.lowMarginThreshold, profile?.tenantProfile?.primaryGoal]);

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
        ) : diagnosticCards.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {diagnosticCards.map((item) => {
                const tone = riskTone(item.level);
                return (
                  <div
                    key={item.key}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      ...tone,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#262626' }}>{item.title}</div>
                      <span style={{ padding: '2px 8px', borderRadius: 999, background: tone.tagBg, color: tone.tagColor, fontSize: 12, fontWeight: 600 }}>
                        {item.level === 'high' ? '高风险' : item.level === 'medium' ? '需关注' : '已识别'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2 }}>报了什么问题</div>
                        <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.7 }}>{item.issue}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2 }}>是什么导致的</div>
                        <div style={{ fontSize: 13, color: '#434343', lineHeight: 1.7 }}>{item.cause}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : insights.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {insights.slice(0, 3).map((item) => (
              <div key={item} style={{ fontSize: 13, color: '#434343', lineHeight: 1.7 }}>• {item}</div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#595959' }}>当前款式信息较完整，建议继续保持按节点推进，并在形成订单后接入生产和财务成本回流。</div>
        )}
      </div>
    </Card>
  );
};

export default StyleIntelligenceProfileCard;
