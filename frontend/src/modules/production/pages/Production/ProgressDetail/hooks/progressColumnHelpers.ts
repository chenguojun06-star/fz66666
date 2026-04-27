import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Badge, Popover, Tag, Tooltip } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import SmartOrderHoverCard from '../components/SmartOrderHoverCard';
import { StyleCoverThumb } from '@/components/StyleAssets';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { ProductionOrder } from '@/types/production';
import { getOrderShipTime } from '../utils';
import type { CSSProperties } from 'react';

function calcHealthScore(record: ProductionOrder): { score: number; level: 'good'|'warn'|'danger' } {
  const prog = record.productionProgress ?? 0;
  let score = Math.round(prog * 0.40);
  if (record.expectedShipDate) {
    const days = dayjs(record.expectedShipDate as string).diff(dayjs(), 'day');
    if (days > 14)     score += 35;
    else if (days > 7) score += 26;
    else if (days > 3) score += 16;
    else if (days > 0) score += 8;
  } else {
    score += 20;
  }
  const proc = (record as any).procurementCompletionRate ?? null;
  score += proc != null ? Math.round(proc * 0.25) : 18;
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 75 ? 'good' : score >= 50 ? 'warn' : 'danger' };
}

export const formatCompletionTime = (timeStr: string): string => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  } catch { return ''; }
};

export const getNodeColor = (expectedShipDate: any, isColor2 = false): string => {
  if (!expectedShipDate) return isColor2 ? '#95de64' : '#52c41a';
  const now = new Date();
  const delivery = new Date(expectedShipDate as string);
  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return isColor2 ? '#ff7875' : '#ff4d4f';
  if (diffDays <= 3) return isColor2 ? '#ffc53d' : '#faad14';
  return isColor2 ? '#95de64' : '#52c41a';
};

export const colorWithAlpha = (hex: string, alpha: number): string => {
  const matched = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!matched) return hex;
  const [, r, g, b] = matched;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
};

export { calcHealthScore };
