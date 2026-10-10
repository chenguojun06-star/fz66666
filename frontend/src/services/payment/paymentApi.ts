import api from '@/utils/api';

/**
 * 收款设置（商家自己的微信/支付宝商户参数）。
 *
 * 资金合规前提：微信/支付宝商户号是企业资质，资金结算到该企业账户。
 * 平台用一个商户号代收所有商家的钱再转付属于「二清」（无《支付业务许可证》
 * 属非法经营），所以每个商家必须配置**自己的**商户号，平台只做技术通道。
 *
 * 密钥类字段（私钥/公钥/APIv3 密钥）**后端绝不回传**，这里只拿"是否已设置"；
 * 要改就整段重填，留空表示保持原值。
 */

export interface PaymentChannelStatus {
  channel: 'ALIPAY' | 'WECHAT_PAY';
  channelName: string;
  /** 是否已保存过配置 */
  configured: boolean;
  /** 是否已启用 */
  enabled: boolean;
  /** 参数是否完整（启用且齐全才能真的收款） */
  usable: boolean;
  appId?: string | null;
  mchId?: string | null;
  serialNo?: string | null;
  notifyUrl?: string | null;
  sandbox?: boolean;
  /** 密钥是否已设置（不回传内容） */
  privateKeySet?: boolean;
  publicKeySet?: boolean;
  apiV3KeySet?: boolean;
  /** 最近一次连通性验证通过时间 */
  verifiedTime?: string | null;
  /** 缺什么（可读提示） */
  missingHint?: string;
  /** 建议的回调地址（相对路径，商家按自己的域名拼） */
  notifyUrlSuggestion?: string;
}

export interface PaymentConfigStatus {
  channels: PaymentChannelStatus[];
  anyReady: boolean;
  tenantId: number;
}

export interface PaymentChannelReadiness {
  ALIPAY?: boolean;
  WECHAT_PAY?: boolean;
}

export interface PaymentSaveBody {
  enabled?: boolean;
  appId?: string;
  mchId?: string;
  serialNo?: string;
  /** 留空 = 保持原值；传 "-" = 清空 */
  privateKey?: string;
  publicKey?: string;
  apiV3Key?: string;
  notifyUrl?: string;
  gatewayUrl?: string;
  sandbox?: boolean;
}

export const paymentApi = {
  /** 各渠道配置状态（不含密钥内容） */
  status: () => api.get<unknown>('/payment/config/status'),

  /** 渠道可用性（收银台据此决定按钮是否可点） */
  readiness: () => api.get<unknown>('/payment/config/readiness'),

  /** 保存某渠道配置 */
  save: (channel: string, body: PaymentSaveBody) =>
    api.post<unknown>(`/payment/config/${channel}`, body),

  /** 连通性验证（用不存在的单号查询，鉴权通过即算通过，不产生资金动作） */
  verify: (channel: string) => api.post<unknown>(`/payment/config/${channel}/verify`, {}),
};

export default paymentApi;
