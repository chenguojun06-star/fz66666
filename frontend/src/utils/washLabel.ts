export interface WashLabelPartEntry {
  part: string;
  materials: string;
  /** 每部位洗涤说明（存在 materials='' 的特殊条目中） */
  washNote?: string;
}

/**
 * 动态部位区块 — key 直接使用部位名称字符串（如"上装"/"马甲"/"下装"）
 * 不再硬编码 'upper' | 'lower' | 'other'，支持任意数量的服装部位
 */
export interface WashLabelSection {
  /** 部位名称，对应词典 garment_part 的 dictLabel */
  key: string;
  label: string;
  items: string[];
}

export interface WashCareCodeSet {
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
}

export function parseWashLabelParts(value?: string): WashLabelPartEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        part: String(item?.part || '').trim(),
        materials: String(item?.materials ?? '').trim(),
        ...(item?.washNote !== undefined ? { washNote: String(item.washNote) } : {}),
      }))
      .filter(item => item.part || item.materials);
  } catch {
    return [];
  }
}

/**
 * 从 JSON 字符串（fabricCompositionParts）解析为动态区块列表。
 * 按照 JSON 中出现的顺序展示部位，保证用户填写顺序即展示顺序。
 */
export function buildWashLabelSections(
  value?: string,
  fallbackComposition?: string,
): WashLabelSection[] {
  const orderedKeys: string[] = [];
  const grouped = new Map<string, string[]>();

  parseWashLabelParts(value).forEach((entry) => {
    const key = entry.part.trim() || '其他';
    const materials = entry.materials.trim();
    if (!materials) return;
    if (!grouped.has(key)) {
      orderedKeys.push(key);
      grouped.set(key, []);
    }
    grouped.get(key)!.push(materials);
  });

  const sections: WashLabelSection[] = orderedKeys
    .map(key => ({ key, label: key, items: grouped.get(key)! }));

  if (sections.length > 0) {
    return sections;
  }

  const fallback = String(fallbackComposition || '').trim();
  if (!fallback) return [];
  return [{ key: '整件', label: '整件', items: [fallback] }];
}

/**
 * 将动态部位 Map 序列化回 JSON 字符串。
 * partOrder 控制部位显示顺序（来自词典排序）。
 * 传入 washNoteMap 时，每个部位的洗涤说明嵌入为 materials='' 的特殊条目。
 */
export function serializeWashLabelParts(
  partsMap: Record<string, string[]>,
  partOrder: string[],
  washNoteMap?: Record<string, string>,
): string | undefined {
  const entries: WashLabelPartEntry[] = [];
  partOrder.forEach((partLabel) => {
    (partsMap[partLabel] || []).forEach((materials) => {
      const trimmed = materials.trim();
      if (trimmed) entries.push({ part: partLabel, materials: trimmed });
    });
    // 嵌入洗涤说明（即使为空也记录，保留用户清空意图）
    if (washNoteMap) {
      entries.push({ part: partLabel, materials: '', washNote: (washNoteMap[partLabel] || '').trim() });
    }
  });
  return entries.length ? JSON.stringify(entries) : undefined;
}

/**
 * 从 fabricCompositionParts JSON 解析每部位的洗涤说明。
 * 只读取 materials='' 且有 washNote 字段的条目。
 */
export function parseWashNotePerPart(value?: string): Record<string, string> {
  const result: Record<string, string> = {};
  parseWashLabelParts(value).forEach(({ part, materials, washNote }) => {
    if (!materials && washNote !== undefined) {
      result[part.trim()] = washNote;
    }
  });
  return result;
}

/**
 * 从 JSON 字符串解析成 Record<partLabel, materials[]>（给编辑器用）
 */
export function parseWashLabelPartsMap(value?: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  parseWashLabelParts(value).forEach(({ part, materials }) => {
    const key = part.trim() || '其他';
    if (!result[key]) result[key] = [];
    if (materials.trim()) result[key].push(materials.trim());
  });
  return result;
}

export function hasWashLabelComposition(value?: string, fallbackComposition?: string): boolean {
  return buildWashLabelSections(value, fallbackComposition).length > 0;
}

export function hasExplicitWashCareCodes(codes?: WashCareCodeSet): boolean {
  return Boolean(
    codes?.washTempCode
    || codes?.bleachCode
    || codes?.tumbleDryCode
    || codes?.ironCode
    || codes?.dryCleanCode
  );
}

function normalizeText(value?: string): string {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

export function inferWashCareCodesFromText(text?: string): WashCareCodeSet {
  const normalized = normalizeText(text);
  if (!normalized) return {};

  let washTempCode: string | undefined;
  if (/不可水洗|禁止水洗|donotwash/.test(normalized)) washTempCode = 'NO';
  else if (/手洗|handwash/.test(normalized)) washTempCode = 'HAND';
  else if (/95|95°|95c/.test(normalized)) washTempCode = 'W95';
  else if (/60|60°|60c/.test(normalized)) washTempCode = 'W60';
  else if (/40|40°|40c/.test(normalized)) washTempCode = 'W40';
  else if (/30|30°|30c|≤30|<30/.test(normalized)) washTempCode = 'W30';

  let bleachCode: string | undefined;
  if (/不可漂白|禁止漂白|nobleach/.test(normalized)) bleachCode = 'NO';
  else if (/非氯漂|nonchlorine/.test(normalized)) bleachCode = 'NON_CHL';
  else if (/可漂白|允许漂白/.test(normalized)) bleachCode = 'ANY';

  let tumbleDryCode: string | undefined;
  if (/不可烘干|禁止烘干|donottumbledry/.test(normalized)) tumbleDryCode = 'NO';
  else if (/低温烘干|lowtumbledry/.test(normalized)) tumbleDryCode = 'LOW';
  else if (/烘干|tumbledry/.test(normalized)) tumbleDryCode = 'NORMAL';

  let ironCode: string | undefined;
  if (/不可熨烫|禁止熨烫|donotiron/.test(normalized)) ironCode = 'NO';
  else if (/低温熨烫|lowiron/.test(normalized)) ironCode = 'LOW';
  else if (/中温熨烫|mediumiron/.test(normalized)) ironCode = 'MED';
  else if (/高温熨烫|highiron/.test(normalized)) ironCode = 'HIGH';

  let dryCleanCode: string | undefined;
  if (/不可干洗|禁止干洗|donotdryclean/.test(normalized)) dryCleanCode = 'NO';
  else if (/干洗|dryclean/.test(normalized)) dryCleanCode = 'YES';

  return {
    washTempCode,
    bleachCode,
    tumbleDryCode,
    ironCode,
    dryCleanCode,
  };
}

export function getDisplayWashCareCodes<T extends WashCareCodeSet>(codes?: T, washInstructions?: string): WashCareCodeSet {
  if (hasExplicitWashCareCodes(codes)) {
    return {
      washTempCode: codes?.washTempCode,
      bleachCode: codes?.bleachCode,
      tumbleDryCode: codes?.tumbleDryCode,
      ironCode: codes?.ironCode,
      dryCleanCode: codes?.dryCleanCode,
    };
  }
  return inferWashCareCodesFromText(washInstructions);
}
