/**
 * D-587 电商平台店铺授权元数据
 *
 * 对标聚水潭「添加店铺」四步向导：选择平台 → 配置引导 → 平台授权 → 授权完成。
 * oauthSupported=true 的平台支持「点一下跳平台授权」（OAuth 自用型应用），
 * 其余平台走手工凭证接入（CREDENTIAL 模式）。
 */

export type PlatformAuthGroup = '国内平台' | '跨境平台' | 'ERP中转';

export interface PlatformAuthMeta {
  code: string;
  name: string;
  group: PlatformAuthGroup;
  oauthSupported: boolean;
  /** 平台开放平台控制台地址（创建自用型应用用） */
  consoleUrl: string;
  /** 创建自用型应用 + 配置回调的分步引导 */
  guide: string[];
  /** 常见问题（问/答对） */
  faq: Array<{ q: string; a: string }>;
}

export const PLATFORM_AUTH_LIST: PlatformAuthMeta[] = [
  {
    code: 'PINDUODUO',
    name: '拼多多',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://open.pinduoduo.com',
    guide: [
      '登录拼多多开放平台，进入「应用列表 → 创建应用」，应用类型选「自用型应用」（免费，只授权自己的店铺）',
      '创建后绑定自己的店铺，在应用详情里复制 client_id（AppKey）和 client_secret（AppSecret）填到本页',
      '在应用详情的「回调地址」中填入系统下一步展示的授权回调地址',
      '回到本向导点「去平台授权」，用店铺主账号登录并确认，授权成功后自动返回',
    ],
    faq: [
      { q: '订购聚水潭那种 1000 元/店/年需要吗？', a: '不需要。那是 ISV 授权型应用（聚水潭模式）的费用；我们走商家自用型应用，免费创建、只授权自己的店铺。' },
      { q: '为什么按线上单号拉取不到售后单？', a: '拼多多不支持按线上单号拉取售后单，售后单请按店铺维度同步。' },
      { q: '订单进入系统的及时性？', a: '平台订单生成后，99.9% 在 10 秒内进入系统，剩余 5~20 分钟内到达。' },
      { q: '授权会过期吗？', a: '会。访问令牌到期前系统会用刷新令牌自动续期，无需人工操作；刷新令牌失效时页面会提示重新授权。' },
    ],
  },
  {
    code: 'DOUYIN',
    name: '抖店',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://open.jinritemai.com',
    guide: [
      '登录抖店开放平台，进入「应用中心 → 创建应用」，类型选「自用型应用」',
      '在应用详情绑定自己的店铺，复制 App Key（client_key）和 App Secret 填到本页',
      '在「安全设置 → 回调地址」中填入系统下一步展示的授权回调地址',
      '回到本向导点「去平台授权」，用店铺主账号确认授权',
    ],
    faq: [
      { q: '自用型应用要审核吗？', a: '自用型应用创建即用，只服务绑定店铺，不走应用市场审核。' },
      { q: '支持直播带货订单吗？', a: '支持。抖店订单统一进系统，含直播、短视频、商品卡渠道。' },
      { q: '授权失效了怎么办？', a: '刷新令牌失效时页面会提示，重新点一次「去平台授权」即可，数据不受影响。' },
    ],
  },
  {
    code: 'TAOBAO',
    name: '淘宝',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://open.taobao.com',
    guide: [
      '登录淘宝开放平台（千牛账号），进入「控制台 → 应用管理 → 创建应用」，选「自用型应用」',
      '创建后复制 AppKey 和 AppSecret 填到本页',
      '在应用详情配置「回调地址URL」为系统下一步展示的授权回调地址',
      '回到本向导点「去平台授权」，用店铺主账号授权',
    ],
    faq: [
      { q: '天猫店铺能用吗？', a: '可以。天猫选择平台时单独有入口，同样走自用型应用授权。' },
      { q: '历史订单能拉多少？', a: '平台接口限制最多拉取近 30 天历史订单，之后的订单自动实时同步。' },
    ],
  },
  {
    code: 'TMALL',
    name: '天猫',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://open.taobao.com',
    guide: [
      '登录淘宝开放平台（天猫主账号），创建「自用型应用」',
      '复制 AppKey/AppSecret 填到本页，并配置回调地址',
      '回到本向导点「去平台授权」完成授权',
    ],
    faq: [
      { q: '和淘宝是同一个开放平台吗？', a: '是。天猫应用在淘宝开放平台创建，流程与淘宝一致。' },
    ],
  },
  {
    code: 'JD',
    name: '京东',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://open.jd.com',
    guide: [
      '登录京东开放平台（商家账号），进入「我的应用 → 创建应用」，接入方式选「自用型」',
      '复制 AppKey 和 AppSecret 填到本页',
      '在应用详情配置「授权回调地址」为系统下一步展示的地址',
      '回到本向导点「去平台授权」完成授权',
    ],
    faq: [
      { q: '京东POP和自营都支持吗？', a: 'POP店铺走自用型应用授权；自营（厂直）订单请联系客服评估对接方式。' },
    ],
  },
  {
    code: 'KUAISHOU',
    name: '快手小店',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://open.kwaixiaodon.com',
    guide: [
      '登录快手电商开放平台，创建「自用型应用」并绑定店铺',
      '复制 client_id / client_secret 填到本页',
      '配置授权回调地址后，回向导点「去平台授权」',
    ],
    faq: [
      { q: '快手磁力/聚幅渠道订单包含吗？', a: '快手小店订单统一同步，渠道字段会随订单一起进来。' },
    ],
  },
  {
    code: 'XIAOHONGSHU',
    name: '小红书',
    group: '国内平台',
    oauthSupported: true,
    consoleUrl: 'https://ark.xiaohongshu.com',
    guide: [
      '登录小红书商家开放平台，创建「自用型应用」',
      '复制 AppKey / AppSecret 填到本页',
      '配置回调地址后，回向导点「去平台授权」',
    ],
    faq: [
      { q: '笔记带货订单支持吗？', a: '支持，小红书全渠道订单统一进入系统。' },
    ],
  },
  {
    code: 'WECHAT_SHOP',
    name: '微信小店',
    group: '国内平台',
    oauthSupported: false,
    consoleUrl: 'https://developers.weixin.qq.com',
    guide: [
      '登录微信小商店后台，在「店铺 → API配置」开启 API 并生成 ApIv2 密钥',
      '将 AppKey/密钥填到本页保存即可（微信小店不走跳转授权）',
    ],
    faq: [
      { q: '为什么微信小店没有「去授权」按钮？', a: '微信小店的 API 体系不使用 OAuth 跳转授权，直接用店铺后台生成的密钥即可，安全等价。' },
    ],
  },
  {
    code: 'SHOPIFY',
    name: 'Shopify',
    group: '跨境平台',
    oauthSupported: false,
    consoleUrl: 'https://shopify.dev',
    guide: [
      '在 Shopify 后台「设置 → 应用和销售渠道」创建自定义应用',
      '授予订单/物流权限后，把 Admin API access token 与店铺域名填到本页',
    ],
    faq: [
      { q: '店铺域名填哪里？', a: '填 xxx.myshopify.com（不带 https），系统会用它拼接授权与回调地址。' },
    ],
  },
  {
    code: 'SHEIN',
    name: '希音',
    group: '跨境平台',
    oauthSupported: false,
    consoleUrl: 'https://open.shein.com',
    guide: [
      '联系 SHEIN 商家对接群开通开放平台权限',
      '获取供应商 AppKey/Secret 后填到本页',
    ],
    faq: [
      { q: '开通要多久？', a: 'SHEIN 开放平台权限按供应商资质开通，一般 3~5 个工作日。' },
    ],
  },
  {
    code: 'JST',
    name: '聚水潭',
    group: 'ERP中转',
    oauthSupported: false,
    consoleUrl: 'https://open.jushuitan.com',
    guide: [
      '如果店铺已经授权在聚水潭里，可直接走聚水潭中转：零平台开发，订单由聚水潭推送/我们定时拉取',
      '登录聚水潭开放平台创建应用，把 app_key/app_secret 填到本页',
    ],
    faq: [
      { q: '已经用聚水潭了还要接平台吗？', a: '不用。聚水潭通道会把多平台订单统一带进来，这也是最快的上手方式。' },
      { q: '两条通道会重复吗？', a: '系统按平台订单号幂等去重，同单只入一次。' },
    ],
  },
];

export const PLATFORM_AUTH_BY_CODE: Record<string, PlatformAuthMeta> = Object.fromEntries(
  PLATFORM_AUTH_LIST.map((p) => [p.code, p]),
);

export const PLATFORM_GROUPS: PlatformAuthGroup[] = ['国内平台', '跨境平台', 'ERP中转'];
