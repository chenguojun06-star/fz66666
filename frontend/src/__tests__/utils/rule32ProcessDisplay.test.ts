import { describe, it, expect } from 'vitest';
import {
  formatProcessDisplayName,
  STAGE_ORDER,
  getScanTypeFromNodeKey,
} from '../../utils/productionStage';
import { getProgressColorStatus } from '../../utils/progressColor';
import { canViewPrice } from '../../utils/sensitiveDataMask';

describe('工序编号+名称格式化 - 规则32', () => {
  it('编号+名称 → "01 裁剪"', () => {
    expect(formatProcessDisplayName('01', '裁剪')).toBe('01 裁剪');
  });

  it('编号+名称 → "03 上领"', () => {
    expect(formatProcessDisplayName('03', '上领')).toBe('03 上领');
  });

  it('仅有编号 → 返回编号', () => {
    expect(formatProcessDisplayName('01', '')).toBe('01');
  });

  it('仅有名称 → 返回名称', () => {
    expect(formatProcessDisplayName('', '裁剪')).toBe('裁剪');
  });

  it('两者为空 → 返回"-"', () => {
    expect(formatProcessDisplayName('', '')).toBe('-');
  });

  it('两者为undefined → 返回"-"', () => {
    expect(formatProcessDisplayName(undefined, undefined)).toBe('-');
  });

  it('编号为null → 返回名称', () => {
    expect(formatProcessDisplayName(null as unknown as string | undefined, '裁剪')).toBe('裁剪');
  });

  it('名称为null → 返回编号', () => {
    expect(formatProcessDisplayName('01', null as unknown as string | undefined)).toBe('01');
  });

  it('编号含空格 → trim后格式化', () => {
    expect(formatProcessDisplayName(' 01 ', ' 裁剪 ')).toBe('01 裁剪');
  });
});

describe('进度颜色工具 - getProgressColorStatus', () => {
  it('null交期返回normal', () => {
    expect(getProgressColorStatus(null)).toBe('normal');
  });

  it('undefined交期返回normal', () => {
    expect(getProgressColorStatus(undefined)).toBe('normal');
  });

  it('已完成状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'completed')).toBe('normal');
  });

  it('已关单状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'closed')).toBe('normal');
  });

  it('已取消状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'cancelled')).toBe('normal');
  });
});

describe('生产核心工具函数 - STAGE_ORDER & getScanTypeFromNodeKey', () => {
  it('STAGE_ORDER 包含4大固定生产工序节点', () => {
    expect(STAGE_ORDER).toHaveLength(4);
    expect(STAGE_ORDER[0]).toBe('裁剪');
    expect(STAGE_ORDER[3]).toBe('尾部');
  });

  it('getScanTypeFromNodeKey: sewing→production', () => {
    expect(getScanTypeFromNodeKey('sewing')).toBe('production');
  });

  it('getScanTypeFromNodeKey: cutting→cutting', () => {
    expect(getScanTypeFromNodeKey('cutting')).toBe('cutting');
  });

  it('getScanTypeFromNodeKey: quality→quality', () => {
    expect(getScanTypeFromNodeKey('quality')).toBe('quality');
  });

  it('getScanTypeFromNodeKey: warehousing→warehouse', () => {
    expect(getScanTypeFromNodeKey('warehousing')).toBe('warehouse');
  });

  it('getScanTypeFromNodeKey: procurement→production', () => {
    expect(getScanTypeFromNodeKey('procurement')).toBe('production');
  });

  it('getScanTypeFromNodeKey: 未知key返回undefined', () => {
    expect(getScanTypeFromNodeKey('unknown')).toBeUndefined();
  });
});

describe('业务规则校验 - canViewPrice', () => {
  it('null用户不可查看价格', () => {
    expect(canViewPrice(null)).toBe(false);
  });

  it('外发工厂用户不可查看价格', () => {
    const factoryUser = { factoryId: 'f-001', roles: ['admin'] } as any;
    expect(canViewPrice(factoryUser)).toBe(false);
  });
});
