import { describe, it, expect } from 'vitest';
import {
  describeToolName,
  extractOrderNo,
  isPurchaseDocFile,
  shouldAutoInbound,
  shouldAutoArrival,
  choose,
} from '../../components/common/GlobalAiAssistant/helpers';

describe('describeToolName - 工具名称映射', () => {
  it('空字符串返回"处理步骤"', () => {
    expect(describeToolName('')).toBe('处理步骤');
  });

  it('undefined返回"处理步骤"', () => {
    expect(describeToolName(undefined)).toBe('处理步骤');
  });

  it('已知工具名返回中文映射', () => {
    expect(describeToolName('tool_query_production_progress')).toBe('工序跟进');
    expect(describeToolName('tool_scan_undo')).toBe('扫码撤回');
    expect(describeToolName('tool_knowledge_search')).toBe('知识库问答');
    expect(describeToolName('tool_finished_product_stock')).toBe('成品库存');
  });

  it('超管专属工具对非超管用户显示"系统优化"', () => {
    expect(describeToolName('tool_critic_evolution', false)).toBe('系统优化');
    expect(describeToolName('tool_ai_self_optimize_report', false)).toBe('系统优化');
  });

  it('超管专属工具对超管用户显示真实名称', () => {
    expect(describeToolName('tool_critic_evolution', true)).toBe('批判进化');
  });

  it('未知工具名去掉tool_前缀并替换下划线', () => {
    expect(describeToolName('tool_unknown_feature')).toBe('系统能力');
  });
});

describe('extractOrderNo - 提取订单号', () => {
  it('从文本中提取大写字母+数字格式的订单号', () => {
    expect(extractOrderNo('请查看订单 ON20260501 的状态')).toBe('ON20260501');
  });

  it('提取纯数字长订单号', () => {
    expect(extractOrderNo('订单 20260501001 已完成')).toBe('20260501001');
  });

  it('无匹配返回undefined', () => {
    expect(extractOrderNo('今天天气不错')).toBeUndefined();
  });

  it('短数字不匹配（少于8位）', () => {
    expect(extractOrderNo('订单号 12345')).toBeUndefined();
  });

  it('大写字母+数字混合格式可匹配', () => {
    const result = extractOrderNo('订单 ON20260501 已发货');
    expect(result).toBe('ON20260501');
  });
});

describe('isPurchaseDocFile - 判断是否为采购单据文件', () => {
  it('jpg文件是采购单据', () => {
    const file = new File([''], 'scan.jpg', { type: 'image/jpeg' });
    expect(isPurchaseDocFile(file)).toBe(true);
  });

  it('png文件是采购单据', () => {
    const file = new File([''], 'receipt.png', { type: 'image/png' });
    expect(isPurchaseDocFile(file)).toBe(true);
  });

  it('pdf文件是采购单据', () => {
    const file = new File([''], 'invoice.pdf', { type: 'application/pdf' });
    expect(isPurchaseDocFile(file)).toBe(true);
  });

  it('xlsx文件不是采购单据', () => {
    const file = new File([''], 'data.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(isPurchaseDocFile(file)).toBe(false);
  });

  it('csv文件不是采购单据', () => {
    const file = new File([''], 'data.csv', { type: 'text/csv' });
    expect(isPurchaseDocFile(file)).toBe(false);
  });
});

describe('shouldAutoInbound - 判断是否自动入库', () => {
  it('包含"入库"关键词返回true', () => {
    expect(shouldAutoInbound('请帮我入库')).toBe(true);
  });

  it('包含"到货入库"关键词返回true', () => {
    expect(shouldAutoInbound('到货入库')).toBe(true);
  });

  it('包含"自动入库"关键词返回true', () => {
    expect(shouldAutoInbound('自动入库')).toBe(true);
  });

  it('不包含关键词返回false', () => {
    expect(shouldAutoInbound('请帮我查看库存')).toBe(false);
  });

  it('仅包含"到货"不触发入库', () => {
    expect(shouldAutoInbound('请帮我到货')).toBe(false);
  });
});

describe('shouldAutoArrival - 判断是否自动到货', () => {
  it('包含"自动收货"关键词返回true', () => {
    expect(shouldAutoArrival('自动收货')).toBe(true);
  });

  it('包含"收货"关键词返回true', () => {
    expect(shouldAutoArrival('请帮我收货')).toBe(true);
  });

  it('包含"一键收货"关键词返回true', () => {
    expect(shouldAutoArrival('一键收货')).toBe(true);
  });

  it('不包含关键词返回false', () => {
    expect(shouldAutoArrival('查看采购单')).toBe(false);
  });
});

describe('choose - 种子选择器', () => {
  it('空数组返回空字符串', () => {
    expect(choose(0, [])).toBe('');
  });

  it('单元素数组总是返回该元素', () => {
    expect(choose(0, ['a'])).toBe('a');
    expect(choose(999, ['a'])).toBe('a');
  });

  it('确定性：相同seed返回相同结果', () => {
    const variants = ['a', 'b', 'c', 'd'];
    expect(choose(3, variants)).toBe(choose(3, variants));
    expect(choose(7, variants)).toBe(choose(7, variants));
  });

  it('负数seed也能工作', () => {
    const variants = ['x', 'y'];
    const result = choose(-5, variants);
    expect(variants).toContain(result);
  });
});
