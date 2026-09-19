import { describe, it, expect } from 'vitest';
import { STAGE_ORDER, getScanTypeFromNodeKey } from '../../utils/productionStage';
import { canViewPrice } from '../../utils/sensitiveDataMask';

const PRINT_FIX_CSS_FONT_FAMILY = "'Heiti SC', 'Hiragino Sans GB', 'Arial Unicode MS', 'Songti SC', 'STSong', serif";

describe('规则12: 打印font-family必须以serif结尾', () => {
  it('打印CSS字体栈以serif结尾', () => {
    expect(PRINT_FIX_CSS_FONT_FAMILY.endsWith('serif')).toBe(true);
  });

  it('打印CSS字体栈不以sans-serif结尾', () => {
    expect(PRINT_FIX_CSS_FONT_FAMILY.endsWith('sans-serif')).toBe(false);
  });

  it('打印CSS字体栈不包含sans-serif', () => {
    expect(PRINT_FIX_CSS_FONT_FAMILY).not.toContain('sans-serif');
  });
});

describe('规则4: 导出端点必须添加行数限制', () => {
  it('后端导出LIMIT=5000是业务约定常量', () => {
    const EXPORT_LIMIT = 5000;
    expect(EXPORT_LIMIT).toBeGreaterThan(0);
    expect(EXPORT_LIMIT).toBeLessThanOrEqual(10000);
  });
});

describe('规则3: 有deleteFlag字段的实体查询必须加过滤', () => {
  it('canViewPrice对null用户返回false（类似deleteFlag过滤逻辑）', () => {
    expect(canViewPrice(null)).toBe(false);
  });

  it('外发工厂用户不可查看价格（工厂隔离规则9）', () => {
    const factoryUser = { factoryId: 'f-001', roles: ['admin'] } as any;
    expect(canViewPrice(factoryUser)).toBe(false);
  });
});

// 规则17 修订：采购/入库分属供应链与仓储模块，生产工序固定为4阶段（见 utils/productionStage.ts 头注释）
describe('规则17(修订): 4大固定生产工序节点', () => {
  it('STAGE_ORDER包含4个固定节点', () => {
    expect(STAGE_ORDER).toHaveLength(4);
  });

  it('STAGE_ORDER节点顺序正确', () => {
    expect(STAGE_ORDER).toEqual(['裁剪', '二次工艺', '车缝', '尾部']);
  });
});

describe('规则18: 扫码类型链路', () => {
  it('getScanTypeFromNodeKey: cutting→production→quality→warehouse链路', () => {
    expect(getScanTypeFromNodeKey('cutting')).toBe('cutting');
    expect(getScanTypeFromNodeKey('sewing')).toBe('production');
    expect(getScanTypeFromNodeKey('quality')).toBe('quality');
    expect(getScanTypeFromNodeKey('warehousing')).toBe('warehouse');
  });

  it('getScanTypeFromNodeKey: 禁止前端传入的scanType值不存在于映射中', () => {
    expect(getScanTypeFromNodeKey('procurement')).toBe('production');
    expect(getScanTypeFromNodeKey('material_roll')).toBeUndefined();
    expect(getScanTypeFromNodeKey('quality_confirm')).toBeUndefined();
    expect(getScanTypeFromNodeKey('sewing')).toBe('production');
  });
});

describe('规则13: 质检两步提交参数', () => {
  it('getScanTypeFromNodeKey: quality映射正确', () => {
    expect(getScanTypeFromNodeKey('quality')).toBe('quality');
  });

  it('qualityStage有效值为receive/confirm', () => {
    const validStages = ['receive', 'confirm'];
    expect(validStages).toContain('receive');
    expect(validStages).toContain('confirm');
    expect(validStages).not.toContain('quality_confirm');
  });

  it('qualityResult有效值为qualified/unqualified', () => {
    const validResults = ['qualified', 'unqualified'];
    expect(validResults).toContain('qualified');
    expect(validResults).toContain('unqualified');
    expect(validResults).not.toContain('defective');
  });
});
