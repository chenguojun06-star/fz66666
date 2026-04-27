export const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 12,
  padding: 16,
  background: '#fff',
} as const;

export const directStackStyle = { display: 'grid', gap: 12 } as const;

export const directTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

export const directMetaStyle = {
  fontSize: 12,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

export const directValueStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.35,
} as const;

export const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

export const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
  marginTop: 10,
} as const;

export const summaryCardStyle = {
  border: '1px solid #f0f0f0',
  borderRadius: 10,
  padding: '10px 12px',
  background: '#fafafa',
  display: 'grid',
  gap: 4,
} as const;

export const metaCardStyle = {
  marginTop: 10,
  padding: '12px 14px',
  border: '1px solid #e8edf4',
  borderRadius: 10,
  background: 'linear-gradient(180deg, #fbfcfe 0%, #f6f8fb 100%)',
  display: 'grid',
  gap: 8,
} as const;

export const heroStyle = {
  display: 'grid',
  gridTemplateColumns: '84px minmax(0, 1fr) auto',
  gap: 14,
  alignItems: 'start',
} as const;

export const heroThumbStyle = {
  width: 84,
  height: 84,
  overflow: 'hidden',
  borderRadius: 12,
  border: '1px solid #f0f0f0',
  background: '#fafafa',
} as const;

export const heroHeadlineStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
} as const;

export const statusPillBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 68,
  padding: '2px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.5,
} as const;

export const editorSectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.3,
} as const;

export const editorGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
} as const;

export const unlockNoteStyle = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px dashed #d7dde7',
  background: '#fff',
  display: 'grid',
  gap: 2,
} as const;

export const uploadAreaStyle = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px dashed #cfd8e3',
  background: '#fff',
  display: 'grid',
  gap: 10,
} as const;

export const splitGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
} as const;

export const actionBarStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 4,
} as const;

export const processingBannerStyle = {
  marginBottom: 0,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ffd591',
  background: '#fff7e6',
  display: 'grid',
  gap: 4,
} as const;
