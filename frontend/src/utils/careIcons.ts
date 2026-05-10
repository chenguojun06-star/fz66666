import { getDisplayWashCareCodes, type WashCareCodeSet } from './washLabel';

function tubSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <path d="M2,3 L2,15 Q2,18 4,18 L16,18 Q18,18 18,15 L18,3 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="1" y1="3" x2="19" y2="3" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}

function triSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <polygon points="10,2 19,18 1,18" fill="none" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}

function sqSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <rect x="2" y="2" width="16" height="16" fill="none" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}

function ironSvg(dots: number, cross = false): string {
  const ds = Array.from({ length: dots }, (_, i) =>
    `<circle cx="${6 + i * 4}" cy="13" r="1.2" fill="#000"/>`).join('');
  const cx = cross
    ? '<line x1="3" y1="3" x2="17" y2="17" stroke="#000" stroke-width="1.5"/><line x1="17" y1="3" x2="3" y2="17" stroke="#000" stroke-width="1.5"/>'
    : '';
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <path d="M2,17 L18,17 L18,10 C17,4 13,2 9,2 L4,2 Q2,2 2,5 Z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
    ${ds}${cx}</svg>`;
}

function circSvg(inner: string): string {
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#000" stroke-width="1.5"/>
    ${inner}</svg>`;
}

const X = '<line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/>';
const numTxt = (n: string) =>
  `<text x="10" y="14" text-anchor="middle" font-size="6" fill="#000" font-family="Arial,serif" font-weight="bold">${n}</text>`;

export interface CareIconDef {
  code: string;
  label: string;
  svg: string;
  category: string;
  categoryLabel: string;
}

export interface CareCategoryDef {
  key: string;
  label: string;
  codes: string[];
}

export const CARE_CATEGORIES: CareCategoryDef[] = [
  { key: 'wash', label: '水洗', codes: ['wash_W30', 'wash_W40', 'wash_W50', 'wash_W60', 'wash_W70', 'wash_W95', 'wash_HAND', 'wash_NO'] },
  { key: 'bleach', label: '漂白', codes: ['bleach_ANY', 'bleach_NON_CHL', 'bleach_NO'] },
  { key: 'dry', label: '烘干', codes: ['dry_NORMAL', 'dry_LOW', 'dry_HIGH', 'dry_NO'] },
  { key: 'iron', label: '熨烫', codes: ['iron_LOW', 'iron_MED', 'iron_HIGH', 'iron_NO'] },
  { key: 'dryclean', label: '干洗', codes: ['dryclean_A', 'dryclean_F', 'dryclean_P', 'dryclean_W', 'dryclean_NO'] },
  { key: 'naturaldry', label: '自然晾干', codes: ['naturaldry_LINE', 'naturaldry_DRIP', 'naturaldry_FLAT', 'naturaldry_DRIP_FLAT', 'naturaldry_SHADE_LINE', 'naturaldry_SHADE_FLAT'] },
];

