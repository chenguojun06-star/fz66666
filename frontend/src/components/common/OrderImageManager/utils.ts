import type { OrderImageSnapshot } from '@/services/system/remarkApi';

export const parseUrls = (urls?: string): string[] => {
  if (!urls) return [];
  try {
    const parsed = JSON.parse(urls);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const snapshotTypeMap: Record<string, { text: string; color: string }> = {
  ADD: { text: '新增', color: 'green' },
  DELETE: { text: '删除', color: 'red' },
  REORDER: { text: '排序', color: 'blue' },
  UPDATE: { text: '更新', color: 'orange' },
};

export const arrowBtnStyle = (side: 'left' | 'right', hovering: boolean): React.CSSProperties => ({
  position: 'absolute',
  [side]: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'rgba(0,0,0,0.45)',
  color: 'var(--color-bg-base)',
  border: 'none',
  width: 28,
  height: 28,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: hovering ? 1 : 0,
  transition: 'opacity 0.2s ease',
  cursor: 'pointer',
  zIndex: 2,
});

export type { OrderImageSnapshot };
