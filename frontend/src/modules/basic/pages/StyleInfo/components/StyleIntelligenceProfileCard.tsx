import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Progress, Spin, Tag, Tooltip } from 'antd';
import { BulbOutlined, CalendarOutlined, ExperimentOutlined, NodeIndexOutlined, RadarChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { DifficultyAssessment, StyleIntelligenceProfileResponse, StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';

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

const difficultyColor = (level?: string) => {
  if (level === 'SIMPLE') return 'green';
  if (level === 'MEDIUM') return 'blue';
  if (level === 'COMPLEX') return 'orange';
  if (level === 'HIGH_END') return 'red';
  return 'default';
};

const StyleIntelligenceProfileCard: React.FC<Props> = ({ style }) => {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [quoteSuggestion, setQuoteSuggestion] = useState<StyleQuoteSuggestionResponse | null>(null);
  const [profile, setProfile] = useState<StyleIntelligenceProfileResponse | null>(null);
  const [difficultyLoading, setDifficultyLoading] = useState(false);
  const [localDifficulty, setLocalDifficulty] = useState<DifficultyAssessment | null>(null);

  const styleNo = String(style?.styleNo || '').trim();
  const styleId = style?.id;

  const loadProfile = useCallback(async () => {
    if (!styleNo && !styleId) {
      setProfile(null);
      setQuoteSuggestion(null);
      return;
    }
    setLoading(true);
    setLocalDifficulty(null);
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

  const handleAiImageAnalysis = useCallback(async () => {
    if (!styleId) return;
    setDifficultyLoading(true);
    try {
      const res = await intelligenceApi.analyzeStyleDifficulty({
        styleId,
        coverUrl: style?.cover || undefined,
      });
      const data = (res as any)?.data || null;
      if (data) setLocalDifficulty(data);
    } catch {
      // 失败时保展原结构化结果
    } finally {
      setDifficultyLoading(false);
    }
  }, [styleId, style?.cover]);

  const activeDifficulty = localDifficulty ?? profile?.difficulty;

  const stageColors: Record<string, string> = {
    COMPLETED: 'success',
    IN_PROGRESS: 'processing',
    PENDING: 'default',
  };

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

  const doneCount = stageTags.filter((item) => item.done).length;
  const completionRate = profile?.developmentCompletionRate ?? progressMeta.percent;
  const orderCount = profile?.production?.orderCount ?? Number(style.orderCount || 0);

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: '1px solid rgba(24,144,255,0.15)',
        background: '#f7fbff',
      }}
      styles={{ body: { padding: 0 } }}
    >
      {/* ── 标题栏（常驻，点击折叠/展开） ── */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          flexWrap: 'wrap',
        }}
      >
        <RadarChartOutlined style={{ color: '#1677ff', fontSize: 15 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1f1f1f' }}>款式智能档案卡</span>
        {/* 关键摘要 */}
        <Tag color={deliveryMeta.color} style={{ margin: 0 }}>{deliveryMeta.label}</Tag>
        <span style={{ fontSize: 13, color: '#595959' }}>完成度 <b style={{ color: '#1677ff' }}>{completionRate}%</b></span>
        <span style={{ fontSize: 13, color: '#595959' }}>订单 <b style={{ color: '#722ed1' }}>{orderCount} 单</b></span>
        {/* 难度徽章 */}
        {activeDifficulty && (
          <Tooltip title={`难度分 ${activeDifficulty.difficultyScore}/10，定价倍率 ×${activeDifficulty.pricingMultiplier}`}>
            <Tag
              color={difficultyColor(activeDifficulty.difficultyLevel)}
              icon={<ExperimentOutlined />}
              style={{ margin: 0 }}
            >
              {activeDifficulty.difficultyLabel}
            </Tag>
          </Tooltip>
        )}
        {loading && <span style={{ fontSize: 12, color: '#8c8c8c' }}>分析中…</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>
          {expanded ? '收起 ▲' : '展开详情 ▼'}
        </span>
      </div>

      {/* ── 展开区域（紧凑左右两栏布局）── */}
      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {/* 基本信息行 */}
          <div style={{ color: '#8c8c8c', fontSize: 11, lineHeight: 1.6, marginBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 5 }}>
            <span>节点：{profile?.progressNode || style.progressNode || '未启动'} · {deliveryMeta.detail}</span>
            {' · '}
            <span>最新订单：{profile?.production?.latestOrderNo || style.latestOrderNo || '暂无'} · 进度 {profile?.production?.latestProductionProgress != null ? `${profile.production.latestProductionProgress}%` : style.latestProductionProgress != null ? `${style.latestProductionProgress}%` : '—'}</span>
          </div>

          {/* 左右两栏主体 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

            {/* 左栏：4指标 + 节点标签 + 难度 */}
            <div style={{ flex: '0 0 42%', minWidth: 0 }}>
              {/* 4个指标 — 紧凑 2x2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
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
                    value: `${completionRate}%`,
                    extra: `${doneCount}/${stageTags.length} 节点完成`,
                    color: '#1677ff',
                  },
                  {
                    key: 'quote',
                    icon: <BulbOutlined />,
                    title: 'AI建议报价',
                    value: loading ? '…' : fmtMoney(profile?.finance?.suggestedQuotation ?? quoteSuggestion?.suggestedPrice),
                    extra: activeDifficulty?.adjustedSuggestedPrice
                      ? `难度调整: ${fmtMoney(activeDifficulty.adjustedSuggestedPrice)}`
                      : `历史 ${(profile?.finance?.historicalOrderCount ?? quoteSuggestion?.historicalOrderCount) || 0} 单`,
                    color: '#d48806',
                  },
                  {
                    key: 'orders',
                    icon: <RadarChartOutlined />,
                    title: '系统联动',
                    value: `${orderCount} 单`,
                    extra: profile?.production?.latestOrderStatus || style.latestOrderStatus || '暂无订单',
                    color: '#722ed1',
                  },
                ].map((item) => (
                  <div key={item.key} style={{ padding: '5px 7px', borderRadius: 6, background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
                      <span style={{ color: item.color, fontSize: 11 }}>{item.icon}</span>
                      <span style={{ fontSize: 11, color: '#8c8c8c' }}>{item.title}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color, lineHeight: 1.3 }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 1, lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.extra}</div>
                  </div>
                ))}
              </div>

              {/* 节点标签 */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                {stageTags.map((item) => (
                  <Tag key={item.key} color={item.done ? 'success' : 'default'} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>
                    {item.label}{item.done ? ' ✓' : ''}
                  </Tag>
                ))}
              </div>

              {/* 难度评估 — 紧凑版 */}
              {activeDifficulty ? (
                <div style={{ padding: '5px 7px', borderRadius: 6, background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ExperimentOutlined style={{ color: '#722ed1', fontSize: 11 }} />
                      <span style={{ fontSize: 11, color: '#595959' }}>难度评估</span>
                      <Tag color={difficultyColor(activeDifficulty.difficultyLevel)} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>{activeDifficulty.difficultyLabel}</Tag>
                      {activeDifficulty.assessmentSource === 'AI_ENHANCED' && <Tag color="purple" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>AI增强</Tag>}
                    </div>
                    <Button size="small" icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={handleAiImageAnalysis} disabled={!style?.cover} style={{ fontSize: 11, height: 20, padding: '0 5px' }}>图像分析</Button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Progress percent={activeDifficulty.difficultyScore * 10} showInfo={false}
                      strokeColor={difficultyColor(activeDifficulty.difficultyLevel) === 'green' ? '#52c41a' : difficultyColor(activeDifficulty.difficultyLevel) === 'orange' ? '#fa8c16' : '#ff4d4f'}
                      style={{ flex: 1, margin: 0 }} size="small" />
                    <span style={{ fontSize: 11, color: '#595959', whiteSpace: 'nowrap' }}><b>{activeDifficulty.difficultyScore}</b>/10 ×<b style={{ color: '#722ed1' }}>{activeDifficulty.pricingMultiplier}</b></span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>BOM {activeDifficulty.bomCount}种 · 工序 {activeDifficulty.processCount}道{activeDifficulty.hasSecondaryProcess ? ' · 含二次工艺' : ''}</div>
                  {activeDifficulty.visionRaw && (
                    <div style={{ fontSize: 11, color: '#262626', marginTop: 3, lineHeight: 1.6, background: 'rgba(114,46,209,0.07)', borderRadius: 4, padding: '4px 6px' }}>
                      <span style={{ fontWeight: 600, color: '#722ed1', marginRight: 3 }}>🔬 Doubao工艺识别：</span>{activeDifficulty.visionRaw}
                    </div>
                  )}
                  {activeDifficulty.imageInsight && (
                    <div style={{ fontSize: 11, color: '#595959', marginTop: 3, lineHeight: 1.5, background: 'rgba(114,46,209,0.03)', borderRadius: 4, padding: '3px 5px' }}>💬 {activeDifficulty.imageInsight}</div>
                  )}
                </div>
              ) : (
                <Button size="small" icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={handleAiImageAnalysis} disabled={!style?.cover} style={{ fontSize: 11 }}>AI 难度分析</Button>
              )}
            </div>

            {/* 右栏：AI全链路判断 */}
            <div style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 7, background: 'rgba(24,144,255,0.05)', border: '1px solid rgba(24,144,255,0.1)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 5, color: '#1677ff' }}>AI全链路判断</div>
              {loading ? (
                <Spin size="small" />
              ) : diagnosticCards.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {diagnosticCards.map((item) => {
                    const tone = riskTone(item.level);
                    return (
                      <div key={item.key} style={{ padding: '5px 7px', borderRadius: 6, ...tone }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#262626' }}>{item.title}</span>
                          <span style={{ padding: '0 5px', borderRadius: 999, background: tone.tagBg, color: tone.tagColor, fontSize: 11, fontWeight: 600 }}>
                            {item.level === 'high' ? '高风险' : item.level === 'medium' ? '需关注' : '已识别'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#262626', lineHeight: 1.5 }}>{item.issue}</div>
                        <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: 1.4, marginTop: 2 }}>{item.cause}</div>
                      </div>
                    );
                  })}
                </div>
              ) : insights.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {insights.slice(0, 3).map((item) => (
                    <div key={item} style={{ fontSize: 12, color: '#434343', lineHeight: 1.6 }}>• {item}</div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#595959' }}>当前款式信息较完整，建议继续按节点推进。</div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default StyleIntelligenceProfileCard;
