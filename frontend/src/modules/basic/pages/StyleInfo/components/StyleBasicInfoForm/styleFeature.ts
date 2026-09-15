/**
 * 款式特征（单一整段文本）读写工具 —— 全站唯一实现，禁止各处再写一份解析。
 *
 * 背景：款式特征原为 6 个分散输入框（面料/袖型/领型/版型/图案/工艺风格），
 * 用户反馈"看着成功实际存不进去"且阅读割裂，D-261 起合并为一个整体文本框。
 *
 * 存储：仍走 StyleInfo.extJson（JSON 字符串列，无需 Flyway 迁移）
 *   - 新：extJson.styleFeature —— 整段文本
 *   - 旧：extJson.fabric / sleeveType / neckline / version / pattern / craftStyle
 *
 * 读取：优先取新字段；新字段为空时把旧 6 字段拼成一段返回，历史数据平滑迁移。
 */

export const STYLE_FEATURE_KEY = 'styleFeature';

/** 旧版 6 个分散字段（已废弃，仅用于历史数据兼容） */
const LEGACY_FIELDS = [
  { key: 'fabric', label: '面料' },
  { key: 'sleeveType', label: '袖型' },
  { key: 'neckline', label: '领型' },
  { key: 'version', label: '版型' },
  { key: 'pattern', label: '图案' },
  { key: 'craftStyle', label: '工艺风格' },
] as const;

/** 解析 extJson，兼容「JSON 字符串 / 对象 / null」三种返回形态 */
export function parseExtJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** 旧 6 字段合并成一段文本（历史数据迁移） */
export function mergeLegacyFeatureText(ext: Record<string, unknown>): string {
  return LEGACY_FIELDS.map(({ key, label }) => {
    const v = ext[key];
    const text = typeof v === 'string' ? v.trim() : '';
    return text ? `${label}：${text}` : '';
  })
    .filter(Boolean)
    .join('；');
}

/** 取款式特征整段文本：优先新字段，回退旧字段合并 */
export function resolveStyleFeature(extJson: unknown): string {
  const ext = parseExtJson(extJson);
  const current = ext[STYLE_FEATURE_KEY];
  if (typeof current === 'string' && current.trim()) return current.trim();
  return mergeLegacyFeatureText(ext);
}

/** 相邻两段特征文本合并去重（AI 识别结果追加到既有人工填写内容时使用） */
export function appendFeatureText(existing: string, incoming: string): string {
  const a = (existing || '').trim();
  const b = (incoming || '').trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b) || b.includes(a)) return a.length >= b.length ? a : b;
  return `${a}；${b}`;
}

/**
 * 识别失败残留文本特征（D-264 / D-391）：图片 URL 失效或鉴权拦截时，视觉模型会返回
 * "识别【无法确认…】｜颜色：无法确认｜原始分析：本次分析未能…需人工复核"这类
 * 逐字段复读的垃圾摘要，却带着 available=true 返回。一旦写入款式特征就是一坨乱码，
 * 且挡住后续正常回填。按失败标记判定，命中即视为"未识别"。
 */
const FAILURE_MARKERS = [
  '未获取到可视图像数据',
  '未获取到有效视觉信息',
  '未获取到可解析的图像数据',
  '未获取到任何可视像素信息',
  '无可见图像内容',
  '图片资源无法解析',
  '图片无法访问',
  '无法访问提供的图片',
  '需鉴权',
  '需人工复核',
  '人工打开原图复核',
  '无法确认',
  '无法识别',
  '无法判定',
  '无法判断',
  '未能读取图像',
  '未能成功读取',
  '未能解析',
  '未能产生有效结论',
  '图片解析返回为空',
  '图片内容解析为空',
  '缺乏可依据的图像特征',
  '暂不作结论',
  '占位性说明',
  '不输出推测',
  '不进行推测',
  '不提供推测',
  '不做推测',
  '不可据此下达',
  '无有效访问凭证',
  '请补充清晰',
  '请重新上传',
  '重新上传图片',
  '建议处理方式',
  '无法进行任何实质性',
  '无法给出有效结论',
  '无法给出可信结论',
  '无法给出任何',
  '均无法给出',
  '无法作出任何',
  '无法作出可靠',
  '无法对',
  '原始分析',
];

const STYLE_FEATURE_FAILURE_PATTERN = new RegExp(FAILURE_MARKERS.join('|'));

export function isFailedParseText(text?: string | null): boolean {
  const raw = String(text || '').trim();
  return !!raw && STYLE_FEATURE_FAILURE_PATTERN.test(raw);
}

/** 段落级失败标记（与整段判定同一套关键词），用于从混合文本中剔除垃圾段 */
const FAILURE_SEGMENT_PATTERN = new RegExp(FAILURE_MARKERS.join('|'));

/**
 * 清洗视觉 AI 识别文本：按分隔符拆段，剔除命中失败标记的垃圾段，保留有效信息。
 * 视觉模型在图片不可达时会把"识别【…】｜颜色：…｜图案：…"整段塞满
 * "无法确认/未获取到可视图像数据/需人工复核"等复读垃圾，这里拆段过滤。
 * 全部剔除（没有任何有效信息）时返回空字符串，调用方按"未识别"处理。
 */
export function cleanVisionText(text?: string | null): string {
  const raw = String(text || '').trim();
  if (!raw || isFailedParseText(raw)) return '';
  const segments = raw.split(/[｜|；;\n]+/).map((s) => s.trim()).filter(Boolean);
  const useful = segments.filter((seg) => !FAILURE_SEGMENT_PATTERN.test(seg));
  return useful.join('；');
}
