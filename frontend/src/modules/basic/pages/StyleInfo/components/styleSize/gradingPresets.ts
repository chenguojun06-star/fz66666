/**
 * 服装放码规则预设库
 * 
 * 数据来源：
 * - ISO 8559 服装尺寸标准
 * - 中国 GB/T 1335 服装号型标准
 * - 行业通用放码规则（Gerber/Lectra CAD 系统标准）
 * - 上海/广东服装行业协会推荐放码量
 * 
 * 所有数值单位：厘米(cm)，为每码（相邻尺码间）的跳码量
 */

/** 部位放码规则 */
export type PartGradingRule = {
  /** 部位名称关键词（用于模糊匹配） */
  keywords: string[];
  /** 上装每码跳码量(cm) */
  topStep: number;
  /** 下装每码跳码量(cm) */
  bottomStep: number;
  /** 连衣裙每码跳码量(cm) */
  dressStep: number;
  /** 外套每码跳码量(cm) */
  outerwearStep: number;
  /** 备注 */
  note?: string;
};

/** 放码预设模板 */
export type GradingPreset = {
  key: string;
  label: string;
  category: 'top' | 'bottom' | 'dress' | 'outerwear';
  description: string;
  /** 各部位默认跳码量映射 */
  partSteps: Record<string, number>;
};

/**
 * 行业标准部位放码量
 * 每码（相邻尺码间）的跳码量，单位 cm
 * 
 * 规则来源：
 * - 胸围/臀围：每码 +2cm（半围 +1cm）
 * - 腰围：每码 +1.5~2cm
 * - 肩宽：每码 +1~1.2cm
 * - 衣长/裤长：每码 +1~1.5cm
 * - 袖长：每码 +0.8~1.2cm
 * - 领围：每码 +0.5~0.8cm
 * - 袖口/脚口：每码 +0.5~0.8cm
 */
export const PART_GRADING_RULES: PartGradingRule[] = [
  // === 上装主要部位 ===
  { keywords: ['衣长', '后中长', '前衣长', '后衣长', '中长'], topStep: 1.0, bottomStep: 0, dressStep: 1.5, outerwearStep: 1.5, note: '衣长随码数增长1cm' },
  { keywords: ['胸围', '胸宽', '半胸围'], topStep: 2.0, bottomStep: 0, dressStep: 2.0, outerwearStep: 2.0, note: '围度类放码最大' },
  { keywords: ['肩宽', '肩部', '总肩宽'], topStep: 1.0, bottomStep: 0, dressStep: 1.0, outerwearStep: 1.2, note: '肩宽增长较围度慢' },
  { keywords: ['袖长', '长袖长', '短袖长'], topStep: 0.8, bottomStep: 0, dressStep: 0.8, outerwearStep: 1.0, note: '袖长比衣长增长慢' },
  { keywords: ['袖窿', '袖笼', '夹圈', '挂肩'], topStep: 0.6, bottomStep: 0, dressStep: 0.6, outerwearStep: 0.8, note: '袖窿深与宽同步增长' },
  { keywords: ['领围', '领宽', '领口', '领深'], topStep: 0.5, bottomStep: 0, dressStep: 0.5, outerwearStep: 0.6, note: '颈部变化最小' },
  { keywords: ['袖口', '袖肥', '袖宽'], topStep: 0.6, bottomStep: 0, dressStep: 0.6, outerwearStep: 0.8, note: '袖口随臂围增长' },
  { keywords: ['下摆', '摆围', '衣摆'], topStep: 1.5, bottomStep: 0, dressStep: 2.0, outerwearStep: 2.0, note: '下摆与胸围接近' },
  { keywords: ['前胸宽', '后背宽'], topStep: 0.8, bottomStep: 0, dressStep: 0.8, outerwearStep: 1.0, note: '前后宽比胸围增长慢' },

  // === 下装主要部位 ===
  { keywords: ['腰围', '裤腰', '腰头'], topStep: 0, bottomStep: 1.5, dressStep: 1.5, outerwearStep: 0, note: '腰围增长比臀围慢' },
  { keywords: ['臀围', '坐围'], topStep: 0, bottomStep: 2.0, dressStep: 2.0, outerwearStep: 0, note: '臀围是下装最大增量' },
  { keywords: ['裤长', '裙长', '外长', '外侧长'], topStep: 0, bottomStep: 1.2, dressStep: 1.5, outerwearStep: 0, note: '裤长每码增长1.2cm' },
  { keywords: ['内长', '股下', '裆长', '横裆'], topStep: 0, bottomStep: 0.8, dressStep: 0, outerwearStep: 0, note: '内长增长较慢' },
  { keywords: ['大腿围', '腿围', '横档'], topStep: 0, bottomStep: 1.0, dressStep: 0, outerwearStep: 0, note: '大腿围增长中等' },
  { keywords: ['脚口', '裤脚', '裤口'], topStep: 0, bottomStep: 0.5, dressStep: 0, outerwearStep: 0, note: '脚口变化最小' },
  { keywords: ['前裆', '前浪', '前 rise'], topStep: 0, bottomStep: 0.4, dressStep: 0, outerwearStep: 0, note: '前裆微调' },
  { keywords: ['后裆', '后浪', '后 rise'], topStep: 0, bottomStep: 0.5, dressStep: 0, outerwearStep: 0, note: '后裆比前裆略大' },

  // === 通用部位 ===
  { keywords: ['袋口', '口袋'], topStep: 0.3, bottomStep: 0.3, dressStep: 0.3, outerwearStep: 0.3, note: '口袋微调' },
];

