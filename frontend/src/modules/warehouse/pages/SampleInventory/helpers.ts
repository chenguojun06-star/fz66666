export const STYLE_INFO_LIST_REFRESH_KEY = 'style-info-list:refresh-needed';

export const getRecordSwitchButtonStyle = (selected: boolean) => {
  return {
    background: 'var(--color-bg-base)',
    borderColor: selected ? '#cbd5e1' : '#e2e8f0',
    color: selected ? '#0f172a' : '#475569',
    boxShadow: selected ? '0 2px 8px rgba(15, 23, 42, 0.08)' : 'none',
  };
};

export const InventoryStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '在库', color: 'green' },
  destroyed: { label: '已销毁', color: 'red' },
};
