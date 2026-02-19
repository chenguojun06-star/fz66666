import request from '@/utils/api';

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
    return request.post('/system/app-order/create', data);
  },

  // 获取我的订阅
  getMySubscriptions: (): Promise<Subscription[]> => {
    return request.post('/system/subscription/list');
  },

  // 获取订单详情
  getOrder: (orderNo: string): Promise<AppOrder> => {
    return request.get(`/system/app-order/${orderNo}`);
  },

  // 取消订单
  cancelOrder: (orderNo: string): Promise<void> => {
    return request.post(`/system/app-order/${orderNo}/cancel`);
  },

  // 续费订阅
  renewSubscription: (subscriptionId: number, subscriptionType: string): Promise<AppOrder> => {
    return request.post(`/system/subscription/${subscriptionId}/renew`, { subscriptionType });
  },

  // 开通免费试用（返回订阅信息 + API凭证）
  startTrial: (appId: number): Promise<{ subscription: Subscription; apiCredentials?: { appKey: string; appSecret: string; message: string } }> => {
    return request.post('/system/app-store/start-trial', { appId });
  },

  // 检查试用状态
  getTrialStatus: (appId: number): Promise<{ hasTried: boolean; canTrial: boolean; isExpired?: boolean; endTime?: string }> => {
    return request.get(`/system/app-store/trial-status/${appId}`);
  },
};
