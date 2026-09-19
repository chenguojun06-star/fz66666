import { describe, it, expect } from 'vitest';
import { formatProcessDisplayName } from '../../utils/productionStage';
import { canViewPrice } from '../../utils/sensitiveDataMask';

describe('formatProcessDisplayName', () => {
  it('应返回 "01 裁剪" 格式', () => {
    expect(formatProcessDisplayName('01', '裁剪')).toBe('01 裁剪');
  });

  it('应返回 "03 上领" 格式', () => {
    expect(formatProcessDisplayName('03', '上领')).toBe('03 上领');
  });

  it('processCode为空时返回processName', () => {
    expect(formatProcessDisplayName('', '裁剪')).toBe('裁剪');
  });

  it('processCode为undefined时返回processName', () => {
    expect(formatProcessDisplayName(undefined, '裁剪')).toBe('裁剪');
  });

  it('processName为空时返回processCode', () => {
    expect(formatProcessDisplayName('01', '')).toBe('01');
  });

  it('processName为undefined时返回processCode', () => {
    expect(formatProcessDisplayName('01', undefined)).toBe('01');
  });

  it('两者都为空时返回"-"', () => {
    expect(formatProcessDisplayName('', '')).toBe('-');
  });

  it('两者都为undefined时返回"-"', () => {
    expect(formatProcessDisplayName(undefined, undefined)).toBe('-');
  });

  it('应trim空格', () => {
    expect(formatProcessDisplayName(' 01 ', ' 裁剪 ')).toBe('01 裁剪');
  });
});

describe('canViewPrice', () => {
  it('null用户不可查看价格', () => {
    expect(canViewPrice(null)).toBe(false);
  });

  it('undefined用户不可查看价格', () => {
    expect(canViewPrice(undefined as any)).toBe(false);
  });
});
