import type { MyAppInfo } from '@/services/system/appStore';

export const PLAN_LABELS: Record<string, string> = {
  TRIAL: '免费试用',
  BASIC: '基础版',
  PRO: '专业版',
  ENTERPRISE: '企业版',
};

export const SUB_TYPE_LABELS: Record<string, string> = {
  TRIAL: '免费试用',
  MONTHLY: '月付',
  YEARLY: '年付',
  PERPETUAL: '买断',
  FREE: '免费',
  PERMANENT: '永久',
};

export function normalizePrice(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatStorageQuota(storageQuotaMb?: number): string {
  const quota = Number(storageQuotaMb ?? 0);
  if (!Number.isFinite(quota) || quota <= 0) {
    return '0MB';
  }
  if (quota >= 1024) {
    const gb = quota / 1024;
    return Number.isInteger(gb) ? `${gb}GB` : `${gb.toFixed(1)}GB`;
  }
  return `${quota}MB`;
}

export function formatPlanFee(overview?: {
  planType?: string;
  billingCycle?: string;
  monthlyFee?: number | string;
  paidStatus?: string;
} | null): string {
  if (!overview) {
    return '-';
  }
  if (overview.planType === 'TRIAL' || overview.paidStatus === 'TRIAL') {
    return '免费试用';
  }
  const monthlyFee = normalizePrice(overview.monthlyFee);
  if (overview.billingCycle === 'YEARLY') {
    return `¥${(monthlyFee * 10).toFixed(0)}/年`;
  }
  return `¥${monthlyFee.toFixed(0)}/月`;
}

export function formatSubscriptionPrice(app: Pick<MyAppInfo, 'subscriptionType' | 'price'>): string {
  if (app.subscriptionType === 'TRIAL' || app.subscriptionType === 'FREE') {
    return '免费试用';
  }
  if (app.subscriptionType === 'PERMANENT') {
    return '平台全量权限';
  }
  const price = normalizePrice(app.price);
  if (app.subscriptionType === 'PERPETUAL') {
    return price > 0 ? `¥${price.toFixed(0)} 买断` : '已买断';
  }
  if (app.subscriptionType === 'YEARLY') {
    return price > 0 ? `¥${price.toFixed(0)}/年` : '按年开通';
  }
  if (app.subscriptionType === 'MONTHLY') {
    return price > 0 ? `¥${price.toFixed(0)}/月` : '按月开通';
  }
  return price > 0 ? `¥${price.toFixed(0)}` : '已开通';
}
