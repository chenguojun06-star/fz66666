import { describe, it, expect } from 'vitest';
import { STAGE_ORDER, getScanTypeFromNodeKey } from '../../utils/productionStage';
import { clampProgress } from '../../modules/production/utils/calcOrderProgress';
import { getProgressColorStatus } from '../../utils/progressColor';

// 规则17 修订：采购/入库分属供应链与仓储模块，生产工序固定为4阶段（见 utils/productionStage.ts 头注释）
describe('STAGE_ORDER - 4大固定生产工序节点', () => {
  it('返回4个固定节点', () => {
    expect(STAGE_ORDER).toHaveLength(4);
  });

  it('顺序正确: 裁剪→二次工艺→车缝→尾部', () => {
    expect(STAGE_ORDER[0]).toBe('裁剪');
    expect(STAGE_ORDER[1]).toBe('二次工艺');
    expect(STAGE_ORDER[2]).toBe('车缝');
    expect(STAGE_ORDER[3]).toBe('尾部');
  });
});

describe('getScanTypeFromNodeKey - 节点key到scanType映射', () => {
  it('sewing→production (规则18: sewing自动转为production)', () => {
    expect(getScanTypeFromNodeKey('sewing')).toBe('production');
  });

  it('carSewing→production', () => {
    expect(getScanTypeFromNodeKey('carSewing')).toBe('production');
  });

  it('procurement→production (采购归入production)', () => {
    expect(getScanTypeFromNodeKey('procurement')).toBe('production');
  });

  it('cutting→cutting', () => {
    expect(getScanTypeFromNodeKey('cutting')).toBe('cutting');
  });

  it('quality→quality', () => {
    expect(getScanTypeFromNodeKey('quality')).toBe('quality');
  });

  it('warehousing→warehouse', () => {
    expect(getScanTypeFromNodeKey('warehousing')).toBe('warehouse');
  });

  it('ironing→production (整烫归入production)', () => {
    expect(getScanTypeFromNodeKey('ironing')).toBe('production');
  });

  it('secondaryProcess→production (二次工艺归入production)', () => {
    expect(getScanTypeFromNodeKey('secondaryProcess')).toBe('production');
  });

  it('packaging→production (包装归入production)', () => {
    expect(getScanTypeFromNodeKey('packaging')).toBe('production');
  });

  it('tailProcess→production (尾部归入production)', () => {
    expect(getScanTypeFromNodeKey('tailProcess')).toBe('production');
  });

  it('空字符串返回undefined', () => {
    expect(getScanTypeFromNodeKey('')).toBeUndefined();
  });

  it('未知key返回undefined', () => {
    expect(getScanTypeFromNodeKey('nonexistent')).toBeUndefined();
  });
});

describe('clampProgress - 进度值钳位', () => {
  it('正常值不变', () => {
    expect(clampProgress(50)).toBe(50);
  });

  it('超过100截断为100', () => {
    expect(clampProgress(150)).toBe(100);
  });

  it('负数截断为0', () => {
    expect(clampProgress(-10)).toBe(0);
  });

  it('0保持不变', () => {
    expect(clampProgress(0)).toBe(0);
  });

  it('100保持不变', () => {
    expect(clampProgress(100)).toBe(100);
  });

  it('小数四舍五入', () => {
    expect(clampProgress(50.6)).toBe(51);
  });
});

describe('getProgressColorStatus - 进度颜色状态', () => {
  it('null交期返回normal', () => {
    expect(getProgressColorStatus(null)).toBe('normal');
  });

  it('undefined交期返回normal', () => {
    expect(getProgressColorStatus(undefined)).toBe('normal');
  });

  it('completed状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'completed')).toBe('normal');
  });

  it('cancelled状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'cancelled')).toBe('normal');
  });

  it('scrapped状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'scrapped')).toBe('normal');
  });

  it('closed状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'closed')).toBe('normal');
  });

  it('archived状态返回normal', () => {
    expect(getProgressColorStatus('2099-12-31', 'archived')).toBe('normal');
  });
});
