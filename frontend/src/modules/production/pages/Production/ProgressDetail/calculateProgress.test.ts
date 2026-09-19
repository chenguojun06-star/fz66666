import { describe, it, expect, beforeEach } from 'vitest';
import type { ProductionOrder, CuttingBundle, ScanRecord } from '@/types/production';
import {
  calculateProgressFromBundles,
  stripWarehousingNode,
  clampPercent,
  setDynamicParentMapping,
} from './utils';

describe('calculateProgressFromBundles', () => {
  beforeEach(() => {
    setDynamicParentMapping({});
  });

  const makeOrder = (overrides = {}) => ({
    id: 'order-1',
    orderNo: 'ORD-001',
    productionProgress: 50,
    ...overrides,
  } as unknown as ProductionOrder);

  const makeBundle = (overrides = {}) => ({
    id: 'bundle-1',
    productionOrderId: 'order-1',
    productionOrderNo: 'ORD-001',
    quantity: 100,
    ...overrides,
  } as unknown as CuttingBundle);

  const makeScan = (overrides = {}) => ({
    scanResult: 'success',
    quantity: 50,
    progressStage: '裁剪',
    processName: '裁剪',
    ...overrides,
  } as unknown as ScanRecord);

  it('无菲号时回退到 order.productionProgress', () => {
    const order = makeOrder({ productionProgress: 42 });
    const result = calculateProgressFromBundles(order, [], []);
    expect(result).toBe(42);
  });

  it('节点数<=1时回退到 order.productionProgress', () => {
    const order = makeOrder({ productionProgress: 30 });
    const bundles = [makeBundle()];
    const nodes = [{ id: 'cutting', name: '裁剪' }];
    const result = calculateProgressFromBundles(order, bundles, [], nodes);
    expect(result).toBe(30);
  });

  it('所有节点100%完成时返回100', () => {
    const order = makeOrder();
    const bundles = [makeBundle({ quantity: 100 })];
    const scans = [
      makeScan({ progressStage: '裁剪', quantity: 100 }),
      makeScan({ progressStage: '车缝', quantity: 100 }),
      makeScan({ progressStage: '尾部', quantity: 100 }),
    ];
    const nodes = [
      { id: 'cutting', name: '裁剪' },
      { id: 'sewing', name: '车缝' },
      { id: 'tail', name: '尾部' },
    ];
    const result = calculateProgressFromBundles(order, bundles, scans, nodes);
    expect(result).toBe(100);
  });

  it('第一个节点50%完成时，后续节点不计入', () => {
    const order = makeOrder();
    const bundles = [makeBundle({ quantity: 100 })];
    const scans = [
      makeScan({ progressStage: '裁剪', quantity: 50 }),
    ];
    const nodes = [
      { id: 'cutting', name: '裁剪' },
      { id: 'sewing', name: '车缝' },
      { id: 'tail', name: '尾部' },
    ];
    const result = calculateProgressFromBundles(order, bundles, scans, nodes);
    expect(result).toBe(17);
  });

  it('98%阈值视为完成', () => {
    const order = makeOrder();
    const bundles = [makeBundle({ quantity: 100 })];
    const scans = [
      makeScan({ progressStage: '裁剪', quantity: 98 }),
    ];
    const nodes = [
      { id: 'cutting', name: '裁剪' },
      { id: 'sewing', name: '车缝' },
    ];
    const result = calculateProgressFromBundles(order, bundles, scans, nodes);
    expect(result).toBe(50);
  });

  it('第一个节点完成，第二个节点50%', () => {
    const order = makeOrder();
    const bundles = [makeBundle({ quantity: 100 })];
    const scans = [
      makeScan({ progressStage: '裁剪', quantity: 100 }),
      makeScan({ progressStage: '车缝', quantity: 50 }),
    ];
    const nodes = [
      { id: 'cutting', name: '裁剪' },
      { id: 'sewing', name: '车缝' },
    ];
    const result = calculateProgressFromBundles(order, bundles, scans, nodes);
    expect(result).toBe(75);
  });

  it('scanResult非success的记录不计入', () => {
    const order = makeOrder();
    const bundles = [makeBundle({ quantity: 100 })];
    const scans = [
      makeScan({ progressStage: '裁剪', quantity: 100, scanResult: 'duplicate' }),
      makeScan({ progressStage: '裁剪', quantity: 50, scanResult: 'success' }),
    ];
    const nodes = [
      { id: 'cutting', name: '裁剪' },
      { id: 'sewing', name: '车缝' },
    ];
    const result = calculateProgressFromBundles(order, bundles, scans, nodes);
    expect(result).toBe(25);
  });
});

describe('stripWarehousingNode', () => {
  it('过滤出货节点', () => {
    const nodes = [
      { id: 'cutting', name: '裁剪' },
      { id: 'shipment', name: '出货' },
      { id: 'sewing', name: '车缝' },
    ];
    const result = stripWarehousingNode(nodes);
    expect(result).toHaveLength(2);
    expect(result.every((n) => (n as any).id !== 'shipment')).toBe(true);
  });

  it('过滤发货节点', () => {
    const nodes = [
      { id: 'tail', name: '尾部' },
      { id: 'ship', name: '发货' },
    ];
    const result = stripWarehousingNode(nodes);
    expect(result).toHaveLength(1);
  });

  it('空数组返回空', () => {
    expect(stripWarehousingNode([])).toEqual([]);
  });
});

describe('clampPercent', () => {
  it('正常值直接返回', () => {
    expect(clampPercent(50)).toBe(50);
  });

  it('超过100截断为100', () => {
    expect(clampPercent(150)).toBe(100);
  });

  it('负数截断为0', () => {
    expect(clampPercent(-10)).toBe(0);
  });

  it('NaN返回0', () => {
    expect(clampPercent(NaN)).toBe(0);
  });

  it('小数四舍五入', () => {
    expect(clampPercent(33.6)).toBe(34);
    expect(clampPercent(33.4)).toBe(33);
  });
});
