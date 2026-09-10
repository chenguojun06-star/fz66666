import React, { useState } from 'react';
import { Card } from 'antd';
import type { StyleInfo } from '@/types/style';
import { useStyleIntelligenceProfileData } from './StyleIntelligenceProfileCard/useStyleIntelligenceProfileData';
import CardHeader from './StyleIntelligenceProfileCard/components/CardHeader';
import SummaryMetrics from './StyleIntelligenceProfileCard/components/SummaryMetrics';
import DifficultyPanel from './StyleIntelligenceProfileCard/components/DifficultyPanel';
import WorkerHintPreview from './StyleIntelligenceProfileCard/components/WorkerHintPreview';
import InsightPanel from './StyleIntelligenceProfileCard/components/InsightPanel';
import KeyTagsCloud from './StyleIntelligenceProfileCard/components/KeyTagsCloud';

/**
 * D-346 统一分区容器：左侧色条 + 标题 + 可选说明，内容区统一内边距。
 * 所有分区同一套标题样式/间距，避免"东一块西一块"的散乱观感。
 */
const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
      <span style={{
        fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
        paddingLeft: 8, borderLeft: '3px solid var(--color-primary)', lineHeight: '16px',
      }}>{title}</span>
      {hint ? <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{hint}</span> : null}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

/** 两栏栅格：窄屏自动堆叠，宽屏左右对齐等高 */
const GRID2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: 12,
  alignItems: 'stretch',
};

interface Props {
  style: StyleInfo | null;
  /** 视觉AI分析文本就绪时回调（供详情页把结果回填进款式特征） */
  onVisionAnalysis?: (payload: { visionRaw: string; difficultyLabel?: string; difficultyScore?: number }) => void;
}

const StyleIntelligenceProfileCard: React.FC<Props> = ({ style, onVisionAnalysis }) => {
  const [expanded, setExpanded] = useState(false);

  const {
    loading,
    profile,
    quoteSuggestion,
    difficultyLoading,
    visualResult,
    styleId,
    deliveryMeta,
    progressMeta,
    activeDifficulty,
    workerHint,
    stageTags,
    loadProfile,
    handleAiImageAnalysis,
  } = useStyleIntelligenceProfileData({ style, onVisionAnalysis });

  if (!style?.id) return null;

  const doneCount = stageTags.filter((item) => item.done).length;
  const completionRate = profile?.developmentCompletionRate ?? progressMeta.percent;
  const orderCount = profile?.production?.orderCount ?? Number(style.orderCount || 0);
  const latestOrderStatus = profile?.production?.latestOrderStatus || style.latestOrderStatus;
  const latestOrderNo = profile?.production?.latestOrderNo || style.latestOrderNo || '暂无';
  const latestProgress = profile?.production?.latestProductionProgress != null
    ? `${profile.production.latestProductionProgress}%`
    : style.latestProductionProgress != null
      ? `${style.latestProductionProgress}%`
      : '—';
  const progressNode = profile?.progressNode || style.progressNode || '未启动';

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: '1px solid rgba(24,144,255,0.15)',
        background: 'var(--color-slate-50)',
      }}
      styles={{ body: { padding: 0 } }}
    >
      {/* ── 标题栏（常驻，点击折叠/展开） ── */}
      <CardHeader
        expanded={expanded}
        loading={loading}
        deliveryMeta={deliveryMeta}
        completionRate={completionRate}
        doneCount={doneCount}
        stageTotal={stageTags.length}
        orderCount={orderCount}
        activeDifficulty={activeDifficulty}
        onToggle={() => setExpanded((v) => !v)}
      />

      {/* ── 展开区域：统一分区栅格（进度概览 / 难度评估 / AI洞察 / 工人端提示 / 关键标签）── */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 一行式关键信息条（节点 / 交期 / 最新订单进度） */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '2px 14px',
            fontSize: 12, color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-container)', borderRadius: 8, padding: '6px 10px',
          }}>
            <span>节点：<b style={{ color: 'var(--color-text-primary)' }}>{progressNode}</b></span>
            <span>{deliveryMeta.detail}</span>
            <span>最新订单：<b style={{ color: 'var(--color-text-primary)' }}>{latestOrderNo}</b></span>
            <span>进度：<b style={{ color: 'var(--color-text-primary)' }}>{latestProgress}</b></span>
          </div>

          <div style={GRID2}>
            <Section title="进度概览" hint={`${doneCount}/${stageTags.length} 节点完成`}>
              <SummaryMetrics
                loading={loading}
                profile={profile}
                quoteSuggestion={quoteSuggestion}
                activeDifficulty={activeDifficulty}
                deliveryMeta={deliveryMeta}
                completionRate={completionRate}
                doneCount={doneCount}
                stageTags={stageTags}
                orderCount={orderCount}
                latestOrderStatus={latestOrderStatus}
              />
            </Section>

            <Section title="难度评估" hint="AI 视觉分析">
              <DifficultyPanel
                loading={loading}
                difficultyLoading={difficultyLoading}
                activeDifficulty={activeDifficulty}
                visualResult={visualResult}
                styleId={styleId}
                onAiImageAnalysis={handleAiImageAnalysis}
              />
            </Section>
          </div>

          <div style={GRID2}>
            <Section title="AI 洞察" hint="风险提示与建议">
              <InsightPanel
                loading={loading}
                profile={profile}
                quoteSuggestion={quoteSuggestion}
                style={style}
                onRefresh={() => void loadProfile()}
              />
            </Section>

            <Section title="工人端提示预览" hint="工人扫码时可见">
              <WorkerHintPreview workerHint={workerHint} activeDifficulty={activeDifficulty} />
            </Section>
          </div>

          <Section title="关键标签">
            <KeyTagsCloud style={style} activeDifficulty={activeDifficulty} profile={profile} />
          </Section>
        </div>
      )}

    </Card>
  );
};

export default StyleIntelligenceProfileCard;
