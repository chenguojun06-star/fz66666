import React from 'react';
import { CuteCloudTrigger } from '@/components/common/XiaoyunCloudAvatar';
import { PLATFORM_URL } from './types';
import * as S from './styles';

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlightColor?: string;
}

export const MetricCard: React.FC<InfoItemProps> = ({ icon, label, value, highlightColor }) => (
  <div style={S.metricCardStyle}>
    <span style={{ color: highlightColor || 'var(--color-primary)', marginRight: 6 }}>{icon}</span>
    <div>
      <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlightColor || 'var(--color-text-primary)' }}>{value}</div>
    </div>
  </div>
);

export const AiItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={S.aiItemStyle}>
    <div className="u-fs-14 u-mb-6" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
    <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)', lineHeight: 1.7 }}>{value}</div>
  </div>
);

export const FocusItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={S.focusItemStyle}>
    <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
    <div className="u-fs-14 u-fw-600 u-ta-right" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
  </div>
);

export const XiaoyunMascotLink: React.FC<{ riskTone: { color: string; softColor: string } }> = ({ riskTone }) => (
  <a href={PLATFORM_URL} target="_blank" rel="noreferrer" style={S.xiaoYunLinkStyle} title="打开云裳智链平台">
    <div style={{ ...S.xiaoYunBubbleStyle, boxShadow: `0 0 0 6px ${riskTone.softColor}` }}>
      <CuteCloudTrigger size={60} active mood="curious" />
    </div>
  </a>
);
