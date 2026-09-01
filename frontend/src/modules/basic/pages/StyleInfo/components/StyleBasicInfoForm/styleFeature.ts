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
