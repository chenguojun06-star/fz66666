// 凭证获取教程内容
export const PLATFORM_HELP_TIPS: Record<string, { openUrl: string; tip: string }> = {
  JST: { openUrl: 'https://open.jushuitan.com', tip: '在聚水潭开放平台创建应用，获取 AppKey 和 AppSecret' },
  TAOBAO: { openUrl: 'https://open.taobao.com', tip: '在淘宝开放平台创建自用型应用，获取 AppKey 和 AppSecret' },
  TMALL: { openUrl: 'https://open.taobao.com', tip: '天猫与淘宝共用开放平台，创建应用获取凭证' },
  DOUYIN: { openUrl: 'https://open.douyin.com', tip: '在抖音开放平台创建应用，获取 AppKey 和 AppSecret' },
  PINDUODUO: { openUrl: 'https://open.pinduoduo.com', tip: '在拼多多开放平台创建应用，client_id 作为 AppKey' },
  JD: { openUrl: 'https://open.jd.com', tip: '在京东开放平台创建应用，获取 AppKey 和 AppSecret' },
  XIAOHONGSHU: { openUrl: 'https://open.xiaohongshu.com', tip: '在小红书开放平台创建应用，获取凭证' },
  WECHAT_SHOP: { openUrl: 'https://developers.weixin.qq.com', tip: '在微信小店后台获取 AppID 和 AppSecret' },
  SHOPIFY: { openUrl: 'https://shopify.dev', tip: '在 Shopify 后台创建私有应用，获取 API Key 和 Password' },
  SHEIN: { openUrl: 'https://open.shein.com', tip: '在希音开放平台创建应用，获取 AppKey 和 AppSecret' },
};
