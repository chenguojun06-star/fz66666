/**
 * 电商店铺「刊登合规与质量」规则集（D-769）
 *
 * 为什么放在前端纯函数里：
 * 1. 违禁词命中与刊登质检都是**本地判定**，不需要落库、不需要调平台接口；
 * 2. 放在前端可在**上架之前**就拦住，避免运营上架后被平台拒绝却不知道为什么；
 * 3. 纯函数可直接单测——词库与规则是最容易被人无意改动的地方。
 *
 * 对标专业电商 ERP（店小秘/聚水潭）：它们都把「违禁词检测 + 刊登质量诊断」
 * 做成一等能力，因为命中违禁词会导致**发布失败 / 品牌侵权 / 罚款**，
 * 属于直接经济损失，而不是体验问题。
 */

/** 违禁词分类，用于告诉运营「为什么不行、该改什么」 */
export type BannedWordCategory = 'absolute_claim' | 'medical_claim' | 'brand_infringement' | 'misleading';

/** 一条违禁词规则 */
export type BannedWordRule = {
  word: string;
  category: BannedWordCategory;
  reason: string;
};

/**
 * 违禁词库。
 *
 * 说明与维护纪律：
 * - 只收录**在各平台通用、且命中后确实有实质风险**的词；
 * - 「绝对化用语」依据《广告法》第九条（国家级/最高级/最佳等）；
 * - 「医疗功效」依据《广告法》第十七条（非医疗用途不得宣称疗效）；
 * - 「品牌」只列**知名奢侈/快时尚品牌的精确全称**，不做模糊子串匹配，
 *   避免「花花公子款」这类正常描述被误伤；
 * - 「虚假促销」类直接对应平台「价格误导/虚假折扣」处罚。
 */
export const BANNED_WORD_RULES: BannedWordRule[] = [
  // 绝对化用语（《广告法》第九条）
  { word: '国家级', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '世界级', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '最高级', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '最佳', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '最好', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '最优', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '顶级', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '第一品牌', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '独家首创', category: 'absolute_claim', reason: '《广告法》禁用的绝对化用语' },
  { word: '销量第一', category: 'absolute_claim', reason: '需有可验证依据，否则涉嫌虚假宣传' },

  // 医疗功效宣称（非医疗用途不得宣称）
  { word: '治疗', category: 'medical_claim', reason: '服装不得宣称治疗功效' },
  { word: '疗效', category: 'medical_claim', reason: '服装不得宣称疗效' },
  { word: '根治', category: 'medical_claim', reason: '涉嫌虚假宣传，平台高风险词' },
  { word: '抗癌', category: 'medical_claim', reason: '服装不得宣称医疗功效' },
  { word: '减肥', category: 'medical_claim', reason: '普通服装不得宣称减肥功效' },
  { word: '塑形', category: 'medical_claim', reason: '普通服装宣称塑形功效属高风险' },
  { word: '抗菌防病毒', category: 'medical_claim', reason: '功效宣称需检测报告支撑' },
  { word: '医用', category: 'medical_claim', reason: '普通服装不得使用「医用」表述' },

  // 品牌侵权风险（精确全称，避免误伤「XX款」这类描述）
  { word: 'Gucci', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },
  { word: 'LV', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },
  { word: 'Chanel', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },
  { word: 'Prada', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },
  { word: 'Nike', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },
  { word: 'Adidas', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },
  { word: 'Disney', category: 'brand_infringement', reason: '疑似使用注册商标/IP，侵权风险' },
  { word: '无印良品', category: 'brand_infringement', reason: '疑似使用注册商标，侵权风险' },

  // 虚假促销 / 价格误导
  { word: '假一赔十', category: 'misleading', reason: '需有赔付能力证明，否则涉嫌虚假承诺' },
  { word: '全网最低', category: 'misleading', reason: '涉嫌价格误导，平台处罚项' },
  { word: '亏本甩卖', category: 'misleading', reason: '涉嫌虚假促销，平台处罚项' },
  { word: '限时秒杀', category: 'misleading', reason: '需真实活动支撑，否则涉嫌虚假促销' },
  { word: '永久有效', category: 'misleading', reason: '绝对化承诺，涉嫌虚假宣传' },
];

export const BANNED_CATEGORY_LABEL: Record<BannedWordCategory, string> = {
  absolute_claim: '绝对化用语',
  medical_claim: '医疗功效宣称',
  brand_infringement: '品牌侵权风险',
  misleading: '虚假促销/误导',
};

