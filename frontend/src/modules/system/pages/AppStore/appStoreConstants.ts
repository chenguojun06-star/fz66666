export interface AppStoreItem {
  id: number;
  appCode: string;
  appName: string;
  appIcon: string;
  appDesc: string;
  category: string;
  priceType: string;
  priceMonthly: number;
  priceYearly: number;
  priceOnce: number;
  isHot: boolean;
  isNew: boolean;
  features: string[];
  trialDays: number;
}

export interface OrderForm {
  subscriptionType: 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'PERPETUAL';
  userCount: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  companyName: string;
  invoiceRequired: boolean;
  invoiceTitle?: string;
  invoiceTaxNo?: string;
}

export const EC_PLATFORM_MAP: Record<string, { code: string; label: string; extraHint: string }> = {
  EC_TAOBAO:      { code: 'TAOBAO',      label: '淘宝',    extraHint: '' },
  EC_TMALL:       { code: 'TMALL',       label: '天猫',    extraHint: '' },
  EC_JD:          { code: 'JD',          label: '京东',    extraHint: '' },
  EC_DOUYIN:      { code: 'DOUYIN',      label: '抖音',    extraHint: '' },
  EC_PINDUODUO:   { code: 'PINDUODUO',   label: '拼多多',  extraHint: '' },
  EC_XIAOHONGSHU: { code: 'XIAOHONGSHU', label: '小红书',  extraHint: '' },
  EC_WECHAT_SHOP: { code: 'WECHAT_SHOP', label: '微信小店', extraHint: '' },
  EC_SHOPIFY:     { code: 'SHOPIFY',     label: 'Shopify', extraHint: '店铺域名，如 mystore.myshopify.com' },
  EC_JST:         { code: 'JST',         label: '聚水潭',  extraHint: '聚水潭开放平台AppKey/AppSecret' },
  EC_DONGFANG:    { code: 'DONGFANG',    label: '东纺纺织',extraHint: '东纺纺织平台API密钥' },
};

export const MODULE_CONFIG: Record<string, { icon: string; color: string; urlHint: string }> = {
  ORDER_SYNC:       { icon: '', color: 'var(--color-primary)', urlHint: '如: https://your-erp.com/api/order-callback' },
  QUALITY_FEEDBACK: { icon: '', color: 'var(--color-success)', urlHint: '如: https://your-system.com/webhook/quality' },
  LOGISTICS_SYNC:   { icon: '', color: 'var(--color-info)',    urlHint: '如: https://your-system.com/webhook/logistics' },
  PAYMENT_SYNC:     { icon: '', color: 'var(--color-warning)', urlHint: '如: https://your-finance.com/api/payment' },
  EC_TAOBAO:      { icon: '', color: '#FF6600', urlHint: '如: https://your-system.com/webhook/taobao' },
  EC_TMALL:       { icon: '', color: '#D40016', urlHint: '如: https://your-system.com/webhook/tmall' },
  EC_JD:          { icon: '', color: '#CC0000', urlHint: '如: https://your-system.com/webhook/jd' },
  EC_DOUYIN:      { icon: '', color: '#161823', urlHint: '如: https://your-system.com/webhook/douyin' },
  EC_PINDUODUO:   { icon: '', color: '#CC2B2B', urlHint: '如: https://your-system.com/webhook/pdd' },
  EC_XIAOHONGSHU: { icon: '', color: '#FF2442', urlHint: '如: https://your-system.com/webhook/xiaohongshu' },
  EC_WECHAT_SHOP: { icon: '', color: '#07C160', urlHint: '如: https://your-system.com/webhook/wechat-shop' },
  EC_SHOPIFY:     { icon: '', color: '#5C6AC4', urlHint: '如: https://your-system.com/webhook/shopify' },
  EC_JST:      { icon: '', color: '#E85D04', urlHint: '如: https://your-system.com/webhook/jst' },
  EC_DONGFANG: { icon: '', color: '#2D6A4F', urlHint: '如: https://your-system.com/webhook/dongfang' },
  CRM_MODULE:  { icon: '', color: 'var(--color-primary)', urlHint: '' },
  FINANCE_TAX: { icon: '', color: 'var(--color-success)', urlHint: '' },
  PROCUREMENT: { icon: '', color: 'var(--color-warning)', urlHint: '' },
};

export const CATEGORY_LABEL_MAP: Record<string, string> = {
  ECOMMERCE: '电商对接',
  CRM: '客户管理',
  FINANCE: '财务',
  SUPPLY_CHAIN: '供应链',
  CORE: '核心对接',
  PRODUCTION: '生产管理',
  WAREHOUSE: '成品管理',
};

export const isEcApp = (appCode: string) => !!EC_PLATFORM_MAP[appCode];

export const parseFeatures = (features: any): string[] => {
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try {
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      if (features.includes(',')) return features.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (features.trim()) return [features];
    }
  }
  return [];
};
