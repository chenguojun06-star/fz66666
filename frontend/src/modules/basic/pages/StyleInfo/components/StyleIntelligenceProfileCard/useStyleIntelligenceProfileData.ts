import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StyleInfo } from '@/types/style';
import { intelligenceApi, visualAnalyze } from '@/services/intelligence/intelligenceApi';
import type {
  DifficultyAssessment,
  StyleIntelligenceProfileResponse,
  StyleQuoteSuggestionResponse,
  VisualAIResponse,
} from '@/services/intelligence/intelligenceApi';
import { getDeliveryMeta, getProgressMeta, STAGE_MAP } from './helpers';

interface UseStyleIntelligenceProfileDataParams {
  style: StyleInfo | null;
}

interface UseStyleIntelligenceProfileDataResult {
  loading: boolean;
  profile: StyleIntelligenceProfileResponse | null;
  quoteSuggestion: StyleQuoteSuggestionResponse | null;
  difficultyLoading: boolean;
  localDifficulty: DifficultyAssessment | null;
  visualResult: VisualAIResponse | null;
  styleId: string | number | undefined;
  styleNo: string;
  deliveryMeta: ReturnType<typeof getDeliveryMeta>;
  progressMeta: ReturnType<typeof getProgressMeta>;
  activeDifficulty: DifficultyAssessment | null;
  workerHint: Array<{ key: string; label: string; value: string }>;
  stageTags: Array<{ key: string; label: string; done: boolean }>;
  loadProfile: () => Promise<void>;
  handleAiImageAnalysis: () => Promise<void>;
}

const EMPTY_STYLE = { styleNo: '', styleName: '', category: '', price: 0, cycle: 0 } as StyleInfo;

export const useStyleIntelligenceProfileData = ({ style }: UseStyleIntelligenceProfileDataParams): UseStyleIntelligenceProfileDataResult => {
  const [loading, setLoading] = useState(false);
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
  const progressMeta = useMemo(() => getProgressMeta(style || EMPTY_STYLE), [style]);

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

  const activeDifficulty = localDifficulty ?? profile?.difficulty ?? null;

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
    return STAGE_MAP.map((item) => ({ key: item.key, label: item.label, done: item.done(style || EMPTY_STYLE) }));
  }, [profile?.stages, style]);

  return {
    loading,
    profile,
    quoteSuggestion,
    difficultyLoading,
    localDifficulty,
    visualResult,
    styleId,
    styleNo,
    deliveryMeta,
    progressMeta,
    activeDifficulty,
    workerHint,
    stageTags,
    loadProfile,
    handleAiImageAnalysis,
  };
};
