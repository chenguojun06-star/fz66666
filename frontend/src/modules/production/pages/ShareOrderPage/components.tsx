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
    <span style={{ color: highlightColor || '#3b82f6', marginRight: 6 }}>{icon}</span>
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlightColor || '#0f172a' }}>{value}</div>
    </div>
  </div>
);

export const AiItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={S.aiItemStyle}>
    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.7 }}>{value}</div>
  </div>
);

export const FocusItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={S.focusItemStyle}>
    <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{value}</div>
  </div>
);

export const XiaoyunMascotLink: React.FC<{ riskTone: { color: string; softColor: string } }> = ({ riskTone }) => (
  <a href={PLATFORM_URL} target="_blank" rel="noreferrer" style={S.xiaoYunLinkStyle} title="打开衣智链平台">
    <div style={{ ...S.xiaoYunBubbleStyle, boxShadow: `0 0 0 6px ${riskTone.softColor}` }}>
      <CuteCloudTrigger size={60} active mood="curious" />
    </div>
  </a>
);
