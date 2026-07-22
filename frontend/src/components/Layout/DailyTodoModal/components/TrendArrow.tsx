import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import type { TrendPoint } from '../types';

function TrendArrow({ trend }: { trend: TrendPoint[] }) {
  if (!trend || trend.length < 2) return null;
  const last = Number(trend[trend.length - 1]?.scanCount) || 0;
  const prev = Number(trend[trend.length - 2]?.scanCount) || 0;
  if (prev === 0) return null;
  const pct = Math.round(((last - prev) / prev) * 100);
  if (pct === 0) return null;
  const up = pct > 0;
  return (
    <span style={{ fontSize: 14, color: up ? 'var(--color-success)' : 'var(--color-danger)', marginLeft: 6 }}>
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(pct)}%
    </span>
  );
}

export default TrendArrow;
