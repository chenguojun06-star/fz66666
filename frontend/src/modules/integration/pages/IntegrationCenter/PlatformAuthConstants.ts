/**
 * D-587 电商平台店铺授权元数据
 *
 * 对标聚水潭「添加店铺」四步向导：选择平台 → 配置引导 → 平台授权 → 完成。
 * oauthSupported=true 的平台支持「点一下跳平台授权」（OAuth 自用型应用），
 * 其余平台走手工凭证接入（CREDENTIAL 模式）。
 *
 * guide 每一步尽量写清：在哪个网站、点哪个菜单、key 在页面哪个位置、回调地址填到哪里。
 * link 为该步可直接打开的入口（平台控制台地址可能随官方改版调整，以实际界面为准）。
 */

export type PlatformAuthGroup = '国内平台' | '跨境平台' | 'ERP中转';

export interface PlatformGuideStep {
  /** 这一步要做什么（含在哪点、key 在哪看） */
  text: string;
  /** 这一步可直接打开的页面入口 */
  link?: string;
  linkLabel?: string;
}

export interface PlatformAuthMeta {
  code: string;
  name: string;
  group: PlatformAuthGroup;
  oauthSupported: boolean;
  /** 平台开放平台控制台地址（创建自用型应用用） */
  consoleUrl: string;
  /** 创建自用型应用 + 配置回调 + 拿密钥的分步引导 */
  guide: PlatformGuideStep[];
  /** 授权动作说明（谁、在哪点、用什么账号） */
  authorizeHint: string;
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
      {
        text: '用拼多多店铺主账号（或绑定的管理员账号）登录拼多多开放平台',
        link: 'https://open.pinduoduo.com',
        linkLabel: '打开拼多多开放平台',
      },
      {
        text: '顶部菜单点「应用列表」→ 点「创建应用」：应用类型务必选「自用型应用」（免费、只授权自己的店铺、不用平台审核），应用名随意（如"服装ERP对接"）',
      },
      {
        text: '创建完成后进入应用详情页：页面顶部直接展示 client_id（=AppKey）和 client_secret（=AppSecret），两条都复制填到本页下方表单',
      },
      {
        text: '在应用详情左侧菜单点「授权回调地址」（有的版本叫"重定向URL"）：把下一步展示给您的回调地址原样粘贴保存',
      },
      {
        text: '在应用详情左侧点「店铺授权 / 绑定店铺」：搜索并绑定您自己的店铺（自用型应用只能绑自己的店）',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 会弹出拼多多登录页 → 用店铺主账号登录并点「确认授权」→ 页面自动跳回系统，显示授权成功',
    faq: [
      { q: '订购聚水潭那种 1000 元/店/年需要吗？', a: '不需要。那是 ISV 授权型应用（聚水潭模式）的费用；我们走商家自用型应用，免费创建、只授权自己的店铺。' },
      { q: 'client_secret 看不到怎么办？', a: '部分平台密钥默认隐藏，点「查看/显示」并输入验证码即可；拼多多创建后完整展示一次，请当场复制保存。' },
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
      {
        text: '用抖店主账号登录抖店开放平台（open.jinritemai.com）',
        link: 'https://open.jinritemai.com',
        linkLabel: '打开抖店开放平台',
      },
      {
        text: '顶部「应用中心」→「创建应用」：类型选「自用型应用」，填写应用名称即可',
      },
      {
        text: '创建后进入应用详情：页面「密钥信息」区域展示 App Key（=client_key）和 App Secret，复制填到本页表单',
      },
      {
        text: '在应用详情「安全设置」里找到「回调地址 / 重定向URL」：粘贴下一步展示给您的回调地址并保存',
      },
      {
        text: '在应用详情点「店铺绑定」：把创建的应用绑定到自己的抖店',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 弹出抖店授权页 → 用店铺主账号确认 → 自动跳回系统',
    faq: [
      { q: '自用型应用要审核吗？', a: '自用型应用创建即用，只服务绑定的店铺，不走应用市场审核。' },
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
      {
        text: '用淘宝店铺主账号登录淘宝开放平台',
        link: 'https://open.taobao.com',
        linkLabel: '打开淘宝开放平台',
      },
      {
        text: '进入「控制台」→「应用管理」→「创建应用」：场景选「商家自用」，应用名称随意',
      },
      {
        text: '创建后进入应用详情：「AppKey」直接展示；「AppSecret」点「查看」并完成短信验证后复制，两条都填到本页表单',
      },
      {
        text: '在应用详情的「回调地址URL」配置项：粘贴下一步展示给您的回调地址并保存',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 弹出淘宝授权页 → 用店铺主账号点「确认授权」→ 自动跳回系统',
    faq: [
      { q: '天猫店铺能用吗？', a: '可以。天猫在平台列表有单独入口，同样在淘宝开放平台创建自用型应用。' },
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
      {
        text: '用天猫店铺主账号登录淘宝开放平台（天猫与淘宝共用一个开放平台）',
        link: 'https://open.taobao.com',
        linkLabel: '打开淘宝开放平台',
      },
      {
        text: '「控制台」→「应用管理」→「创建应用」，场景选「商家自用」',
      },
      {
        text: '应用详情里复制 AppKey，AppSecret 点「查看」完成短信验证后复制，填到本页表单',
      },
      {
        text: '配置「回调地址URL」为下一步展示的回调地址',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 用天猫店铺主账号登录并确认授权 → 自动跳回系统',
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
      {
        text: '用京东店铺主账号登录京东开放平台',
        link: 'https://open.jd.com',
        linkLabel: '打开京东开放平台',
      },
      {
        text: '顶部「我的应用」→「创建应用」：接入方式选「自用型」，业务方向勾「商品/订单」相关',
      },
      {
        text: '创建后在应用列表点进详情：AppKey 和 App Secret 直接展示，复制填到本页表单',
      },
      {
        text: '在应用详情「授权设置」里找到「授权回调地址」：粘贴下一步展示的回调地址并保存',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 弹出京东授权页 → 用店铺主账号确认 → 自动跳回系统',
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
      {
        text: '用快手小店主账号登录快手电商开放平台',
        link: 'https://open.kwaixiaodon.com',
        linkLabel: '打开快手电商开放平台',
      },
      {
        text: '「应用管理」→「创建应用」：类型选「自用型应用」',
      },
      {
        text: '创建后在应用详情复制 client_id（AppKey）和 client_secret（AppSecret），填到本页表单',
      },
      {
        text: '在「回调地址」配置项粘贴下一步展示的回调地址；并在应用里绑定自己的快手小店',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 用快手店铺主账号确认 → 自动跳回系统',
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
      {
        text: '用小红书店铺主账号登录小红书商家开放平台（ARK）',
        link: 'https://ark.xiaohongshu.com',
        linkLabel: '打开小红书商家开放平台',
      },
      {
        text: '「开发服务」→「应用管理」→「创建应用」：选自用型',
      },
      {
        text: '创建后在应用详情复制 AppKey 和 AppSecret，填到本页表单',
      },
      {
        text: '在「回调地址」配置项粘贴下一步展示的回调地址并保存',
      },
    ],
    authorizeHint: '回到本向导点「去平台授权」→ 用小红书店铺主账号确认 → 自动跳回系统',
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
      {
        text: '微信小店不走跳转授权：登录微信小店后台，在「店铺 → 开放接口/API」申请开通 API 权限',
      },
      {
        text: '开通后在同一页面生成「调用凭证（API Key）」，复制填到本页 AppKey；如有 Secret 一并填写',
      },
      {
        text: '保存后即完成接入，订单由微信侧推送到系统',
      },
    ],
    authorizeHint: '无需跳转授权：粘贴店铺后台生成的 API 密钥保存即完成',
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
      {
        text: '登录 Shopify 店铺后台：左下「设置 Settings」→「应用和销售渠道 Apps and sales channels」→「开发应用 Develop apps」→「创建应用」',
      },
      {
        text: '进入应用「配置 Configuration」→ 勾选 Admin API 权限：read_orders、write_orders、read_products、write_inventory → 保存',
      },
      {
        text: '点「安装 Install app」→ 在「API 凭据」页复制 Admin API access token（只显示这一次，务必当场保存）',
      },
      {
        text: '把 access token 填到本页 AppKey，店铺域名（如 xxx.myshopify.com，不带 https）填到 AppSecret 栏并在店铺名称备注域名',
      },
    ],
    authorizeHint: '无需跳转授权：Shopify 自定义应用在后台安装时即完成授权，拿到 access token 填入即可',
    faq: [
      { q: '店铺域名填哪里？', a: '填 xxx.myshopify.com（不带 https），系统会用它拼接 API 地址。' },
      { q: 'token 为什么只显示一次？', a: 'Shopify 的 Admin API token 安装后只完整展示一次，丢了只能重新卸载安装生成。' },
    ],
  },
  {
    code: 'SHEIN',
    name: '希音',
    group: '跨境平台',
    oauthSupported: false,
    consoleUrl: 'https://open.shein.com',
    guide: [
      {
        text: 'SHEIN 开放平台权限按供应商资质开通：先在商家对接群/客户经理处申请开通开放平台账号',
      },
      {
        text: '开通后在 SHEIN 开放平台「应用管理」创建应用，复制 AppKey / AppSecret 填到本页',
      },
    ],
    authorizeHint: '无需跳转授权：按 SHEIN 侧开通的密钥直填即可',
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
      {
        text: '适合店铺已经授权在聚水潭里的商家：走聚水潭中转，零平台开发，订单自动进来',
        link: 'https://open.jushuitan.com',
        linkLabel: '打开聚水潭开放平台',
      },
      {
        text: '登录聚水潭开放平台 →「应用管理」→「创建应用」，拿到 app_key 和 app_secret 填到本页',
      },
      {
        text: '保存后系统会自动发现您在聚水潭里已授权的店铺，并每 15 分钟自动拉取新订单',
      },
    ],
    authorizeHint: '无需跳转授权：填聚水潭开放平台凭证即可，店铺授权关系沿用聚水潭里已有的',
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
