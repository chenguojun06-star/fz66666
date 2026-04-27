import type { TenantAppInfo, TenantAppLogInfo, IntegrationOverview, IntegrationModuleInfo } from '@/services/tenantAppService';
import type { RoleTemplate } from '@/services/tenantService';

export const APP_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; description: string }> = {
  ORDER_SYNC:       { label: '下单对接',       color: 'var(--color-primary)', icon: '', description: '客户ERP系统直接下达生产订单，实时查询订单进度' },
  QUALITY_FEEDBACK: { label: '质检反馈',       color: 'var(--color-success)', icon: '', description: '质检完成后自动推送结果到客户系统，支持Webhook回调' },
  LOGISTICS_SYNC:   { label: '物流对接',       color: 'var(--color-info)',    icon: '', description: '出库发货时自动同步物流信息到客户系统' },
  PAYMENT_SYNC:     { label: '付款对接',       color: 'var(--color-warning)', icon: '', description: '对账单推送、付款确认，与客户支付系统双向对接' },
  MATERIAL_SUPPLY:  { label: '面辅料供应对接', color: '#13c2c2',              icon: '', description: '面辅料供应商系统直接同步采购、入库数据' },
  DATA_IMPORT:      { label: '数据导入',       color: '#722ed1',              icon: '', description: '批量导入生产订单、工序、库存等数据，开通即用' },
  EC_TAOBAO:        { label: '淘宝对接',       color: '#ff4500',              icon: '', description: '淘宝平台订单自动同步到生产系统' },
  EC_TMALL:         { label: '天猫对接',       color: '#ff2d2d',              icon: '', description: '天猫旗舰店订单实时同步，支持SKU映射' },
  EC_JD:            { label: '京东对接',       color: '#e1251b',              icon: '', description: '京东平台订单自动同步，支持物流回传' },
  EC_DOUYIN:        { label: '抖音对接',       color: '#000000',              icon: '', description: '抖音小店订单实时接入，直播售卖自动下单' },
  EC_PINDUODUO:     { label: '拼多多对接',     color: '#e02e24',              icon: '', description: '拼多多平台订单同步，支持多规格SKU' },
  EC_XIAOHONGSHU:   { label: '小红书对接',     color: '#fe2c55',              icon: '', description: '小红书商城订单同步，种草转化直连生产' },
  EC_WECHAT_SHOP:   { label: '微信小店对接',   color: '#07c160',              icon: '', description: '微信小店/视频号订单直接推送生产系统' },
  EC_SHOPIFY:       { label: 'Shopify对接',    color: '#96bf48',              icon: '', description: '跨境Shopify店铺订单自动同步，支持多货币' },
};
export const MODULE_ICONS: Record<string, { icon: string; color: string; bgColor: string }> = {
  ORDER_SYNC:       { icon: '', color: 'var(--color-primary)', bgColor: 'rgba(45, 127, 249, 0.1)' },
  QUALITY_FEEDBACK: { icon: '', color: 'var(--color-success)', bgColor: 'rgba(34, 197, 94, 0.15)' },
  LOGISTICS_SYNC:   { icon: '', color: 'var(--color-info)',    bgColor: 'rgba(114, 46, 209, 0.1)' },
  PAYMENT_SYNC:     { icon: '', color: 'var(--color-warning)', bgColor: 'rgba(250, 140, 22, 0.1)' },
  MATERIAL_SUPPLY:  { icon: '', color: '#13c2c2',              bgColor: 'rgba(19, 194, 194, 0.1)' },
  DATA_IMPORT:      { icon: '', color: '#722ed1',              bgColor: 'rgba(114, 46, 209, 0.1)' },
  EC_TAOBAO:        { icon: '', color: '#ff4500',              bgColor: 'rgba(255, 69, 0, 0.1)' },
  EC_TMALL:         { icon: '', color: '#ff2d2d',              bgColor: 'rgba(255, 45, 45, 0.1)' },
  EC_JD:            { icon: '', color: '#e1251b',              bgColor: 'rgba(225, 37, 27, 0.1)' },
  EC_DOUYIN:        { icon: '', color: '#333333',              bgColor: 'rgba(0,0,0,0.06)' },
  EC_PINDUODUO:     { icon: '', color: '#e02e24',              bgColor: 'rgba(224, 46, 36, 0.1)' },
  EC_XIAOHONGSHU:   { icon: '', color: '#fe2c55',              bgColor: 'rgba(254, 44, 85, 0.1)' },
  EC_WECHAT_SHOP:   { icon: '', color: '#07c160',              bgColor: 'rgba(7, 193, 96, 0.1)' },
  EC_SHOPIFY:       { icon: '', color: '#96bf48',              bgColor: 'rgba(150, 191, 72, 0.1)' },
};

export const getFlowDescription = (appType: string): string => {
  const map: Record<string, string> = {
    ORDER_SYNC: '客户ERP下单 → 自动创建生产订单 → 在「生产管理→我的订单」查看',
    QUALITY_FEEDBACK: '质检完成 → Webhook推送质检结果 → 在「生产管理→质检入库」查看',
    LOGISTICS_SYNC: '出库发货 → Webhook推送物流信息 → 在「仓库管理→成品进销存」查看',
    PAYMENT_SYNC: '对账单生成 → 推送给客户 → 客户确认付款 → 在「财务管理→订单结算」查看',
  };
  return map[appType] || '';
};

export const getApiEndpoints = (appType: string): { method: string; path: string; desc: string }[] => {
  const map: Record<string, { method: string; path: string; desc: string }[]> = {
    ORDER_SYNC: [
      { method: 'POST', path: '/openapi/order/create', desc: '创建生产订单' },
      { method: 'POST', path: '/openapi/order/status', desc: '查询订单状态' },
      { method: 'POST', path: '/openapi/order/list', desc: '订单列表' },
    ],
    QUALITY_FEEDBACK: [
      { method: 'POST', path: '/openapi/quality/report', desc: '获取质检报告' },
      { method: 'POST', path: '/openapi/quality/list', desc: '质检记录列表' },
      { method: '-', path: 'Webhook 回调', desc: '自动推送质检完成结果' },
    ],
    LOGISTICS_SYNC: [
      { method: 'POST', path: '/openapi/logistics/status', desc: '获取物流状态' },
      { method: 'POST', path: '/openapi/logistics/list', desc: '物流记录列表' },
      { method: '-', path: 'Webhook 回调', desc: '自动推送出库发货信息' },
    ],
    PAYMENT_SYNC: [
      { method: 'POST', path: '/openapi/payment/pending', desc: '待付款清单' },
      { method: 'POST', path: '/openapi/payment/confirm', desc: '确认付款' },
      { method: 'POST', path: '/openapi/payment/list', desc: '付款记录列表' },
    ],
  };
  return map[appType] || [];
};
