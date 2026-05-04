/** 平台元数据 */
export interface PlatformMeta {
  code: string;
  appStoreCode: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  syncMode: 'pull' | 'webhook' | 'both';
  features: string[];
  docUrl: string;
  monthlyPrice: number;
}

export const PLATFORM_LIST: PlatformMeta[] = [
  {
    code: 'JST',
    appStoreCode: 'EC_JST',
    name: '聚水潭',
    desc: '电商ERP中台，聚合淘宝/京东/拼多多等多平台订单',
    icon: 'cloud',
    color: '#E85D04',
    syncMode: 'pull',
    features: ['多平台订单聚合', '自动店铺发现', '客户归集', '物流自动回传'],
    docUrl: 'https://open.jushuitan.com',
    monthlyPrice: 299,
  },
  {
    code: 'DONGFANG',
    appStoreCode: 'EC_DONGFANG',
    name: '东纺纺织',
    desc: '纺织面料B2B平台，面料采购与供应链协同',
    icon: 'shop',
    color: '#2D6A4F',
    syncMode: 'webhook',
    features: ['面料产品同步', '供应商对接', '采购订单', '库存联动'],
    docUrl: '',
    monthlyPrice: 199,
  },
  {
    code: 'TAOBAO',
    appStoreCode: 'EC_TAOBAO',
    name: '淘宝',
    desc: '淘宝平台订单与物流对接',
    icon: 'tb',
    color: '#FF6600',
    syncMode: 'webhook',
    features: ['订单导入', '库存同步', '物流回传'],
    docUrl: 'https://open.taobao.com',
    monthlyPrice: 149,
  },
  {
    code: 'DOUYIN',
    appStoreCode: 'EC_DOUYIN',
    name: '抖音',
    desc: '抖音小店直播带货订单管理',
    icon: 'dy',
    color: '#161823',
    syncMode: 'webhook',
    features: ['订单导入', '直播订单', '物流回传'],
    docUrl: 'https://open.douyin.com',
    monthlyPrice: 299,
  },
  {
    code: 'JD',
    appStoreCode: 'EC_JD',
    name: '京东',
    desc: '京东平台实时同步订单与物流',
    icon: 'jd',
    color: '#CC0000',
    syncMode: 'webhook',
    features: ['订单同步', '物流跟踪', '库存管理'],
    docUrl: 'https://open.jd.com',
    monthlyPrice: 249,
  },
  {
    code: 'TMALL',
    appStoreCode: 'EC_TMALL',
    name: '天猫',
    desc: '天猫旗舰店品牌订单管理',
    icon: 'tm',
    color: '#D40016',
    syncMode: 'webhook',
    features: ['订单导入', '库存同步', '退换货管理'],
    docUrl: 'https://open.taobao.com',
    monthlyPrice: 199,
  },
  {
    code: 'PINDUODUO',
    appStoreCode: 'EC_PINDUODUO',
    name: '拼多多',
    desc: '拼多多批量订单处理与发货',
    icon: 'pdd',
    color: '#CC2B2B',
    syncMode: 'webhook',
    features: ['订单导入', '批量发货', '库存同步'],
    docUrl: 'https://open.pinduoduo.com',
    monthlyPrice: 149,
  },
  {
    code: 'XIAOHONGSHU',
    appStoreCode: 'EC_XIAOHONGSHU',
    name: '小红书',
    desc: '小红书商城内容种草订单管理',
    icon: 'xhs',
    color: '#FF2442',
    syncMode: 'webhook',
    features: ['订单管理', '笔记联动', '库存同步'],
    docUrl: 'https://open.xiaohongshu.com',
    monthlyPrice: 199,
  },
  {
    code: 'WECHAT_SHOP',
    appStoreCode: 'EC_WECHAT_SHOP',
    name: '微信小店',
    desc: '微信小店与视频号私域订单管理',
    icon: 'wx',
    color: '#07C160',
    syncMode: 'webhook',
    features: ['订单同步', '私域管理', '客户管理'],
    docUrl: 'https://developers.weixin.qq.com',
    monthlyPrice: 149,
  },
  {
    code: 'SHOPIFY',
    appStoreCode: 'EC_SHOPIFY',
    name: 'Shopify',
    desc: 'Shopify独立站跨境订单管理',
    icon: 'sf',
    color: '#5C6AC4',
    syncMode: 'webhook',
    features: ['订单同步', '多币种', '物流对接'],
    docUrl: 'https://shopify.dev',
    monthlyPrice: 299,
  },
];

/** 获取平台 meta */
export function getPlatformMeta(code: string): PlatformMeta | undefined {
  return PLATFORM_LIST.find(p => p.code === code);
}

/** 同步模式中文 */
export const SYNC_MODE_LABELS: Record<string, string> = {
  pull: '主动拉取',
  webhook: 'Webhook推送',
  both: '双向同步',
};
