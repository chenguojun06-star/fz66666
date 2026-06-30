/**
 * 通用排序工具函数
 * 遵循原则：左→右、上→下、小→大 自动排列
 */

// 标准尺码顺序（从大到小的数字映射）
const SIZE_ORDER_MAP: Record<string, number> = {
  // 婴儿/儿童尺码
  '55': 10, '60': 11, '65': 12, '70': 13, '75': 14, '80': 15, '85': 16,
  '90': 17, '95': 18, '100': 19, '105': 20, '110': 21, '115': 22, '120': 23, '125': 24, '130': 25,
  // 国际尺码
  'XXS': 30, 'XS': 31, 'S': 32, 'M': 33, 'L': 34, 'XL': 35, 'XXL': 36, 'XXXL': 37, 'XXXXL': 38,
  // 数字尺码
  '26': 40, '27': 41, '28': 42, '29': 43, '30': 44, '31': 45, '32': 46, '33': 47, '34': 48,
  '35': 49, '36': 50, '37': 51, '38': 52, '39': 53, '40': 54, '41': 55, '42': 56, '43': 57,
  '44': 58, '45': 59, '46': 60,
};

/**
 * 获取尺码的排序权重
 * 规则：
 * 1. 如果是数字尺码（如26、27、30），按数字大小排序
 * 2. 如果是字母尺码（如XS、S、M、L、XL），按标准顺序排序
 * 3. 其他情况按字母顺序排序
 */
export const getSizeSortWeight = (size: string): number => {
  const trimmed = String(size || '').trim().toUpperCase();
  if (!trimmed) return 999;

  // 先检查是否有预定义的顺序
  const upperSize = trimmed.toUpperCase();
  if (SIZE_ORDER_MAP[upperSize] !== undefined) {
    return SIZE_ORDER_MAP[upperSize];
  }

  // 尝试解析为数字尺码（如 26、27.5）
  const numericMatch = trimmed.match(/^(\d+(?:\.\d+)?)/);
  if (numericMatch) {
    const num = parseFloat(numericMatch[1]);
    // 数字尺码排在字母尺码之前（权重 1-29）
    if (!isNaN(num)) {
      return Math.round(num * 10) / 10 + 100; // 26 -> 126, 26.5 -> 126.5
    }
  }

  // 其他情况按字母顺序排在最后
  return 200 + trimmed.charCodeAt(0);
};

/**
 * 尺码数组排序（从小到大）
 * 返回一个新数组，不修改原数组
 */
export const sortSizes = (sizes: string[]): string[] => {
  if (!Array.isArray(sizes)) return [];
  return [...sizes].sort((a, b) => {
    const weightA = getSizeSortWeight(a);
    const weightB = getSizeSortWeight(b);
    return weightA - weightB;
  });
};

/**
 * 标准颜色顺序（按字母/常用顺序）
 * 规则：
 * 1. 先按颜色类别排序（白色 → 黑色 → 灰色 → 彩色 → 深色）
 * 2. 同类别按字母顺序排序
 */
const COLOR_CATEGORY_MAP: Record<string, number> = {
  // 中性色
  '白': 10, '米白': 11, '象牙白': 12, '奶白': 13, '珍珠白': 14,
  '黑': 20, '炭黑': 21, '墨黑': 22,
  '灰': 30, '深灰': 31, '浅灰': 32, '中灰': 33, '银灰': 34, '烟灰': 35,
  // 彩色（按色相轮顺序）
  '红': 50, '酒红': 51, '砖红': 52, '枣红': 54, '朱红': 55,
  '橙': 60, '橘红': 61, '橘黄': 62, '珊瑚': 64,
  '黄': 70, '鹅黄': 71, '姜黄': 72, '柠檬黄': 73, '土黄': 74, '卡其': 75,
  '绿': 80, '军绿': 81, '墨绿': 82, '翠绿': 83, '浅绿': 84, '薄荷绿': 85, '荧光绿': 86,
  '青': 90, '青绿': 91, '天青': 92,
  '蓝': 100, '天蓝': 101, '湖蓝': 102, '浅蓝': 103, '宝蓝': 104, '藏蓝': 105, '深蓝': 106, '海军蓝': 107, '雾霾蓝': 108,
  '紫': 110, '紫罗兰': 111, '藕荷': 112, '薰衣草': 113, '香芋紫': 114,
  '粉': 120, '粉色': 121, '浅粉': 122, '藕粉': 123, '裸粉': 124, '玫瑰粉': 125, '西瓜红': 126, '玫红': 127, '桃红': 128,
  '棕': 130, '棕色': 131, '深棕': 132, '浅棕': 133, '驼色': 134, '焦糖': 135, '可可': 136,
  '米': 140, '米色': 141, '杏色': 142, '燕麦': 143,
  // 牛仔色
  '牛仔蓝': 150, '深牛仔': 151, '浅牛仔': 152,
  // 其他
  '花色': 200, '拼色': 201, '撞色': 202, '渐变': 203,
};

/**
 * 获取颜色的排序权重
 * 规则：
 * 1. 先按颜色类别排序（白色 → 黑色 → 灰色 → 彩色 → 深色）
 * 2. 同类别按字母顺序排序
 */
export const getColorSortWeight = (color: string): number => {
  const trimmed = String(color || '').trim();
  if (!trimmed) return 999;

  // 检查是否有预定义的颜色顺序
  const firstChar = trimmed.charAt(0);
  if (COLOR_CATEGORY_MAP[trimmed] !== undefined) {
    return COLOR_CATEGORY_MAP[trimmed];
  }

  // 检查首字匹配
  for (const [key, value] of Object.entries(COLOR_CATEGORY_MAP)) {
    if (trimmed.startsWith(key) || key.startsWith(firstChar)) {
      return value + trimmed.charCodeAt(0) / 1000;
    }
  }

  // 其他情况按字母顺序排在最后
  return 300 + trimmed.localeCompare('', 'zh-CN');
};

/**
 * 颜色数组排序（按标准颜色顺序）
 * 返回一个新数组，不修改原数组
 */
export const sortColors = (colors: string[]): string[] => {
  if (!Array.isArray(colors)) return [];
  return [...colors].sort((a, b) => {
    const weightA = getColorSortWeight(a);
    const weightB = getColorSortWeight(b);
    return weightA - weightB;
  });
};

/**
 * 通用数组排序（按字符串字母顺序，中文优先）
 */
export const sortByLocale = <T>(arr: T[], keyFn: (item: T) => string): T[] => {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const keyA = keyFn(a);
    const keyB = keyFn(b);
    return keyA.localeCompare(keyB, 'zh-CN');
  });
};
