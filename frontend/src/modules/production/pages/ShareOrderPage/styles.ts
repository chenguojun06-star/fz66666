import React from 'react';

export const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 26%), radial-gradient(circle at bottom right, rgba(16,185,129,0.14), transparent 24%), linear-gradient(180deg, #eef6ff 0%, #f8fbff 45%, #f3faf6 100%)',
  padding: '32px 16px 40px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heiti SC", "Songti SC", serif',
};

export const shellStyle: React.CSSProperties = { width: '100%', maxWidth: 1120, margin: '0 auto' };

export const heroCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(18px)', borderRadius: 28,
  padding: '28px 28px 24px', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
  border: '1px solid rgba(255,255,255,0.75)', marginBottom: 20,
};

export const heroHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 };
export const brandTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#0f172a' };
export const brandSubtitleStyle: React.CSSProperties = { fontSize: 12, color: '#94a3b8', marginTop: 2 };
export const statusTagStyle: React.CSSProperties = { marginInlineEnd: 0, padding: '6px 14px', borderRadius: 999, fontWeight: 700 };
export const orderNoStyle: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 8 };

export const heroOverviewStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '108px minmax(0, 1fr)', gap: 16, alignItems: 'center', marginBottom: 14 };
export const heroGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 };

export const styleCoverCardStyle: React.CSSProperties = {
  width: 108, height: 136, borderRadius: 18, overflow: 'hidden',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(241,245,249,0.9))',
  border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 10px 28px rgba(15,23,42,0.08)',
};

export const styleCoverImageStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
export const styleCoverPlaceholderStyle: React.CSSProperties = { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.88))' };

export const summaryPanelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(241,245,249,0.76))',
  borderRadius: 20, padding: '18px 18px 16px', border: '1px solid rgba(148,163,184,0.18)',
};

export const summaryCaptionStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 8 };
export const currentStageStyle: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 };
export const summaryTextStyle: React.CSSProperties = { fontSize: 13, color: '#64748b', lineHeight: 1.7 };

export const sizeQtyFooterStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(226,232,240,0.9)',
  fontSize: 13, fontWeight: 600, color: '#334155',
};

export const progressSummaryRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, marginTop: 2, flexWrap: 'wrap' };
export const progressSummaryTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#2563eb' };
export const progressSummaryMetaStyle: React.CSSProperties = { fontSize: 13, color: '#64748b' };
export const metricGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 18 };

export const metricCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', background: 'rgba(248,250,252,0.9)',
  borderRadius: 16, padding: '12px 14px', border: '1px solid rgba(148,163,184,0.14)',
};

export const contentGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 0.95fr)', gap: 20, alignItems: 'start' };
export const mainColumnStyle: React.CSSProperties = { display: 'grid', gap: 20 };
export const sideColumnStyle: React.CSSProperties = { display: 'grid', gap: 20 };

export const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRadius: 24,
  padding: '22px 22px 20px', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
  border: '1px solid rgba(255,255,255,0.78)',
};

export const panelTitleStyle: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 16 };
export const aiHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' };
export const xiaoYunLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 };

export const xiaoYunBubbleStyle: React.CSSProperties = {
  width: 76, height: 76, borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239,246,255,0.92))',
  border: '1px solid rgba(148,163,184,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 12px 24px rgba(37,99,235,0.12)',
};

export const aiSupportTextStyle: React.CSSProperties = { marginTop: 6, fontSize: 11, color: '#94a3b8', lineHeight: 1.5 };
export const confidenceStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0f172a', background: 'rgba(241,245,249,0.9)', borderRadius: 999, padding: '8px 12px' };
export const aiGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };

export const aiItemStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(248,250,252,0.92), rgba(241,245,249,0.84))',
  borderRadius: 18, padding: '14px 15px', border: '1px solid rgba(148,163,184,0.16)',
};

export const stageGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 };

export const stageCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)', borderRadius: 16, padding: '7px 9px 7px',
  border: '1px solid rgba(148,163,184,0.18)', minHeight: 58,
};

export const remarkCardStyle: React.CSSProperties = {
  display: 'flex', gap: 12, padding: '16px 18px', borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(239,246,255,0.9), rgba(248,250,252,0.9))',
  border: '1px solid rgba(59,130,246,0.14)',
};

export const remarkTextStyle: React.CSSProperties = { fontSize: 14, color: '#0f172a', lineHeight: 1.8, whiteSpace: 'pre-wrap' };
export const focusListStyle: React.CSSProperties = { display: 'grid', gap: 10 };

export const focusItemStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  padding: '12px 14px', background: 'rgba(248,250,252,0.9)', borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.14)',
};

export const timelineStyle: React.CSSProperties = { display: 'grid', gap: 14 };
export const timelineItemStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 12, alignItems: 'start' };
export const timelineDotStyle: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, background: '#2563eb', marginTop: 7, boxShadow: '0 0 0 4px rgba(59,130,246,0.14)' };
export const emptyPanelStyle: React.CSSProperties = { fontSize: 13, color: '#94a3b8', lineHeight: 1.7 };
export const bottomBrandLineStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, padding: '4px 6px 0', fontSize: 12, color: '#94a3b8' };
