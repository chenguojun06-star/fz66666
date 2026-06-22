import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Progress, Spin, Tag, Tooltip } from 'antd';
import { BulbOutlined, CalendarOutlined, ExperimentOutlined, NodeIndexOutlined, RadarChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import { isStyleInfoCompleted } from '../../StyleInfoList/components/styleTableViewUtils';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { DifficultyAssessment, StyleIntelligenceProfileResponse, StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';
import { visualAnalyze } from '@/services/intelligence/intelligenceApi';
import { formatMoney } from '@/utils/format';
import type { VisualAIResponse } from '@/services/intelligence/intelligenceApi';

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
  { key: 'sample', label: '样衣生产', done: (style: StyleInfo) => Boolean((style as any)?.sampleCompletedTime) || String((style as any)?.sampleStatus || '').trim().toUpperCase() === 'COMPLETED' },
] as const;

const fmtMoney = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return formatMoney(value);
};

const fmtPercent = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
};

const getDeliveryMeta = (style: StyleInfo | null | undefined, warningDays = 3) => {
  // 完成态款式不再显示任何延期/交期提示
  if (style && isStyleInfoCompleted(style)) {
    return { label: '开发完成', color: 'success' as const, detail: '款式开发节点已走完，交期提示不再适用。' };
  }
  const deliveryDate = style?.deliveryDate;
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

type InsightCategory = 'delivery' | 'progress' | 'quote' | 'process';

interface StyleInsightItem {
  category: InsightCategory;
  text: string;
}

const INSIGHT_COLOR: Record<InsightCategory, string> = {
  delivery: 'var(--color-danger)',
  progress: 'var(--color-primary)',
  quote: 'var(--color-warning)',
  process: 'var(--color-accent-purple)',
};

const INSIGHT_LABEL: Record<InsightCategory, string> = {
  delivery: '交期风险',
  progress: '进度/订单',
  quote: '报价',
  process: '工序',
};

const buildFallbackInsights = (style: StyleInfo, quote: StyleQuoteSuggestionResponse | null): StyleInsightItem[] => {
  const insights: StyleInsightItem[] = [];
  const deliveryMeta = getDeliveryMeta(style);
  const orderCount = Number(style.orderCount || 0);
  const latestProgress = Number(style.latestProductionProgress || 0);

  if (deliveryMeta.label === '已延期') {
    insights.push({ category: 'delivery', text: '交期已失守，建议优先检查纸样、工序单价和生产制单三个关键环节。' });
  } else if (deliveryMeta.label === '即将超期') {
    insights.push({ category: 'delivery', text: '已进入临界交期窗口，建议今天内锁定未完成的开发节点。' });
  }

  if (!(style as any)?.processCompletedTime) {
    insights.push({ category: 'process', text: '工序单价尚未锁定，后续大货结算与报价准确性会受影响。' });
  }

  if (orderCount > 0 && latestProgress > 0 && latestProgress < 50) {
    insights.push({ category: 'progress', text: `已有 ${orderCount} 个关联订单，但最近大货进度仅 ${latestProgress}%，需提前关注产线节奏。` });
  } else if (orderCount === 0) {
    insights.push({ category: 'progress', text: '当前还未形成生产订单，建议先把开发资料和价格体系固化，减少后续反复。' });
  }

  if (quote?.suggestedPrice != null && quote?.currentQuotation != null) {
    const diff = Number(quote.suggestedPrice) - Number(quote.currentQuotation);
    if (Math.abs(diff) >= 1) {
      insights.push({
        category: 'quote',
        text: diff > 0 ? 'AI 判断当前报价偏低，建议复核利润空间和二次工艺损耗。' : 'AI 判断当前报价偏高，可结合历史样本复核市场接受度。',
      });
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

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--color-danger)',
  HIGH: '#ff7a45',
  MEDIUM: 'var(--color-warning)',
  LOW: 'var(--color-success)',
  NONE: 'var(--color-border-antd)',
};

const StyleIntelligenceProfileCard: React.FC<Props> = ({ style }) => {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [quoteSuggestion, setQuoteSuggestion] = useState<StyleQuoteSuggestionResponse | null>(null);
  const [profile, setProfile] = useState<StyleIntelligenceProfileResponse | null>(null);
  const [difficultyLoading, setDifficultyLoading] = useState(false);
  const [localDifficulty, setLocalDifficulty] = useState<DifficultyAssessment | null>(null);
  const [visualResult, setVisualResult] = useState<VisualAIResponse | null>(null);

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
      // 如果缓存中有 visionRaw，直接使用，不重复调用视觉AI
      const profileData = (profileRes as any)?.data;
      if (profileData?.difficulty?.visionRaw) {
        setVisualResult({
          taskType: 'STYLE_IDENTIFY',
          severity: 'NONE',
          confidence: 1,
          summary: profileData.difficulty.visionRaw,
          dataSource: 'ai_vision',
        } as any);
      }
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
    () => getDeliveryMeta(style, profile?.tenantProfile?.deliveryWarningDays ?? 3),
    [style, profile?.tenantProfile?.deliveryWarningDays],
  );
  const progressMeta = useMemo(() => getProgressMeta(style || { styleNo: '', styleName: '', category: '', price: 0, cycle: 0 }), [style]);

  // 默认折叠，用户点击才展开，不再自动展开

  const handleAiImageAnalysis = useCallback(async () => {
    if (!styleId) return;
    setDifficultyLoading(true);
    setVisualResult(null);
    const coverUrl = style?.cover || undefined;
    try {
      const [diffRes, visualRes] = await Promise.allSettled([
        // 后端 assessWithAiById 会自动回退到款式附件中的第一张图
        intelligenceApi.analyzeStyleDifficulty({ styleId, coverUrl }),
        // 仅当封面图存在时才调用视觉AI
        coverUrl
          ? visualAnalyze({ imageUrl: coverUrl, taskType: 'DEFECT_DETECT', styleNo: style?.styleNo || undefined })
          : Promise.reject('无封面图'),
      ]);
      if (diffRes.status === 'fulfilled') {
        const data = (diffRes.value as any)?.data || null;
        if (data) setLocalDifficulty(data);
      }
      if (visualRes.status === 'fulfilled') {
        setVisualResult(visualRes.value as VisualAIResponse);
      }
    } catch {
      // 失败时保留原结构化结果
    } finally {
      setDifficultyLoading(false);
    }
  }, [styleId, style?.cover, style?.styleNo]);

  const activeDifficulty = localDifficulty ?? profile?.difficulty;

  const workerHint = useMemo(() => {
    const items: Array<{ key: string; label: string; value: string }> = [];
    if (activeDifficulty?.difficultyLabel) {
      items.push({
        key: 'difficulty',
        label: '难度等级',
        value: `${String(activeDifficulty.difficultyLabel).trim()}${activeDifficulty.difficultyScore != null ? `（${activeDifficulty.difficultyScore}/10）` : ''}`,
      });
    }
    const fabric = String((style as any)?.fabricComposition ?? '').trim();
    if (fabric) items.push({ key: 'fabric', label: '面料成分', value: fabric });
    const desc = String(style?.description ?? '').trim();
    if (desc) {
      const needleMatch = desc.match(/([0-9一二三四五六七八九十]+\s*号?针)/);
      if (needleMatch) items.push({ key: 'needle', label: '针号建议', value: needleMatch[1] });
    }
    if (activeDifficulty?.hasSecondaryProcess || (style as any)?.secondaryProcess) {
      items.push({ key: 'secondary', label: '二次工艺', value: '本款含二次工艺，需重点关注' });
    }
    return items;
  }, [activeDifficulty, style]);

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
        onClick={() => { setExpanded((v) => !v); }}
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
        <RadarChartOutlined style={{ color: 'var(--color-primary)', fontSize: 15 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1f1f1f' }}>款式智能档案卡</span>
        {/* 关键摘要 */}
        <Tag color={deliveryMeta.color} style={{ margin: 0 }}>{deliveryMeta.label}</Tag>
        <span style={{ fontSize: 14, color: '#595959' }}>完成度 <b style={{ color: 'var(--color-primary)' }}>{completionRate}%</b></span>
        {doneCount < stageTags.length ? (
          <span style={{ fontSize: 14, color: '#595959' }}>剩 <b style={{ color: 'var(--color-danger)' }}>{stageTags.length - doneCount}</b> 环节未完成</span>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--color-success)' }}>✓ {stageTags.length} 环节已全部完成</span>
        )}
        <span style={{ fontSize: 14, color: '#595959' }}>订单 <b style={{ color: 'var(--color-accent-purple)' }}>{orderCount} 单</b></span>
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
        {loading && <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>分析中…</span>}
        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--color-text-tertiary)' }}>
          {expanded ? '收起 ▲' : '展开详情 ▼'}
        </span>
      </div>

      {/* ── 展开区域（紧凑左右两栏布局）── */}
      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {/* 基本信息行 */}
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1.6, marginBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 5 }}>
            <span>节点：{profile?.progressNode || style.progressNode || '未启动'} · {deliveryMeta.detail}</span>
            {' · '}
            <span>最新订单：{profile?.production?.latestOrderNo || style.latestOrderNo || '暂无'} · 进度 {profile?.production?.latestProductionProgress != null ? `${profile.production.latestProductionProgress}%` : style.latestProductionProgress != null ? `${style.latestProductionProgress}%` : '—'}</span>
          </div>

          {/* 左右两栏主体 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

            {/* 左栏：4指标 + 节点标签 */}
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
                    color: deliveryMeta.color === 'error' ? 'var(--color-danger)' : deliveryMeta.color === 'warning' ? 'var(--color-warning)' : 'var(--color-success)',
                  },
                  {
                    key: 'progress',
                    icon: <NodeIndexOutlined />,
                    title: '开发完成度',
                    value: `${completionRate}%`,
                    extra: `${doneCount}/${stageTags.length} 节点完成`,
                    color: 'var(--color-primary)',
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
                    color: 'var(--color-accent-purple)',
                  },
                ].map((item) => (
                  <div key={item.key} style={{ padding: '5px 7px', borderRadius: 6, background: 'var(--color-bg-base)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
                      <span style={{ color: item.color, fontSize: 12 }}>{item.icon}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{item.title}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color, lineHeight: 1.3 }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 1, lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.extra}</div>
                  </div>
                ))}
              </div>

              {/* 节点标签 */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {stageTags.map((item) => (
                  <Tag key={item.key} color={item.done ? 'success' : 'default'} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>
                    {item.label}{item.done ? ' ' : ''}
                  </Tag>
                ))}
              </div>
            </div>

            {/* 右栏：难度评估 */}
            <div style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 7, background: 'rgba(114,46,209,0.04)', border: '1px solid rgba(114,46,209,0.12)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--color-accent-purple)' }}>难度评估</div>
              {loading ? (
                <Spin />
              ) : activeDifficulty ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag color={difficultyColor(activeDifficulty.difficultyLevel)} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>{activeDifficulty.difficultyLabel}</Tag>
                      {activeDifficulty.assessmentSource === 'AI_ENHANCED' && <Tag color="purple" style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>AI增强</Tag>}
                    </div>
                    <Button icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={handleAiImageAnalysis} disabled={!styleId} style={{ fontSize: 12, height: 20, padding: '0 5px' }}>图像分析</Button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Progress percent={activeDifficulty.difficultyScore * 10} showInfo={false}
                      strokeColor={difficultyColor(activeDifficulty.difficultyLevel) === 'green' ? 'var(--color-success)' : difficultyColor(activeDifficulty.difficultyLevel) === 'orange' ? 'var(--color-warning)' : 'var(--color-danger)'}
                      style={{ flex: 1, margin: 0 }} />
                    <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}><b>{activeDifficulty.difficultyScore}</b>/10 ×<b style={{ color: 'var(--color-accent-purple)' }}>{activeDifficulty.pricingMultiplier}</b></span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>BOM {activeDifficulty.bomCount}种 · 工序 {activeDifficulty.processCount}道{activeDifficulty.hasSecondaryProcess ? ' · 含二次工艺' : ''}</div>
                  {activeDifficulty.imageInsight && (() => {
                    const insight = activeDifficulty.imageInsight as string;
                    const isError = insight.includes('未开通') || insight.includes('读取失败') || insight.includes('未配置') || insight.includes('未上传');
                    return (
                      <div style={{ fontSize: 12, color: isError ? '#8c8c8c' : '#595959', marginTop: 3, lineHeight: 1.5, background: isError ? 'rgba(0,0,0,0.02)' : 'rgba(114,46,209,0.03)', borderRadius: 4, padding: '3px 5px' }}>
                        {insight}
                      </div>
                    );
                  })()}
                  {visualResult && (
                    <div style={{ marginTop: 4, padding: '4px 6px', borderRadius: 4, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: '#00bcd4', fontWeight: 600 }}>视觉AI</span>
                        {visualResult.severity && visualResult.severity !== 'NONE' && (
                          <Tag style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }} color={SEVERITY_COLOR[visualResult.severity] ?? 'default'}>{visualResult.severity}</Tag>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>置信度 {Math.round(visualResult.confidence * 100)}%</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.5 }}>{visualResult.summary}</div>
                      {visualResult.defects && visualResult.defects.length > 0 && (
                        <div style={{ marginTop: 3 }}>
                          {visualResult.defects.slice(0, 3).map((d, i) => (
                            <div key={i} style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>• [{d.level}] {d.type} — {d.description}{d.location ? ` @ ${d.location}` : ''}</div>
                          ))}
                        </div>
                      )}
                      {visualResult.styleFeatures && Object.keys(visualResult.styleFeatures).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                          {Object.entries(visualResult.styleFeatures).slice(0, 4).map(([k, v]) => (
                            <Tag key={k} style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{k}: {v}</Tag>
                          ))}
                        </div>
                      )}
                      {visualResult.suggestion && (
                        <div style={{ fontSize: 12, color: 'var(--color-accent-purple)', marginTop: 3 }}>{visualResult.suggestion}</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Button icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={handleAiImageAnalysis} disabled={!styleId} style={{ fontSize: 12 }}>AI 难度分析</Button>
                  <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 4 }}>分析款式图片，评估制作难度与定价倍率</div>
                </div>
              )}
            </div>
          </div>

          {/* ── 工人提示预览：工人扫码时看到的内容 ── */}
          {workerHint.length > 0 && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#FFFAEB', border: '1px solid #F5C451' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#B45309', fontWeight: 700 }}>⚠ 工人提示预览</span>
                  <Tag color="gold" style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 5px' }}>工人扫码时可见</Tag>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                {workerHint.map((item) => (
                  <div key={item.key} style={{ background: '#fff7dc', borderRadius: 4, padding: '4px 8px', border: '1px solid #f5e08e' }}>
                    <span style={{ color: '#8c6d1f', marginRight: 6 }}>{item.label}：</span>
                    <span style={{ color: '#3d2d00', fontWeight: 600 }}>{item.value}</span>
                  </div>
                ))}
                {activeDifficulty?.imageInsight && String(activeDifficulty.imageInsight).trim() && !String(activeDifficulty.imageInsight).includes('未开通') && (
                  <div style={{ width: '100%', marginTop: 2, padding: '5px 8px', borderRadius: 4, background: 'rgba(180,83,9,0.06)', fontSize: 12, color: '#7c4a05', lineHeight: 1.55 }}>
                    <b>AI 视觉分析：</b>{String(activeDifficulty.imageInsight).trim()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI 洞察区域 */}
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(114,46,209,0.05)', border: '1px solid rgba(114,46,209,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BulbOutlined style={{ color: 'var(--color-accent-purple)', fontSize: 14 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1f1f1f' }}>AI 洞察</span>
              </div>
              <Button
                size="small"
                type="link"
                onClick={() => void loadProfile()}
                loading={loading}
                style={{ padding: 0, fontSize: 12 }}
              >
                刷新洞察
              </Button>
            </div>
            {(() => {
              const fallbackInsights = buildFallbackInsights(style || ({} as StyleInfo), quoteSuggestion);
              const merged: StyleInsightItem[] = Array.isArray((profile as any)?.insights) && (profile as any).insights.length > 0
                ? (profile as any).insights.map((it: any) => ({
                    category: (it.category || it.type || 'progress') as InsightCategory,
                    text: String(it.text || it.message || it.content || '').trim(),
                  })).filter((it: StyleInsightItem) => it.text)
                : fallbackInsights;
              const items: StyleInsightItem[] = merged.length > 0 ? merged : [{ category: 'progress' as InsightCategory, text: '暂无明显风险信号，继续保持当前节奏。' }];
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map((it, idx) => (
                    <Tag
                      key={`${it.category}_${idx}`}
                      style={{
                        margin: 0,
                        fontSize: 12,
                        lineHeight: '18px',
                        padding: '3px 8px',
                        color: INSIGHT_COLOR[it.category],
                        background: `${INSIGHT_COLOR[it.category]}14`,
                        border: `1px solid ${INSIGHT_COLOR[it.category]}40`,
                        borderRadius: 10,
                      }}
                    >
                      <b style={{ color: INSIGHT_COLOR[it.category] }}>{INSIGHT_LABEL[it.category]}</b>
                      <span style={{ color: '#595959', marginLeft: 6 }}>{it.text}</span>
                    </Tag>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* 关键标签云 */}
          <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-antd)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>关键标签</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {/* 品类 */}
              {String(style?.category || '').trim() && (
                <Tag
                  color="blue"
                  style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
                >
                  品类：{String(style!.category).trim()}
                </Tag>
              )}
              {/* 价格区间 */}
              {Number(style?.price) > 0 && (
                <Tag
                  color="#faad14"
                  style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
                >
                  价格：{fmtMoney(Number(style!.price))}
                </Tag>
              )}
              {/* 工艺复杂度（由难度评估映射） */}
              {activeDifficulty?.difficultyLevel && (
                <Tag
                  color={difficultyColor(activeDifficulty.difficultyLevel)}
                  style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
                >
                  工艺复杂度：{activeDifficulty.difficultyLabel}
                </Tag>
              )}
              {/* 二次工艺 */}
              {Boolean(activeDifficulty?.hasSecondaryProcess || (style as any)?.secondaryProcess) && (
                <Tag
                  color="purple"
                  style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
                >
                  含二次工艺
                </Tag>
              )}
              {/* 是否已下单 */}
              {Number(style?.orderCount) > 0 || Number((profile as any)?.production?.orderCount || 0) > 0 ? (
                <Tag
                  color="green"
                  style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
                >
                  已下单 · {Number((profile as any)?.production?.orderCount || style?.orderCount || 0)} 单
                </Tag>
              ) : (
                <Tag
                  color="default"
                  style={{ margin: 0, fontSize: 12, lineHeight: '20px', padding: '1px 8px', borderRadius: 10 }}
                >
                  未下单
                </Tag>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default StyleIntelligenceProfileCard;
