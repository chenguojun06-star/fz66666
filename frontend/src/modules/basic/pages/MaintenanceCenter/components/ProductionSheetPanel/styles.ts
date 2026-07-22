export const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 10,
  padding: 12,
  background: 'var(--color-bg-base)',
} as const;

export const directStackStyle = { display: 'grid', gap: 10 } as const;

export const directTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

export const directMetaStyle = {
  fontSize: 14,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

export const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

export const processingBannerStyle = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ffd591',
  background: '#FFF7E6',
  display: 'grid',
  gap: 4,
} as const;
