export interface WashLabelPartEntry {
  part: string;
  materials: string;
}

export interface WashLabelSection {
  key: 'upper' | 'lower' | 'other';
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

const SECTION_LABELS: Record<WashLabelSection['key'], string> = {
  upper: '上装',
  lower: '下装',
  other: '其他部位',
};

function resolveSectionKey(part?: string): WashLabelSection['key'] {
  const normalized = String(part || '').trim().toLowerCase();
  if (!normalized) return 'other';
  if (
    normalized.includes('上装')
    || normalized.includes('上衣')
    || normalized.includes('top')
    || normalized.includes('upper')
    || normalized.includes('shirt')
    || normalized.includes('jacket')
    || normalized.includes('coat')
  ) {
    return 'upper';
  }
  if (
    normalized.includes('下装')
    || normalized.includes('裤')
    || normalized.includes('裙')
    || normalized.includes('lower')
    || normalized.includes('bottom')
    || normalized.includes('pants')
    || normalized.includes('skirt')
    || normalized.includes('shorts')
  ) {
    return 'lower';
  }
  return 'other';
}

export function parseWashLabelParts(value?: string): WashLabelPartEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        part: String(item?.part || '').trim(),
        materials: String(item?.materials || '').trim(),
      }))
      .filter(item => item.part || item.materials);
  } catch {
    return [];
  }
}

export function buildWashLabelSections(
  value?: string,
  fallbackComposition?: string,
): WashLabelSection[] {
  const grouped = new Map<WashLabelSection['key'], string[]>();
  parseWashLabelParts(value).forEach((entry) => {
    const key = resolveSectionKey(entry.part);
    const materials = entry.materials.trim();
    if (!materials) return;
    grouped.set(key, [...(grouped.get(key) || []), materials]);
  });

  const sections: WashLabelSection[] = (['upper', 'lower', 'other'] as const)
    .map(key => ({ key, label: SECTION_LABELS[key], items: grouped.get(key) || [] }))
    .filter(section => section.items.length > 0);

  if (sections.length > 0) {
    return sections;
  }

  const fallback = String(fallbackComposition || '').trim();
  if (!fallback) return [];
  return [{ key: 'other', label: SECTION_LABELS.other, items: [fallback] }];
}

export function serializeWashLabelSections(sections: {
  upper?: string[];
  lower?: string[];
  other?: string[];
}): string | undefined {
  const entries: WashLabelPartEntry[] = [];

  (sections.upper || []).forEach((materials) => {
    const trimmed = String(materials || '').trim();
    if (trimmed) entries.push({ part: SECTION_LABELS.upper, materials: trimmed });
  });

  (sections.lower || []).forEach((materials) => {
    const trimmed = String(materials || '').trim();
    if (trimmed) entries.push({ part: SECTION_LABELS.lower, materials: trimmed });
  });

  (sections.other || []).forEach((materials) => {
    const trimmed = String(materials || '').trim();
    if (trimmed) entries.push({ part: SECTION_LABELS.other, materials: trimmed });
  });

  return entries.length ? JSON.stringify(entries) : undefined;
}

export function splitWashLabelSections(value?: string): {
  upper: string[];
  lower: string[];
  other: string[];
} {
  const state = { upper: [] as string[], lower: [] as string[], other: [] as string[] };
  parseWashLabelParts(value).forEach((entry) => {
    const key = resolveSectionKey(entry.part);
    if (entry.materials) {
      state[key].push(entry.materials);
    }
  });
  return state;
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
