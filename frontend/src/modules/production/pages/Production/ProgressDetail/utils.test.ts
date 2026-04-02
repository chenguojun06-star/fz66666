/**
 * stageNameMatches 单元测试
 * 核心场景：扫码单个子工序不能带连同父节点下所有兄弟工序
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { stageNameMatches, setDynamicParentMapping } from './utils';

// ─── 无动态映射（纯静态关键词匹配）─────────────────────────────
describe('stageNameMatches — 无动态映射', () => {
  beforeEach(() => {
    setDynamicParentMapping({});
  });

  it('完全相同名称返回 true', () => {
    expect(stageNameMatches('裁剪', '裁剪')).toBe(true);
  });

  it('canonicalKey 同义词：大烫 = 整烫 → true', () => {
    expect(stageNameMatches('大烫', '整烫')).toBe(true);
  });

  it('同一裁剪关键词变体匹配（裁床）', () => {
    expect(stageNameMatches('裁剪', '裁床')).toBe(true);
  });

  it('尾部父节点匹配整烫子阶段 → true（旧数据兼容）', () => {
    expect(stageNameMatches('尾部', '整烫')).toBe(true);
  });

  it('尾部父节点匹配质检子阶段 → true（旧数据兼容）', () => {
    expect(stageNameMatches('尾部', '质检')).toBe(true);
  });

  it('完全不相关的工序名 → false', () => {
    expect(stageNameMatches('裁剪', '质检')).toBe(false);
  });
});

// ─── 有动态映射（模拟真实尾部子工序配置）─────────────────────────
describe('stageNameMatches — 有动态映射（尾部子工序）', () => {
  beforeEach(() => {
    setDynamicParentMapping({
      '剪线': '尾部',
      '整烫': '尾部',
      '质检': '尾部',
      '包装': '尾部',
    });
  });

  //  核心回归测试：扫码单个工序不能带连兄弟
  it('【核心】扫剪线不能匹配整烫节点 → false', () => {
    expect(stageNameMatches('整烫', '剪线')).toBe(false);
  });

  it('【核心】扫剪线不能匹配质检节点 → false', () => {
    expect(stageNameMatches('质检', '剪线')).toBe(false);
  });

  it('【核心】扫剪线不能匹配包装节点 → false', () => {
    expect(stageNameMatches('包装', '剪线')).toBe(false);
  });

  it('【核心】扫整烫不能匹配剪线节点 → false', () => {
    expect(stageNameMatches('剪线', '整烫')).toBe(false);
  });

  it('【核心】扫质检不能匹配包装节点 → false', () => {
    expect(stageNameMatches('包装', '质检')).toBe(false);
  });

  //  同名匹配仍然正确
  it('剪线节点匹配剪线扫码记录 → true', () => {
    expect(stageNameMatches('剪线', '剪线')).toBe(true);
  });

  it('整烫节点匹配整烫扫码记录 → true', () => {
    expect(stageNameMatches('整烫', '整烫')).toBe(true);
  });

  //  父节点匹配子节点（父→子方向仍然有效）
  it('尾部父节点匹配剪线扫码 → true（父子关系）', () => {
    expect(stageNameMatches('尾部', '剪线')).toBe(true);
  });

  it('尾部父节点匹配整烫扫码 → true（父子关系）', () => {
    expect(stageNameMatches('尾部', '整烫')).toBe(true);
  });

  //  子节点 → 父节点方向（扫码 progressStage=尾部，节点名=剪线）
  it('子节点名剪线 vs 记录progressStage尾部 → true（子→父兼容）', () => {
    expect(stageNameMatches('剪线', '尾部')).toBe(true);
  });
});

// ─── 有动态映射（二次工艺子工序）────────────────────────────────────
// 节点结构：二次工艺（父）→ 绣花、印花（子）；尾部（父）→ 剪线、整烫（子）
describe('stageNameMatches — 有动态映射（二次工艺子工序）', () => {
  beforeEach(() => {
    setDynamicParentMapping({
      '剪线': '尾部',
      '整烫': '尾部',
      '绣花': '二次工艺',
      '印花': '二次工艺',
    });
  });

  it('【核心】不同父节点下的工序不匹配（剪线 vs 绣花）→ false', () => {
    // 剪线属尾部，绣花属二次工艺，跨父不匹配
    expect(stageNameMatches('绣花', '剪线')).toBe(false);
  });

  it('绣花不能匹配印花（同父兄弟）→ false', () => {
    // 同属二次工艺，但兄弟之间不匹配
    expect(stageNameMatches('绣花', '印花')).toBe(false);
  });

  it('二次工艺父节点匹配绣花 → true', () => {
    // 父节点可聚合其下所有子工序扫码
    expect(stageNameMatches('二次工艺', '绣花')).toBe(true);
  });
});
