/**
 * MyBillingTab 表格列定义
 * - buildBillColumns: 月账单列表（依赖按钮回调）
 * - buildAppColumns: 我的订阅应用列表（无外部依赖）
 */
import React from 'react';
import { Tag, Button, Space, Tooltip, Typography } from 'antd';
import {
  FileTextOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import { formatMoney } from '@/utils/format';
import type { MyAppInfo } from '@/services/system/appStore';
import { PLAN_LABELS, SUB_TYPE_LABELS, formatSubscriptionPrice } from '../billingDisplay';
import {
  INVOICE_STATUS_CONFIG,
  BILL_STATUS_CONFIG,
  SUB_STATUS_CONFIG,
  daysUntilExpiry,
  expiryColor,
} from './helpers';

const { Text } = Typography;

export interface BillColumnHandlers {
  onPay: (record: any) => void;
  onRequestInvoice: (record: any) => void;
}

/** 月账单列表列定义 */
export function buildBillColumns(handlers: BillColumnHandlers) {
  return [
    { title: '账单编号', dataIndex: 'billingNo', width: 160 },
    { title: '账期', dataIndex: 'billingMonth', width: 100 },
    { title: '套餐', dataIndex: 'planType', width: 90,
      render: (v: string) => PLAN_LABELS[v] ?? '未知' },
    { title: '金额(¥)', dataIndex: 'totalAmount', width: 100,
      render: (v: number) => (
        <Text strong style={{ color: 'var(--color-primary)' }}>
          {formatMoney(v)}
        </Text>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const cfg = BILL_STATUS_CONFIG[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '发票', dataIndex: 'invoiceStatus', width: 90,
      render: (v: string) => {
        const cfg = INVOICE_STATUS_CONFIG[v] || { label: v || '—', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '发票号', dataIndex: 'invoiceNo', width: 140,
      render: (v: string) => v || '—' },
    { title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => {
        const canPay = record.status === 'PENDING' || record.status === 'OVERDUE';
        const canRequest = (record.status === 'PAID' || record.status === 'PENDING')
          && (!record.invoiceStatus || record.invoiceStatus === 'NOT_REQUIRED');
        return (
          <Space size={0}>
            {canPay && (
              <Button type="link" icon={<CreditCardOutlined />}
                style={{ color: 'var(--color-primary)' }}
                onClick={() => handlers.onPay(record)}>
                立即付款
              </Button>
            )}
            {canRequest && (
              <Button type="link" icon={<FileTextOutlined />}
                onClick={() => handlers.onRequestInvoice(record)}>
                申请开票
              </Button>
            )}
          </Space>
        );
      },
    },
  ];
}

/** 我的订阅应用列表列定义 */
export function buildAppColumns() {
  return [
    {
      title: '应用名称', dataIndex: 'appName', width: 140,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '订阅类型', dataIndex: 'subscriptionType', width: 90,
      render: (v: string) => <Tag color="blue">{SUB_TYPE_LABELS[v] ?? '未知'}</Tag>,
    },
    {
      title: '费用', key: 'price', width: 110,
      render: (_: unknown, record: MyAppInfo) => (
        <Text strong style={{ color: 'var(--color-primary)' }}>{formatSubscriptionPrice(record)}</Text>
      ),
    },
    {
      title: '开始时间', dataIndex: 'startTime', width: 120,
      render: (v: string) => v ? v.slice(0, 10) : '—',
    },
    {
      title: '到期时间', dataIndex: 'endTime', width: 120,
      render: (v: string) => {
        if (!v) return <Tag color="success">永久有效</Tag>;
        const days = daysUntilExpiry(v);
        const color = expiryColor(days);
        if (days !== null && days < 0) return <Tag color="error">已过期</Tag>;
        return (
          <Tooltip title={`${days} 天后到期`}>
            <Tag color={color}>{v.slice(0, 10)}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '剩余天数', key: 'daysLeft', width: 90,
      render: (_: any, record: MyAppInfo) => {
        if (!record.endTime) return <Tag color="success">永久</Tag>;
        const days = daysUntilExpiry(record.endTime);
        if (days === null) return <Tag color="success">永久</Tag>;
        if (days < 0) return <Tag color="error">已过期</Tag>;
        const color = expiryColor(days);
        return <Tag color={color}>{days} 天</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string, record: MyAppInfo) => {
        const key = record.isExpired ? 'EXPIRED' : (v || 'ACTIVE');
        const cfg = SUB_STATUS_CONFIG[key] || { label: key, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
  ];
}