/**
 * 预设放码模板
 * 基于行业标准的完整放码方案
 */
export const GRADING_PRESETS: GradingPreset[] = [
  {
    key: 'top-standard',
    label: '上装标准放码',
    category: 'top',
    description: '适用于T恤、衬衫、卫衣等常规上装，基准码M，每码等差放码',
    partSteps: {
      '衣长': 1.0, '胸围': 2.0, '肩宽': 1.0, '袖长': 0.8,
      '袖窿': 0.6, '领围': 0.5, '袖口': 0.6, '下摆': 1.5,
      '前胸宽': 0.8, '后背宽': 0.8,
    },
  },
  {
    key: 'top-relaxed',
    label: '上装宽松放码',
    category: 'top',
    description: '适用于宽松版型上装，围度放码量略大',
    partSteps: {
      '衣长': 1.2, '胸围': 2.5, '肩宽': 1.2, '袖长': 1.0,
      '袖窿': 0.8, '领围': 0.5, '袖口': 0.8, '下摆': 2.0,
      '前胸宽': 1.0, '后背宽': 1.0,
    },
  },
  {
    key: 'bottom-standard',
    label: '下装标准放码',
    category: 'bottom',
    description: '适用于西裤、休闲裤等常规下装',
    partSteps: {
      '腰围': 1.5, '臀围': 2.0, '裤长': 1.2, '内长': 0.8,
      '大腿围': 1.0, '脚口': 0.5, '前裆': 0.4, '后裆': 0.5,
    },
  },
  {
    key: 'bottom-relaxed',
    label: '下装宽松放码',
    category: 'bottom',
    description: '适用于阔腿裤、哈伦裤等宽松版型下装',
    partSteps: {
      '腰围': 1.5, '臀围': 2.5, '裤长': 1.2, '内长': 0.8,
      '大腿围': 1.5, '脚口': 1.0, '前裆': 0.5, '后裆': 0.6,
    },
  },
  {
    key: 'dress-standard',
    label: '连衣裙标准放码',
    category: 'dress',
    description: '适用于常规连衣裙，上下装结合放码',
    partSteps: {
      '衣长': 1.5, '胸围': 2.0, '腰围': 1.5, '臀围': 2.0,
      '肩宽': 1.0, '袖长': 0.8, '袖窿': 0.6, '领围': 0.5,
      '下摆': 2.0, '裙长': 1.5,
    },
  },
  {
    key: 'outerwear-standard',
    label: '外套标准放码',
    category: 'outerwear',
    description: '适用于夹克、风衣、大衣等外套，放码量比上装略大',
    partSteps: {
      '衣长': 1.5, '胸围': 2.0, '肩宽': 1.2, '袖长': 1.0,
      '袖窿': 0.8, '领围': 0.6, '袖口': 0.8, '下摆': 2.0,
      '前胸宽': 1.0, '后背宽': 1.0,
    },
  },
];

/**
 * 根据部位名称自动匹配行业推荐跳码量
 * @param partName 部位名称（如"胸围"、"衣长"等）
 * @param category 服装品类
 * @returns 推荐跳码量(cm)，未匹配返回 null
 */
export const matchPartStep = (
  partName: string,
  category: 'top' | 'bottom' | 'dress' | 'outerwear',
): number | null => {
  const normalized = partName.trim().toLowerCase();
  for (const rule of PART_GRADING_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(normalized)) {
        switch (category) {
          case 'top': return rule.topStep || null;
          case 'bottom': return rule.bottomStep || null;
          case 'dress': return rule.dressStep || null;
          case 'outerwear': return rule.outerwearStep || null;
        }
      }
    }
  }
  return null;
};

/**
 * 根据预设模板批量匹配部位跳码量
 * @param partNames 部位名称列表
 * @param presetKey 预设模板 key
 * @returns 部位名 → 跳码量 的映射
 */
export const matchPresetSteps = (
  partNames: string[],
  presetKey: string,
): Record<string, number> => {
  const preset = GRADING_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return {};

  const result: Record<string, number> = {};
  for (const partName of partNames) {
    // 先精确匹配预设中的部位名
    if (preset.partSteps[partName] !== undefined) {
      result[partName] = preset.partSteps[partName];
      continue;
    }
    // 模糊匹配
    const normalized = partName.trim().toLowerCase();
    let matched = false;
    for (const [key, step] of Object.entries(preset.partSteps)) {
      if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
        result[partName] = step;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 使用行业规则库匹配
      const autoStep = matchPartStep(partName, preset.category);
      if (autoStep !== null) {
        result[partName] = autoStep;
      }
    }
  }
  return result;
};

/**
 * 根据部位名称列表自动推断服装品类
 * 通过关键词判断是上装/下装/连衣裙/外套
 */
export const inferCategory = (partNames: string[]): 'top' | 'bottom' | 'dress' | 'outerwear' => {
  const joined = partNames.join(' ').toLowerCase();
  const hasTopKeywords = ['胸围', '肩宽', '袖长', '袖窿', '领围', '衣长'].some((k) => joined.includes(k));
  const hasBottomKeywords = ['腰围', '臀围', '裤长', '内长', '脚口', '大腿围'].some((k) => joined.includes(k));
  const hasDressKeywords = ['裙长', '连衣裙', '下摆'].some((k) => joined.includes(k));

  if (hasDressKeywords && hasTopKeywords) return 'dress';
  if (hasTopKeywords && hasBottomKeywords) return 'dress';
  if (hasBottomKeywords && !hasTopKeywords) return 'bottom';
  if (hasTopKeywords) return 'top';
  return 'top'; // 默认上装
};
