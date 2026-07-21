export const parseTemplateContent = (content: unknown) => {
  if (typeof content === 'object' && content !== null) return content;
  const text = String(content ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const metaTextStyle = {
  color: 'var(--neutral-text-secondary)',
  fontSize: 14,
  lineHeight: 1.2,
} as const;

export const compactFieldLabelStyle = {
  marginBottom: 4,
  color: 'var(--neutral-text-secondary)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.2,
} as const;
