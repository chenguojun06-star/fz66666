/**
 * 电商平台统一映射工具
 *
 * 后端存在两套编码：
 * - 简写（TB/TM/JD/PDD/DY/XHS/WC/SFY/SY/JST）→ ProductionOrder.ecPlatform / EcSalesRevenue.platform
 * - 全大写（TAOBAO/TMALL/JD/DOUYIN/PINDUODUO/XIAOHONGSHU/WECHAT_SHOP/SHOPIFY/SHEIN/JST）→ EcommerceOrder.sourcePlatformCode
 *
 * 本工具兼容两套编码，统一返回中文标签和颜色。
 */

export interface PlatformTag {
  label: string;
  color: string;
}

/** 简写编码 → { 中文名, 颜色 } */
const SHORT_MAP: Record<string, PlatformTag> = {
  TB:  { label: '淘宝',   color: '#FF4400' },
  TM:  { label: '天猫',   color: '#FF0036' },
  JD:  { label: '京东',   color: '#E1251B' },
  PDD: { label: '拼多多', color: '#E02E24' },
  DY:  { label: '抖音',   color: '#000000' },
  XHS: { label: '小红书', color: '#FF2442' },
  WC:  { label: '微信小店', color: '#07C160' },
  SFY: { label: 'Shopify', color: '#5C6AC4' },
  SY:  { label: '希音',   color: '#FF6B6B' },
  JST: { label: '聚水潭', color: '#E85D04' },
};

/** 全大写编码 → 简写编码 */
const FULL_TO_SHORT: Record<string, string> = {
  TAOBAO: 'TB',
  TMALL: 'TM',
  JD: 'JD',
  PINDUODUO: 'PDD',
  DOUYIN: 'DY',
  XIAOHONGSHU: 'XHS',
  WECHAT_SHOP: 'WC',
  SHOPIFY: 'SFY',
  SHEIN: 'SY',
  JST: 'JST',
};

/** 将任意编码标准化为简写编码 */
export function normalizePlatformCode(code: string | undefined | null): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  if (SHORT_MAP[upper]) return upper;
  if (FULL_TO_SHORT[upper]) return FULL_TO_SHORT[upper];
  return upper;
}

/** 获取平台标签（中文 + 颜色），兼容两套编码 */
export function getPlatformTag(code: string | undefined | null): PlatformTag {
  if (!code) return { label: '未指定', color: '#8c8c8c' };
  const normalized = normalizePlatformCode(code);
  return SHORT_MAP[normalized] || { label: '未知平台', color: '#8c8c8c' };
}

/** 获取平台中文名 */
export function getPlatformName(code: string | undefined | null): string {
  return getPlatformTag(code).label;
}

/** 获取平台筛选下拉选项 */
export function getPlatformOptions() {
  return Object.entries(SHORT_MAP).map(([code, tag]) => ({
    label: tag.label,
    value: code,
  }));
}