export const CARE_ICONS: Record<string, CareIconDef> = {
  wash_W30:  { code: 'wash_W30',  label: '30°C水洗',    svg: tubSvg(numTxt('30°')), category: 'wash', categoryLabel: '水洗' },
  wash_W40:  { code: 'wash_W40',  label: '40°C水洗',    svg: tubSvg(numTxt('40°')), category: 'wash', categoryLabel: '水洗' },
  wash_W50:  { code: 'wash_W50',  label: '50°C水洗',    svg: tubSvg(numTxt('50°')), category: 'wash', categoryLabel: '水洗' },
  wash_W60:  { code: 'wash_W60',  label: '60°C水洗',    svg: tubSvg(numTxt('60°')), category: 'wash', categoryLabel: '水洗' },
  wash_W70:  { code: 'wash_W70',  label: '70°C水洗',    svg: tubSvg(numTxt('70°')), category: 'wash', categoryLabel: '水洗' },
  wash_W95:  { code: 'wash_W95',  label: '95°C水洗',    svg: tubSvg(numTxt('95°')), category: 'wash', categoryLabel: '水洗' },
  wash_HAND: { code: 'wash_HAND', label: '手洗',        svg: tubSvg('<path d="M7,16 L7,11 L9.5,11 L9.5,9 L12,9 L12,11 L14,11 L14,14 Q14,16 12,16 Z" fill="none" stroke="#000" stroke-width="1"/>'), category: 'wash', categoryLabel: '水洗' },
  wash_NO:   { code: 'wash_NO',   label: '不可水洗',    svg: tubSvg(X), category: 'wash', categoryLabel: '水洗' },

  bleach_ANY:     { code: 'bleach_ANY',     label: '可漂白',      svg: triSvg(''), category: 'bleach', categoryLabel: '漂白' },
  bleach_NON_CHL: { code: 'bleach_NON_CHL', label: '非氯漂白',    svg: triSvg('<line x1="7" y1="18" x2="11" y2="10" stroke="#000" stroke-width="1.5"/>'), category: 'bleach', categoryLabel: '漂白' },
  bleach_NO:      { code: 'bleach_NO',      label: '不可漂白',    svg: triSvg(X), category: 'bleach', categoryLabel: '漂白' },

  dry_NORMAL: { code: 'dry_NORMAL', label: '可烘干(常规)',  svg: sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/>'), category: 'dry', categoryLabel: '烘干' },
  dry_LOW:    { code: 'dry_LOW',    label: '低温烘干(60°C)', svg: sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="10" cy="10" r="1.5" fill="#000"/>'), category: 'dry', categoryLabel: '烘干' },
  dry_HIGH:   { code: 'dry_HIGH',   label: '高温烘干(80°C)', svg: sqSvg('<circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="8" cy="10" r="1.5" fill="#000"/><circle cx="12" cy="10" r="1.5" fill="#000"/>'), category: 'dry', categoryLabel: '烘干' },
  dry_NO:     { code: 'dry_NO',     label: '不可烘干',      svg: sqSvg(X), category: 'dry', categoryLabel: '烘干' },

  iron_LOW:   { code: 'iron_LOW',   label: '低温熨烫(110°C)', svg: ironSvg(1), category: 'iron', categoryLabel: '熨烫' },
  iron_MED:   { code: 'iron_MED',   label: '中温熨烫(150°C)', svg: ironSvg(2), category: 'iron', categoryLabel: '熨烫' },
  iron_HIGH:  { code: 'iron_HIGH',  label: '高温熨烫(200°C)', svg: ironSvg(3), category: 'iron', categoryLabel: '熨烫' },
  iron_NO:    { code: 'iron_NO',    label: '不可熨烫',       svg: ironSvg(0, true), category: 'iron', categoryLabel: '熨烫' },

  dryclean_A:  { code: 'dryclean_A',  label: 'A干洗(任何溶剂)',     svg: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,serif" font-style="italic">A</text>'), category: 'dryclean', categoryLabel: '干洗' },
  dryclean_F:  { code: 'dryclean_F',  label: 'F干洗(碳氢化合物)',   svg: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,serif" font-style="italic">F</text>'), category: 'dryclean', categoryLabel: '干洗' },
  dryclean_P:  { code: 'dryclean_P',  label: 'P干洗(四氯乙烯)',     svg: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,serif" font-style="italic">P</text>'), category: 'dryclean', categoryLabel: '干洗' },
  dryclean_W:  { code: 'dryclean_W',  label: 'W专业湿洗',          svg: circSvg('<text x="10" y="14.5" text-anchor="middle" font-size="9" fill="#000" font-family="Arial,serif" font-style="italic">W</text>'), category: 'dryclean', categoryLabel: '干洗' },
  dryclean_NO: { code: 'dryclean_NO', label: '不可干洗',           svg: circSvg(X), category: 'dryclean', categoryLabel: '干洗' },

  naturaldry_LINE:      { code: 'naturaldry_LINE',      label: '悬挂晾干',    svg: sqSvg('<line x1="5" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.2"/><line x1="5" y1="15" x2="15" y2="15" stroke="#000" stroke-width="1.2"/>'), category: 'naturaldry', categoryLabel: '自然晾干' },
  naturaldry_DRIP:      { code: 'naturaldry_DRIP',      label: '悬挂滴干',    svg: sqSvg('<line x1="5" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.2"/><line x1="5" y1="15" x2="15" y2="15" stroke="#000" stroke-width="1.2"/><line x1="10" y1="15" x2="10" y2="18" stroke="#000" stroke-width="1" stroke-dasharray="1.5,1"/>'), category: 'naturaldry', categoryLabel: '自然晾干' },
  naturaldry_FLAT:      { code: 'naturaldry_FLAT',      label: '平铺晾干',    svg: sqSvg('<line x1="4" y1="13" x2="16" y2="13" stroke="#000" stroke-width="1.5"/><line x1="4" y1="16" x2="16" y2="16" stroke="#000" stroke-width="1.5"/>'), category: 'naturaldry', categoryLabel: '自然晾干' },
  naturaldry_DRIP_FLAT: { code: 'naturaldry_DRIP_FLAT', label: '平铺滴干',    svg: sqSvg('<line x1="4" y1="13" x2="16" y2="13" stroke="#000" stroke-width="1.5"/><line x1="4" y1="16" x2="16" y2="16" stroke="#000" stroke-width="1.5"/><line x1="10" y1="16" x2="10" y2="18" stroke="#000" stroke-width="1" stroke-dasharray="1.5,1"/>'), category: 'naturaldry', categoryLabel: '自然晾干' },
  naturaldry_SHADE_LINE: { code: 'naturaldry_SHADE_LINE', label: '阴凉处悬挂晾干', svg: sqSvg('<line x1="3" y1="4" x2="7" y2="8" stroke="#000" stroke-width="1.2"/><line x1="13" y1="4" x2="17" y2="8" stroke="#000" stroke-width="1.2"/><line x1="5" y1="8" x2="5" y2="15" stroke="#000" stroke-width="1.2"/><line x1="5" y1="15" x2="15" y2="15" stroke="#000" stroke-width="1.2"/>'), category: 'naturaldry', categoryLabel: '自然晾干' },
  naturaldry_SHADE_FLAT: { code: 'naturaldry_SHADE_FLAT', label: '阴凉处平铺晾干', svg: sqSvg('<line x1="3" y1="4" x2="7" y2="8" stroke="#000" stroke-width="1.2"/><line x1="13" y1="4" x2="17" y2="8" stroke="#000" stroke-width="1.2"/><line x1="4" y1="13" x2="16" y2="13" stroke="#000" stroke-width="1.5"/><line x1="4" y1="16" x2="16" y2="16" stroke="#000" stroke-width="1.5"/>'), category: 'naturaldry', categoryLabel: '自然晾干' },
};

export const DEFAULT_CARE_ICON_CODES: string[] = [
  'wash_W30', 'bleach_NO', 'dry_NORMAL', 'iron_LOW', 'dryclean_A',
];

export function getCareIconSvgs(codes: string[]): string[] {
  return codes.map(code => CARE_ICONS[code]?.svg).filter(Boolean);
}

export function careCodesFromLegacyFields(codes: WashCareCodeSet): string[] {
  const result: string[] = [];
  if (codes.washTempCode) result.push(`wash_${codes.washTempCode}`);
  if (codes.bleachCode) result.push(`bleach_${codes.bleachCode}`);
  if (codes.tumbleDryCode) {
    const td = codes.tumbleDryCode;
    if (td === 'NORMAL') result.push('dry_NORMAL');
    else if (td === 'LOW') result.push('dry_LOW');
    else result.push(`dry_${td}`);
  }
  if (codes.ironCode) result.push(`iron_${codes.ironCode}`);
  if (codes.dryCleanCode) {
    const dc = codes.dryCleanCode;
    if (dc === 'YES') result.push('dryclean_A');
    else result.push(`dryclean_${dc}`);
  }
  return result;
}

export function parseCareIconCodes(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((c: string) => CARE_ICONS[c]);
  } catch { /* ignore */ }
  return [];
}

export function serializeCareIconCodes(codes: string[]): string | undefined {
  const valid = codes.filter(c => CARE_ICONS[c]);
  return valid.length > 0 ? JSON.stringify(valid) : undefined;
}

export function getEffectiveCareIconCodes(
  careIconCodes?: string,
  legacyCodes?: WashCareCodeSet,
  washInstructions?: string,
): string[] {
  const explicit = parseCareIconCodes(careIconCodes);
  if (explicit.length > 0) return explicit;

  const displayCodes = getDisplayWashCareCodes(legacyCodes, washInstructions);
  const fromLegacy = careCodesFromLegacyFields(displayCodes);
  if (fromLegacy.length > 0) return fromLegacy;

  return DEFAULT_CARE_ICON_CODES;
}
