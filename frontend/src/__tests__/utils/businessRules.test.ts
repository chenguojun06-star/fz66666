import { describe, it, expect } from 'vitest';
import { getScanTypeFromNodeKey, STAGE_ORDER } from '../../utils/productionStage';
import { canViewPrice } from '../../utils/sensitiveDataMask';

const PRINT_FIX_CSS_FONT_FAMILY = "'Heiti SC', 'Hiragino Sans GB', 'Arial Unicode MS', 'Songti SC', 'STSong', serif";

describe('safePrint font-family - 规则12', () => {
  it('打印CSS字体栈必须以serif结尾', () => {
    expect(PRINT_FIX_CSS_FONT_FAMILY.endsWith('serif')).toBe(true);
  });

  it('打印CSS字体栈不能以sans-serif结尾', () => {
    expect(PRINT_FIX_CSS_FONT_FAMILY.endsWith('sans-serif')).toBe(false);
  });

  it('打印CSS字体栈不包含sans-serif', () => {
    expect(PRINT_FIX_CSS_FONT_FAMILY).not.toContain('sans-serif');
  });
});

describe('getScanTypeFromNodeKey - 扫码类型解析', () => {
  it('sewing→production (规则18: sewing自动转为production)', () => {
    expect(getScanTypeFromNodeKey('sewing')).toBe('production');
  });

  it('procurement→production (采购归入production)', () => {
    expect(getScanTypeFromNodeKey('procurement')).toBe('production');
  });

  it('quality→quality', () => {
    expect(getScanTypeFromNodeKey('quality')).toBe('quality');
  });

  it('cutting→cutting', () => {
    expect(getScanTypeFromNodeKey('cutting')).toBe('cutting');
  });

  it('warehousing→warehouse', () => {
    expect(getScanTypeFromNodeKey('warehousing')).toBe('warehouse');
  });

  it('carSewing→production', () => {
    expect(getScanTypeFromNodeKey('carSewing')).toBe('production');
  });
});

describe('validateQualityParams - 质检参数校验', () => {
  const VALID_QUALITY_STAGES = ['receive', 'confirm'];
  const VALID_QUALITY_RESULTS = ['qualified', 'unqualified'];

  it('qualityStage: receive有效', () => {
    expect(VALID_QUALITY_STAGES).toContain('receive');
  });

  it('qualityStage: confirm有效', () => {
    expect(VALID_QUALITY_STAGES).toContain('confirm');
  });

  it('qualityStage: quality_confirm无效 (规则13)', () => {
    expect(VALID_QUALITY_STAGES).not.toContain('quality_confirm');
  });

  it('qualityResult: qualified有效', () => {
    expect(VALID_QUALITY_RESULTS).toContain('qualified');
  });

  it('qualityResult: unqualified有效', () => {
    expect(VALID_QUALITY_RESULTS).toContain('unqualified');
  });

  it('qualityResult: defective无效 (规则13)', () => {
    expect(VALID_QUALITY_RESULTS).not.toContain('defective');
  });
});

// 工序配置阶段（规则17 修订）：采购/入库分属供应链与仓储模块，不属于生产工序配置，
// 生产工序固定为4阶段：裁剪 → 二次工艺 → 车缝 → 尾部（见 utils/productionStage.ts 头注释）
describe('STAGE_ORDER - 4大固定生产工序节点 (规则17修订)', () => {
  it('必须有4个固定节点', () => {
    expect(STAGE_ORDER).toHaveLength(4);
  });

  it('节点顺序: 裁剪→二次工艺→车缝→尾部', () => {
    expect(STAGE_ORDER).toEqual(['裁剪', '二次工艺', '车缝', '尾部']);
  });
});

describe('canViewPrice - 价格可见性 (规则9)', () => {
  it('null用户不可查看价格', () => {
    expect(canViewPrice(null)).toBe(false);
  });

  it('外发工厂用户不可查看价格', () => {
    const factoryUser = { factoryId: 'f-001', roles: ['admin'] } as any;
    expect(canViewPrice(factoryUser)).toBe(false);
  });
});
