// 仓库仓位管理 - 纯函数工具
import type { LocationItem, LocationStatus } from './types';

// 生成库区编码：取首字母，若冲突则取下一个可用字母
export const generateZoneCode = (zoneName: string, existingZones: string[]): string => {
  if (!zoneName) return 'A';
  const firstChar = zoneName.trim().charAt(0).toUpperCase();
  if (/[A-Z]/.test(firstChar) && !existingZones.includes(firstChar)) return firstChar;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const l of letters) {
    if (!existingZones.includes(l)) return l;
  }
  return 'Z';
};

// 获取库位状态：空/正常/满/锁定
export const getLocationStatus = (loc: LocationItem): LocationStatus => {
  if (loc.status === 'DISABLED') return 'locked';
  if (!loc.usedCapacity || loc.usedCapacity === 0) return 'empty';
  if (loc.capacity && loc.usedCapacity >= loc.capacity * 0.8) return 'full';
  return 'normal';
};

// 状态对应文字颜色
export const getStatusColor = (status: LocationStatus): string => {
  switch (status) {
    case 'empty': return 'var(--color-text-quaternary)';
    case 'normal': return 'var(--color-success)';
    case 'full': return 'var(--color-warning)';
    case 'locked': return 'var(--color-danger)';
    default: return 'var(--color-text-quaternary)';
  }
};

// 状态对应背景色
export const getStatusBg = (status: LocationStatus): string => {
  switch (status) {
    case 'empty': return 'var(--color-bg-container)';
    case 'normal': return 'var(--status-success-bg)';
    case 'full': return '#FFFBE6';
    case 'locked': return '#F6FFED';
    default: return 'var(--color-bg-container)';
  }
};

// 状态对应边框色
export const getStatusBorder = (status: LocationStatus): string => {
  switch (status) {
    case 'empty': return 'var(--color-border-light)';
    case 'normal': return 'var(--status-success-border)';
    case 'full': return 'var(--status-warning-border)';
    case 'locked': return 'var(--status-error-border)';
    default: return 'var(--color-border-light)';
  }
};
