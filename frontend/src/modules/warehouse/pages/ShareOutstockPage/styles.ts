import type { CSSProperties } from 'react';

export const loadingStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#f8fbff',
};

export const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left, rgba(59,130,246,0.12), transparent 26%), radial-gradient(circle at bottom right, rgba(16,185,129,0.10), transparent 24%), linear-gradient(180deg, #eef6ff 0%, #f8fbff 45%, #f3faf6 100%)',
  padding: '32px 16px 40px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heiti SC", "Songti SC", serif',
};

export const shellStyle: CSSProperties = {
  width: '100%',
  maxWidth: 1200,
  margin: '0 auto',
};

export const heroCardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(18px)',
  borderRadius: 28,
  padding: '28px 28px 24px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
  border: '1px solid rgba(255,255,255,0.75)',
  marginBottom: 12,
};

export const heroHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 14,
};

export const brandTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
};

export const brandSubtitleStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--color-text-tertiary)',
  marginTop: 2,
};

export const statusTagStyle: CSSProperties = {
  marginInlineEnd: 0,
  padding: '6px 14px',
  borderRadius: 999,
  fontWeight: 700,
};

export const customerCardStyle: CSSProperties = {
  background: 'rgba(59,130,246,0.04)',
  borderRadius: 16,
  padding: '16px 20px',
  marginBottom: 16,
  border: '1px solid rgba(59,130,246,0.10)',
};

export const customerTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 10,
};

export const customerGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 20,
};

export const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
};

export const summaryCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: 'rgba(248,250,252,0.8)',
  borderRadius: 16,
  padding: '16px 12px',
  border: '1px solid rgba(148,163,184,0.12)',
};

export const panelStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(18px)',
  borderRadius: 20,
  padding: '24px',
  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.06)',
  border: '1px solid rgba(255,255,255,0.75)',
  marginBottom: 12,
};

export const panelTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 16,
  borderBottom: '1px solid rgba(148,163,184,0.12)',
  paddingBottom: 10,
};

export const tableWrapperStyle: CSSProperties = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
};

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  minWidth: 900,
};

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontWeight: 600,
  color: 'var(--color-text-tertiary)',
  fontSize: 14,
  borderBottom: '2px solid rgba(148,163,184,0.18)',
  whiteSpace: 'nowrap',
};

export const tdStyle: CSSProperties = {
  padding: '10px 12px',
  color: '#334155',
  borderBottom: '1px solid rgba(148,163,184,0.10)',
  whiteSpace: 'nowrap',
};

export const trEvenStyle: CSSProperties = {
  background: 'rgba(248,250,252,0.5)',
};

export const totalRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 12px 0',
  fontSize: 14,
  color: 'var(--color-text-tertiary)',
  borderTop: '2px solid rgba(148,163,184,0.18)',
  marginTop: 8,
};

export const bottomBrandLineStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 16,
  flexWrap: 'wrap',
  fontSize: 14,
  color: 'var(--color-text-tertiary)',
  padding: '16px 0',
};