/** 违禁词检测命中项 */
export type BannedWordHit = {
  word: string;
  category: BannedWordCategory;
  categoryLabel: string;
  reason: string;
  /** 命中的原文片段，便于运营直接定位 */
  matchedText: string;
};

/**
 * 检测文本中的违禁词。
 *
 * <p><b>大小写与全角处理</b>：品牌词常见大小写混用（gucci / GUCCI），
 * 故统一转小写后再匹配；中文不受影响。
 *
 * @param text 待检测文本（标题/描述/备注）
 * @returns 命中列表；空数组表示合规
 */
export function detectBannedWords(text?: string | null): BannedWordHit[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits: BannedWordHit[] = [];
  for (const rule of BANNED_WORD_RULES) {
    const needle = rule.word.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx >= 0) {
      hits.push({
        word: rule.word,
        category: rule.category,
        categoryLabel: BANNED_CATEGORY_LABEL[rule.category],
        reason: rule.reason,
        matchedText: text.slice(idx, idx + rule.word.length),
      });
    }
  }
  return hits;
}

/* ────────────────────────── 刊登质量诊断 ────────────────────────── */

/** 诊断级别：block=必须修复才能上架；warn=可上架但建议修 */
export type ListingIssueLevel = 'block' | 'warn';

/** 一条刊登质量问题 */
export type ListingIssue = {
  level: ListingIssueLevel;
  field: string;
  message: string;
  /** 修复建议，直接告诉运营下一步做什么 */
  action: string;
};

/** 诊断入参：店铺刊登一条商品所需的全部要素 */
export type ListingQualityInput = {
  styleNo?: string | null;
  styleName?: string | null;
  cover?: string | null;
  remark?: string | null;
  skus?: Array<{ salesPrice?: number | null; stockQuantity?: number | null; color?: string; image?: string | null }>;
};

/** 标题长度上限：多数平台商品标题上限 60 字，留余量取 60 */
const TITLE_MAX_LEN = 60;
/** 标题过短阈值：低于此长度平台可能判为信息不足 */
const TITLE_MIN_LEN = 5;

/**
 * 刊登质量诊断。
 *
 * <p>对标店小秘/聚水潭的「刊登质量评分」：上架前一次性告知缺什么，
 * 而不是上架后被平台拒绝再回来猜。
 *
 * @param input 商品要素
 * @returns 问题列表；空数组表示可上架
 */
export function diagnoseListingQuality(input: ListingQualityInput): ListingIssue[] {
  const issues: ListingIssue[] = [];
  const title = (input.styleName || '').trim();
  const styleNo = (input.styleNo || '').trim();

  if (!styleNo) {
    issues.push({
      level: 'block',
      field: '款号',
      message: '缺少款号',
      action: '先在「款式信息」补齐款号，否则顾客端无法识别这是哪件货',
    });
  }

  if (!title) {
    issues.push({
      level: 'block',
      field: '商品标题',
      message: '缺少商品标题',
      action: '填写商品标题（建议包含品类、面料、卖点）',
    });
  } else if (title.length > TITLE_MAX_LEN) {
    issues.push({
      level: 'warn',
      field: '商品标题',
      message: `标题 ${title.length} 字，超过 ${TITLE_MAX_LEN} 字可能被平台截断`,
      action: `精简到 ${TITLE_MAX_LEN} 字以内，把核心卖点前置`,
    });
  } else if (title.length < TITLE_MIN_LEN) {
    issues.push({
      level: 'warn',
      field: '商品标题',
      message: `标题仅 ${title.length} 字，信息量不足影响搜索权重`,
      action: '补充面料/工艺/风格等关键词，有助于平台搜索推荐',
    });
  }

  if (!input.cover) {
    issues.push({
      level: 'block',
      field: '主图',
      message: '未上传主图',
      action: '上传主图；无图的商品在顾客端几乎不会被点击',
    });
  }

  const banned = detectBannedWords([title, input.remark].filter(Boolean).join(' '));
  for (const hit of banned) {
    issues.push({
      level: 'block',
      field: '标题/描述',
      message: `含违禁词「${hit.matchedText}」（${hit.categoryLabel}）`,
      action: hit.reason,
    });
  }

  const skus = input.skus ?? [];
  if (skus.length === 0) {
    issues.push({
      level: 'block',
      field: 'SKU',
      message: '未维护任何 SKU',
      action: '至少维护一个颜色/尺码 SKU，否则无法售卖',
    });
  } else {
    if (skus.every((s) => !s.salesPrice || s.salesPrice <= 0)) {
      issues.push({
        level: 'block',
        field: '售价',
        message: '所有 SKU 均未设置有效售价',
        action: '填写售价，否则顾客无法下单',
      });
    }
    if (skus.every((s) => !s.stockQuantity || s.stockQuantity <= 0)) {
      issues.push({
        level: 'block',
        field: '库存',
        message: '所有 SKU 库存均为 0',
        action: '录入可售库存；库存为 0 通常会被平台自动下架',
      });
    }
    if (!skus.some((s) => s.image)) {
      issues.push({
        level: 'warn',
        field: '颜色图',
        message: '所有颜色均未上传图片',
        action: '按颜色上传图片，顾客选择颜色时才有视觉参考',
      });
    }
  }

  return issues;
}


