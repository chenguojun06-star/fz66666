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

interface Props {
  style: StyleInfo | null;
}

const StyleIntelligenceProfileCard: React.FC<Props> = ({ style }) => {
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
  } = useStyleIntelligenceProfileData({ style });

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
        background: '#f7fbff',
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

      {/* ── 展开区域（紧凑左右两栏布局）── */}
      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {/* 基本信息行 */}
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1.6, marginBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 5 }}>
            <span>节点：{progressNode} · {deliveryMeta.detail}</span>
            {' · '}
            <span>最新订单：{latestOrderNo} · 进度 {latestProgress}</span>
          </div>

          {/* 左右两栏主体 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
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
            <DifficultyPanel
              loading={loading}
              difficultyLoading={difficultyLoading}
              activeDifficulty={activeDifficulty}
              visualResult={visualResult}
              styleId={styleId}
              onAiImageAnalysis={handleAiImageAnalysis}
            />
          </div>

          {/* ── 工人提示预览：工人扫码时看到的内容 ── */}
          <WorkerHintPreview workerHint={workerHint} activeDifficulty={activeDifficulty} />

          {/* AI 洞察区域 */}
          <InsightPanel
            loading={loading}
            profile={profile}
            quoteSuggestion={quoteSuggestion}
            style={style}
            onRefresh={() => void loadProfile()}
          />

          {/* 关键标签云 */}
          <KeyTagsCloud style={style} activeDifficulty={activeDifficulty} profile={profile} />
        </div>
      )}
    </Card>
  );
};

export default StyleIntelligenceProfileCard;
