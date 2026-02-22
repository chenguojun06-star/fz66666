import request from '@/utils/api';

export interface MyAppInfo {
  subscriptionId: number;
  appCode: string;
  appName: string;
  subscriptionType: string;
  status: string;
  startTime: string;
  endTime?: string;
  isExpired: boolean;
  tenantAppId?: string;
  appKey?: string;
  callbackUrl?: string;
  externalApiUrl?: string;
  dailyQuota?: number;
  dailyUsed?: number;
  totalCalls?: number;
  appStatus?: string;
  configured: boolean;
  hasCallbackUrl: boolean;
  hasExternalUrl: boolean;
  apiEndpoints?: { method: string; path: string; desc: string }[];
}

export interface AppStoreItem {
  id: number;
  appCode: string;
  appName: string;
  appIcon: string;
  appDesc: string;
  appDetail?: string;
  category: string;
  priceType: string;
  priceMonthly: number;
  priceYearly: number;
  priceOnce: number;
  sortOrder: number;
  isHot: boolean;
  isNew: boolean;
  status: string;
  features: string[];
  screenshots?: string[];
  minUsers: number;
  maxUsers: number;
  trialDays: number;
}

export interface Subscription {
  id: number;
  subscriptionNo: string;
  tenantId: number;
  tenantName: string;
  appId: number;
  appCode: string;
  appName: string;
  subscriptionType: string;
  price: number;
  userCount: number;
  startTime: string;
  endTime?: string;
  status: string;
  autoRenew: boolean;
}

export interface AppOrder {
  id: number;
  orderNo: string;
  tenantId: number;
  tenantName: string;
  appId: number;
  appCode: string;
  appName: string;
  orderType: string;
  subscriptionType: string;
  userCount: number;
  unitPrice: number;
  totalAmount: number;
  discountAmount: number;
  actualAmount: number;
  status: string;
  paymentMethod?: string;
  paymentTime?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  companyName?: string;
  invoiceRequired: boolean;
  invoiceTitle?: string;
  invoiceTaxNo?: string;
}

export interface CreateOrderRequest {
  appId: number;
  appCode: string;
  appName: string;
  subscriptionType: 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'PERPETUAL';
  userCount: number;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  companyName?: string;
  invoiceRequired: boolean;
  invoiceTitle?: string;
  invoiceTaxNo?: string;
}

export const appStoreService = {
  // 获取应用列表
  list: (params?: { status?: string; category?: string }): Promise<AppStoreItem[]> => {
    return request.post('/system/app-store/list', params);
  },

  // 获取应用详情
  getDetail: (id: number): Promise<AppStoreItem> => {
    return request.get(`/system/app-store/${id}`);
  },

  // 创建订单
  createOrder: (data: CreateOrderRequest): Promise<AppOrder> => {
    return request.post('/system/app-store/create-order', data);
  },

  // 获取我的订阅
  getMySubscriptions: (): Promise<Subscription[]> => {
    return request.post('/system/app-store/my-subscriptions');
  },

  // 获取订单详情（TODO: 后端暂未实现独立的订单详情查询端点，需要时再添加）
  getOrder: (orderNo: string): Promise<AppOrder> => {
    return request.get(`/system/app-store/order/${orderNo}`);
  },

  // 取消订单（TODO: 后端暂未实现取消订单端点，需要时再添加）
  cancelOrder: (orderNo: string): Promise<void> => {
    return request.post(`/system/app-store/order/${orderNo}/cancel`);
  },

  // 续费订阅（TODO: 后端暂未实现续费端点，需要时再添加）
  renewSubscription: (subscriptionId: number, subscriptionType: string): Promise<AppOrder> => {
    return request.post(`/system/app-store/subscription/${subscriptionId}/renew`, { subscriptionType });
  },

  // 开通免费试用（返回订阅信息 + API凭证 + 端点信息）
  startTrial: (appId: number, options?: { callbackUrl?: string; externalApiUrl?: string }): Promise<{
    subscription: Subscription;
    apiCredentials?: { appKey: string; appSecret: string; appId: string; message: string };
    apiEndpoints?: { method: string; path: string; desc: string }[];
    appCode?: string;
    appName?: string;
  }> => {
    return request.post('/system/app-store/start-trial', { appId, ...options });
  },

  // 快速配置（填写对方API地址）
  quickSetup: (tenantAppId: string, data: { callbackUrl?: string; externalApiUrl?: string }): Promise<any> => {
    return request.post('/system/app-store/quick-setup', { tenantAppId, ...data });
  },

  // 获取我的已开通应用（含配置状态）
  getMyApps: (): Promise<MyAppInfo[]> => {
    return request.post('/system/app-store/my-apps');
  },

  // 检查试用状态
  getTrialStatus: (appId: number): Promise<{ hasTried: boolean; canTrial: boolean; isExpired?: boolean; endTime?: string }> => {
    return request.get(`/system/app-store/trial-status/${appId}`);
  },
};