/**
 * 聚合口径的刊登体检（列表列用）。
 *
 * <p>列表接口 `/shop/admin/sku/summary` 只返回聚合值
 * （minPrice / maxPrice / totalStock / skuCount），**没有 per-SKU 明细**，
 * 因此列表列只能做聚合级判断；逐 SKU 检查（含颜色图）在编辑抽屉里做。
 *
 * <p>好处是列表零额外请求即可提示，避免为了体检去拉全量 SKU。
 */
export function diagnoseListingFromSummary(input: {
  styleNo?: string | null;
  styleName?: string | null;
  cover?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  totalStock?: number | null;
  skuCount?: number | null;
}): ListingIssue[] {
  const issues: ListingIssue[] = [];
  const title = (input.styleName || '').trim();

  if (!(input.styleNo || '').trim()) {
    issues.push({ level: 'block', field: '款号', message: '缺少款号', action: '先在「款式信息」补齐款号' });
  }
  if (!title) {
    issues.push({ level: 'block', field: '商品标题', message: '缺少商品标题', action: '填写商品标题（品类+面料+卖点）' });
  } else if (title.length > TITLE_MAX_LEN) {
    issues.push({
      level: 'warn', field: '商品标题',
      message: `标题 ${title.length} 字，超过 ${TITLE_MAX_LEN} 字可能被平台截断`,
      action: `精简到 ${TITLE_MAX_LEN} 字以内`,
    });
  } else if (title.length < TITLE_MIN_LEN) {
    issues.push({
      level: 'warn', field: '商品标题',
      message: `标题仅 ${title.length} 字，信息量不足影响搜索权重`,
      action: '补充面料/工艺/风格等关键词',
    });
  }
  if (!input.cover) {
    issues.push({ level: 'block', field: '主图', message: '未上传主图', action: '上传主图；无图商品几乎不会被点击' });
  }

  for (const hit of detectBannedWords(title)) {
    issues.push({
      level: 'block', field: '标题/描述',
      message: `含违禁词「${hit.matchedText}」（${hit.categoryLabel}）`,
      action: hit.reason,
    });
  }

  if (!input.skuCount) {
    issues.push({ level: 'block', field: 'SKU', message: '未维护任何 SKU', action: '至少维护一个颜色/尺码 SKU' });
  } else {
    if (input.minPrice == null || !(input.minPrice > 0)) {
      issues.push({ level: 'block', field: '售价', message: 'SKU 未设置有效售价', action: '填写售价，否则顾客无法下单' });
    }
    if (input.totalStock == null || !(input.totalStock > 0)) {
      issues.push({ level: 'block', field: '库存', message: '可售库存为 0', action: '录入库存；为 0 通常会被平台自动下架' });
    }
  }
  return issues;
}

/* ─────────────────── 生产工艺内容识别（D-781） ─────────────────── */

/**
 * 工序/工艺类特征词。
 *
 * ⚠️ 与后端 `ProductionContentDetector` 的 PROCESS_MARKERS **必须保持一致** ——
 * 后端负责真正隐藏，前端这份只用于给运营即时提示。
 * 改一处就要改另一处，否则会出现「前端说没问题、后端偷偷藏起来了」。
 */
const PROCESS_MARKERS = [
  '大货工艺', '工艺要求', '工艺说明', '裁剪', '缝纫', '制版', '打版', '放码',
  '裁床', '车缝', '钉珠', '绣花', '印花', '洗水', '整烫', '包装工艺',
  '工序', '生产线', '车位', '产线', '面辅料清单', '工艺单',
];

const PROCESS_MIN_HITS = 2;
const PROCESS_MIN_LENGTH = 40;

/**
 * 判断一段文本是不是生产工艺/工序资料。
 *
 * 线上实测款式 BR25CQ0573B 的款式详情里存的是「大货工艺要求 / 裁剪 / 缝纫 /
 * 印花 / 钉珠 / 包装工艺」—— 这些是给车间看的，出现在顾客端详情页
 * 既看不懂、也属内部资料外泄。
 *
 * 口径刻意保守：命中 ≥2 个特征词、且正文长度 ≥40 才判定，
 * 避免把正常商品描述里顺带提一句「印花工艺」的真实卖点误杀。
 */
