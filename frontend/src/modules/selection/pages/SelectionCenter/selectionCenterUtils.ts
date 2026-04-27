export interface Candidate {
  id: number;
  candidateNo: string;
  styleName: string;
  category: string;
  colorFamily: string;
  sourceType: string;
  referenceImages?: string;
  costEstimate?: number;
  targetPrice?: number;
  targetQty?: number;
  status: string;
  trendScore?: number;
  trendScoreReason?: string;
  aiEnabled?: boolean;
  scoringMode?: string;
  profitEstimate?: number;
  seasonTags?: string;
  avgReviewScore?: number;
  reviewCount?: number;
  createdStyleId?: number;
  createdStyleNo?: string;
  rejectReason?: string;
  createTime?: string;
  updateTime?: string;
  remark?: string;
}

export interface CandidateReviewItem {
  id: number;
  reviewerName?: string;
  score?: number;
  decision?: string;
  comment?: string;
  reviewTime?: string;
}

export interface CandidateListResponse {
  records?: Candidate[];
  list?: Candidate[];
  total?: number;
}

export const CANDIDATE_FETCH_BATCH_SIZE = 200;

export const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING:  { color: 'orange', label: '待评审' },
  APPROVED: { color: 'green',  label: '已通过' },
  REJECTED: { color: 'red',    label: '已拒绝' },
  HOLD:     { color: 'blue',   label: '待定'   },
};

export const SOURCE_MAP: Record<string, string> = {
  INTERNAL: '自主开发',
  SUPPLIER: '供应商',
  CLIENT:   '客户定制',
  EXTERNAL: '外部市场',
};

export const getScoreMeta = (record: Candidate) => {
  if (record.scoringMode === 'AI_MODEL') {
    return { label: '模型分析', color: 'purple' as const, title: '当前分数来自已启用的 AI 模型分析' };
  }
  if (record.scoringMode === 'RULE_GOOGLE_TRENDS') {
    return { label: '规则评分', color: 'geekblue' as const, title: '当前分数来自 Google Trends 热度 + 本地规则加权，不是大模型结论' };
  }
  if (record.scoringMode === 'RULE_LOCAL_FALLBACK') {
    return { label: '规则兜底', color: 'orange' as const, title: '当前分数来自本地规则兜底，不应当作 AI 结论' };
  }
  if (record.aiEnabled === true || record.trendScoreReason?.startsWith('AI模型分析：')) {
    return { label: '模型分析', color: 'purple' as const, title: '当前分数来自已启用的 AI 模型分析' };
  }
  if (record.trendScoreReason?.startsWith('规则评分：')) {
    return { label: '规则评分', color: 'geekblue' as const, title: '当前分数来自规则计算，不是大模型结论' };
  }
  return { label: '待分析', color: 'default' as const, title: '当前还没有评分来源信息' };
};

export const trimReason = (reason?: string) => {
  if (!reason) return undefined;
  const normalized = reason.replace(/^AI模型分析：|^规则评分：/u, '').trim();
  return normalized.length > 78 ? `${normalized.slice(0, 78)}…` : normalized;
};

export const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

export const buildCandidateInsight = (record: Candidate): import('@/components/common/DecisionInsightCard').DecisionInsight | null => {
  if (record.trendScore == null) return null;
  const scoreMeta = getScoreMeta(record);
  const score = record.trendScore;
  const seed = score + Math.round((record.profitEstimate || 0) * 10) + (record.targetQty || 0);
  const level = score >= 70 ? 'success' : score >= 50 ? 'warning' : 'danger';
  const title = score >= 70 ? '可推进下版' : score >= 50 ? '建议补证后再审' : '暂不建议推进';
  const summary = score >= 70
    ? choose(seed, [
      '这款在热度和利润空间上都比较扎实，可以进入下版验证。',
      '当前信号偏正向，适合从观察阶段进入打版阶段。',
      '这款的推进价值比较明确，可以继续往样衣验证走。',
    ])
    : score >= 50
    ? choose(seed, [
      '方向是对的，但证据还不够硬，先补渠道和价格带对比更稳。',
      '这款不差，但还没到"马上下版"的确定性，建议先补证。',
      '目前属于可关注区间，先把关键证据补齐再推进。',
    ])
    : choose(seed, [
      '当前趋势契合度偏弱，直接下版会占用样衣资源。',
      '这款更适合先观察，不建议现在就投入下版。',
      '眼下推进性价比不高，建议先作为参考样本保留。',
    ]);
  const evidence = [
    `趋势评分 ${score} 分（${scoreMeta.label}）`,
    record.profitEstimate != null ? `预估利润率 ${record.profitEstimate}%` : null,
    record.targetQty != null ? `预计下单 ${record.targetQty} 件` : null,
    record.avgReviewScore != null ? `评审均分 ${record.avgReviewScore} / 5` : null,
  ].filter(Boolean) as string[];
  return {
    level,
    title,
    summary,
    painPoint: score >= 70
      ? choose(seed + 3, ['关注样衣验证能否跟上。', '重点在执行速度。', '确保打版排期充足。'])
      : score >= 50
      ? choose(seed + 5, ['证据不够，需补充数据。', '缺关键佐证。', '确定性不足。'])
      : choose(seed + 7, ['信号偏弱，推进占资源。', '不具备优先推进条件。', '建议观望。']),
    source: scoreMeta.label,
    confidence: score >= 70 ? '把握较高' : '建议复核',
    evidence,
    note: trimReason(record.trendScoreReason),
    execute: score >= 70
      ? choose(seed + 11, ['继续审核并下版。', '推进到打版。', '进入下版流程。'])
      : score >= 50
      ? choose(seed + 13, ['先补市场对比。', '补证据再推进。', '核实渠道与价格带。'])
      : choose(seed + 17, ['保留观察，暂不下版。', '进观察池。', '观望，等待更强信号。']),
    actionLabel: score >= 70 ? '建议继续走审核与下版' : score >= 50 ? '建议补充市场对比后再决策' : '建议先保留观察',
    labels: { summary: '现状', painPoint: '关注点', execute: '下一步', evidence: '数据', note: '补充' },
  };
};

export const getFirstImage = (images?: string): string | null => {
  if (!images) return null;
  try {
    const arr = JSON.parse(images);
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  } catch { return images || null; }
};

export const canDeleteCandidate = (record: Candidate) => {
  if (record.status === 'REJECTED') return true;
  if (record.status !== 'APPROVED') return false;
  const baseTime = record.updateTime || record.createTime;
  if (!baseTime) return false;
  const diff = Date.now() - new Date(baseTime).getTime();
  return diff >= 10 * 24 * 60 * 60 * 1000;
};
