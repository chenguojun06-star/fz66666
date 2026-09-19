import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStageConfig, computeStageBudgetHint } from '../../utils/progressTimeBudget';

describe('getStageConfig', () => {
  it('应该正确匹配采购节点', () => {
    expect(getStageConfig('采购物料')).toEqual(expect.objectContaining({ ratio: 0.30, label: '采购' }));
    expect(getStageConfig('物料准备')).toEqual(expect.objectContaining({ ratio: 0.30, label: '采购' }));
    expect(getStageConfig('备料')).toEqual(expect.objectContaining({ ratio: 0.30, label: '采购' }));
    expect(getStageConfig('fabric procurement')).toEqual(expect.objectContaining({ ratio: 0.30, label: '采购' }));
  });

  it('应该正确匹配裁剪节点', () => {
    expect(getStageConfig('裁剪车间')).toEqual(expect.objectContaining({ ratio: 0.15, label: '裁剪' }));
    expect(getStageConfig('cutting')).toEqual(expect.objectContaining({ ratio: 0.15, label: '裁剪' }));
  });

  it('应该正确匹配车缝节点', () => {
    expect(getStageConfig('车缝工序')).toEqual(expect.objectContaining({ ratio: 0.25, label: '车缝' }));
    expect(getStageConfig('sewing')).toEqual(expect.objectContaining({ ratio: 0.25, label: '车缝' }));
  });

  it('应该正确匹配大烫节点', () => {
    expect(getStageConfig('大烫')).toEqual(expect.objectContaining({ ratio: 0.10, label: '大烫' }));
    expect(getStageConfig('整烫')).toEqual(expect.objectContaining({ ratio: 0.10, label: '大烫' }));
    expect(getStageConfig('ironing')).toEqual(expect.objectContaining({ ratio: 0.10, label: '大烫' }));
  });

  it('应该正确匹配二次工艺节点', () => {
    expect(getStageConfig('二次工艺')).toEqual(expect.objectContaining({ ratio: 0.08, label: '二次工艺' }));
    expect(getStageConfig('绣花')).toEqual(expect.objectContaining({ ratio: 0.08, label: '二次工艺' }));
    expect(getStageConfig('secondary process')).toEqual(expect.objectContaining({ ratio: 0.08, label: '二次工艺' }));
  });

  it('应该正确匹配包装节点', () => {
    expect(getStageConfig('包装')).toEqual(expect.objectContaining({ ratio: 0.07, label: '包装' }));
    expect(getStageConfig('打包')).toEqual(expect.objectContaining({ ratio: 0.07, label: '包装' }));
  });

  it('应该正确匹配质检节点', () => {
    expect(getStageConfig('质检')).toEqual(expect.objectContaining({ ratio: 0.05, label: '质检' }));
    expect(getStageConfig('quality')).toEqual(expect.objectContaining({ ratio: 0.05, label: '质检' }));
  });

  it('应该正确匹配整体节点', () => {
    expect(getStageConfig('整体进度')).toEqual(expect.objectContaining({ ratio: 1.00, label: '整体' }));
    expect(getStageConfig('overall')).toEqual(expect.objectContaining({ ratio: 1.00, label: '整体' }));
  });

  it('未知节点返回默认配置', () => {
    expect(getStageConfig('未知节点')).toEqual(expect.objectContaining({ ratio: 0.10 }));
    expect(getStageConfig('特殊工序')).toEqual(expect.objectContaining({ ratio: 0.10 }));
  });

  it('未知节点label截取前4个字符', () => {
    expect(getStageConfig('ABCDEFGH')).toEqual(expect.objectContaining({ label: 'ABCD' }));
  });
});

describe('computeStageBudgetHint', () => {
  // 模拟固定当前时间
  const mockNow = new Date('2026-05-25T12:00:00Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('缺少必要参数返回null', () => {
    expect(computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: null,
      expectedShipDate: '2026-06-01',
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: false,
    })).toBeNull();

    expect(computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-01',
      expectedShipDate: null,
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: false,
    })).toBeNull();
  });

  it('总天数<=0返回null', () => {
    expect(computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-25',
      expectedShipDate: '2026-05-25',
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: false,
    })).toBeNull();

    expect(computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-26',
      expectedShipDate: '2026-05-25',
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: false,
    })).toBeNull();
  });

  it('已完成但无结束时间返回null', () => {
    expect(computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-01',
      expectedShipDate: '2026-06-01',
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: true,
      isProcureNode: false,
    })).toBeNull();
  });

  it('未开始的节点显示预算天数', () => {
    const result = computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-01',
      expectedShipDate: '2026-05-25',
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: false,
    });

    expect(result).not.toBeNull();
    expect(result?.text).toContain('预算');
  });

  it('进行中的节点显示剩余天数', () => {
    const result = computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-01',
      expectedShipDate: '2026-06-01',
      stageStartTime: '2026-05-20',
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: false,
    });

    expect(result).not.toBeNull();
    expect(result?.text).toContain('剩');
  });

  it('已完成的节点显示准时或超时', () => {
    // 准时完成
    const onTime = computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-01',
      expectedShipDate: '2026-06-01',
      stageStartTime: '2026-05-15',
      stageEndTime: '2026-05-20',
      isCompletedOrClosed: true,
      isProcureNode: false,
    });
    expect(onTime?.text).toContain('准时');

    // 超时完成
    const overTime = computeStageBudgetHint({
      nodeName: '车缝',
      orderCreateTime: '2026-05-01',
      expectedShipDate: '2026-06-01',
      stageStartTime: '2026-05-15',
      stageEndTime: '2026-06-05',
      isCompletedOrClosed: true,
      isProcureNode: false,
    });
    expect(overTime?.text).toContain('超');
  });

  it('采购节点待开始超过预算显示超期', () => {
    const result = computeStageBudgetHint({
      nodeName: '采购',
      orderCreateTime: '2026-05-01',
      expectedShipDate: '2026-06-01',
      stageStartTime: null,
      stageEndTime: null,
      isCompletedOrClosed: false,
      isProcureNode: true,
    });

    expect(result).not.toBeNull();
    expect(result?.text).toContain('待开始');
  });
});