export function looksLikeProductionContent(text?: string | null): boolean {
  if (!text) return false;
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length < PROCESS_MIN_LENGTH) return false;
  let hits = 0;
  for (const m of PROCESS_MARKERS) {
    if (plain.includes(m)) hits++;
  }
  return hits >= PROCESS_MIN_HITS;
}

/** 运营看到的说明文案（与后端 hideReason 保持一致） */
export const PRODUCTION_CONTENT_HINT =
  '这段像是生产工艺/工序资料，顾客端会自动隐藏（车间与工厂内部仍可见）。'
  + '想对顾客展示的话，请改写成商品卖点描述。';

/** 诊断汇总：是否存在阻断上架的问题 */
export function summarizeListingIssues(issues: ListingIssue[]): {
  canPublish: boolean;
  blockCount: number;
  warnCount: number;
} {
  const blockCount = issues.filter((i) => i.level === 'block').length;
  const warnCount = issues.filter((i) => i.level === 'warn').length;
  return { canPublish: blockCount === 0, blockCount, warnCount };
}

/**
 * 利润核算。
 *
 * <p>对标店小秘/聚水潭的「售价估算 / 利润试算」：改价是运营最高频的动作，
 * 而「改完不知道赚多少」是利润事故的直接来源。成本缺失时返回 null，
 * **不用 0 冒充成本**——那会让运营以为在亏钱（或以为自己暴利），比不显示更糟。
 *
 * @param salesPrice 售价
 * @param costPrice 成本价；缺失/非正数时返回 null
 * @returns 利润额与毛利率；无法计算时返回 null
 */
export function calcListingProfit(
  salesPrice?: number | null,
  costPrice?: number | null,
): { profit: number; marginRate: number } | null {
  if (salesPrice == null || costPrice == null) return null;
  if (!(salesPrice > 0) || !(costPrice > 0)) return null;
  const profit = salesPrice - costPrice;
  return { profit: round2(profit), marginRate: round2((profit / salesPrice) * 100) };
}


/**
 * 款式级利润估算（列表列用）。
 *
 * <p><b>口径：最保守</b> —— 用「最低售价 − 最高成本」。
 * 理由：列表展示的是价格<b>区间</b>，若拿均价算，会出现「算出来赚钱、
 * 实际有 SKU 在亏」的情况，而亏的那几个正是促销时先卖掉的。
 * 用最保守口径时，只要结果为正就意味着<b>所有 SKU 都赚钱</b>，
 * 这个结论对运营是可靠的。
 *
 * <p><b>成本缺失的处理</b>：返回 {@code status:'no_cost'}，
 * 前端必须显示「成本未维护」而<b>不能</b>显示 0 或当作免费。
 * 另用 {@code costCoverage} 暴露成本维护完整度——部分 SKU 有成本时，
 * 区间会被系统性高估，此时也按不可信处理。
 *
 * @param minPrice 款式内最低售价
 * @param minCost  款式内最低成本
 * @param maxCost  款式内最高成本
 * @param costCoverage 成本维护覆盖率（0~100）
 */
export function calcStyleProfit(input: {
  minPrice?: number | null;
  minCost?: number | null;
  maxCost?: number | null;
  costCoverage?: number | null;
}):
  | { status: 'ok'; profit: number; marginRate: number }
  | { status: 'no_cost' }
  | { status: 'partial_cost'; coverage: number } {
  const { minPrice, minCost, maxCost } = input;
  const coverage = input.costCoverage;

  if (minPrice == null || minCost == null || maxCost == null) {
    return { status: 'no_cost' };
  }
  // 部分 SKU 未维护成本时，成本区间不完整，结论不可信
  if (coverage != null && coverage < 100) {
    return { status: 'partial_cost', coverage };
  }
  if (!(minPrice > 0)) {
    return { status: 'no_cost' };
  }
  const profit = minPrice - maxCost;
  return { status: 'ok', profit: round2(profit), marginRate: round2((profit / minPrice) * 100) };
}

/** 毛利率对应的语义标签，供列表着色（用 Design Token 表达，不硬编码颜色） */
export type ProfitLevel = 'loss' | 'low' | 'normal' | 'high';

export function profitLevelOf(marginRate: number): ProfitLevel {
  if (marginRate <= 0) return 'loss';
  if (marginRate < 10) return 'low';
  if (marginRate < 40) return 'normal';
  return 'high';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}