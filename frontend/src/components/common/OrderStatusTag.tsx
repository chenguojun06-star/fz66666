import React from 'react';
import { Tag } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  MinusCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';

const STATUS_ICON_MAP: Record<string, React.ReactNode> = {
  pending:    <ClockCircleOutlined />,
  production: <SyncOutlined spin />,
  in_progress:<SyncOutlined spin />,
  completed:  <CheckCircleOutlined />,
  confirmed:  <CheckCircleOutlined />,
  draft:      <MinusCircleOutlined />,
  produced:   <CheckCircleOutlined />,
  warehoused: <CheckCircleOutlined />,
  delayed:    <ExclamationCircleOutlined />,
  scrapped:   <CloseCircleOutlined />,
  cancelled:  <StopOutlined />,
  canceled:   <StopOutlined />,
  paused:     <PauseCircleOutlined />,
  returned:   <ExclamationCircleOutlined />,
  closed:     <CheckCircleOutlined />,
  archived:   <MinusCircleOutlined />,
};

const SEVERITY_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  error:    { bg: '#fff1f0', text: '#cf1322', border: '#ffa39e' },
  warning:  { bg: '#fff7e6', text: '#d46b08', border: '#ffd591' },
  success:  { bg: '#f6ffed', text: '#389e0d', border: '#b7eb8f' },
  processing: { bg: '#e6f4ff', text: '#0958d9', border: '#91caff' },
  blue:     { bg: '#e6f4ff', text: '#0958d9', border: '#91caff' },
  cyan:     { bg: '#e6fffb', text: '#08979c', border: '#87e8de' },
  orange:   { bg: '#fff7e6', text: '#d46b08', border: '#ffd591' },
  volcano:  { bg: '#fff2e8', text: '#d4380d', border: '#ffbb96' },
  default:  { bg: '#fafafa', text: '#595959', border: '#d9d9d9' },
};

export const getOrderStatusConfig = (status: string | undefined | null) => {
  const key = String(status || '').trim().toLowerCase();
  const label = ORDER_STATUS_LABEL[key] || key || '未知';
  const colorKey = ORDER_STATUS_COLOR[key] || 'default';
  const severity = SEVERITY_COLOR_MAP[colorKey] || SEVERITY_COLOR_MAP.default;
  const icon = STATUS_ICON_MAP[key] || null;
  return { label, text: label, color: colorKey, severity, icon };
};

const OrderStatusTag: React.FC<{ status?: string | null; style?: React.CSSProperties }> = ({ status, style }) => {
  const { label, severity, icon } = getOrderStatusConfig(status);

  return (
    <Tag
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        margin: 0,
        padding: '2px 10px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: '22px',
        borderRadius: 6,
        border: `1px solid ${severity.border}`,
        background: severity.bg,
        color: severity.text,
        ...style,
      }}
    >
      {icon && <span style={{ fontSize: 12, display: 'inline-flex' }}>{icon}</span>}
      {label}
    </Tag>
  );
};

export default OrderStatusTag;