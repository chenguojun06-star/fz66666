import { describe, it, expect } from 'vitest';
import {
  looksLikeProductionContent,
  PRODUCTION_CONTENT_HINT,
} from '../../modules/ecommerce/pages/ShopListing/listingCompliance';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 生产工艺内容识别（D-781）
 *
 * 线上实测款式 BR25CQ0573B 的款式详情存的是生产工序文档，
 * 用户明确要求「生产工艺说明不应该出现在电商页面」。
 *
 * **最重要的一条是最后的「前后端词表一致性」** ——
 * 后端负责真正隐藏、前端只负责提示。两份词表一旦漂移，
 * 就会出现「前端说没问题、后端偷偷藏起来了」，运营完全无从察觉。
 */
describe('生产工艺内容识别（D-781）', () => {
  /** 线上真实工艺文档（截取自生产库原文） */
  const REAL_PROCESS_DOC =
    '大货工艺要求<br/>3 供应商管理有限公司 - 大货工艺制造单(2/2)<br/>' +
    '4 一、裁剪工艺说明：<br/>裁剪前需熨平熨烫，确认布号、正反面及丝布，裁剪按合同订单数量明细裁剪；<br/>' +
    '5 针织面料需松布2-4小时后可裁剪，拉布经纬纱向要求经直纬平，注意避开布疵点和色差；<br/>' +
    '7 裁片按顺序编号分包，避免大货出现色差现象。<br/>' +
    '二、工艺说明：<br/>9 绣花：图案颜色与工艺倒顺服版，花样不可起拱、浮线、断线、漏线、污渍、变形走样。';

  const REAL_CONSUMER_DESC =
    '经典真丝衬衫，桑蚕丝面料，垂坠感好不易起皱。翻领设计，日常通勤和正式场合都合适。' +
    '洗涤建议：手洗或干洗，阴凉处晾干，避免暴晒。';

  it('线上真实工艺文档必须被判为生产资料', () => {
    expect(looksLikeProductionContent(REAL_PROCESS_DOC)).toBe(true);
  });

  it('正常商品描述绝不能被误杀', () => {
    expect(looksLikeProductionContent(REAL_CONSUMER_DESC)).toBe(false);
  });

  it('只命中 1 个中性词不判定', () => {
    const t = '本款采用进口面料，经过特殊印染工艺处理，手感柔软舒适，版型修身显瘦，适合日常通勤。';
    expect(looksLikeProductionContent(t)).toBe(false);
  });

  it('短文本不判定（宁可漏判也不误杀）', () => {
    expect(looksLikeProductionContent('裁剪缝纫')).toBe(false);
  });

  it('空值安全', () => {
    expect(looksLikeProductionContent(null)).toBe(false);
    expect(looksLikeProductionContent('')).toBe(false);
    expect(looksLikeProductionContent('   ')).toBe(false);
  });

  it('提示文案必须说清「只是隐藏、没删数据」', () => {
    expect(PRODUCTION_CONTENT_HINT).toContain('隐藏');
    expect(PRODUCTION_CONTENT_HINT).toContain('内部仍可见');
  });

  it('前后端特征词表必须一致，否则会出现「前端说没问题、后端偷偷藏起来」', () => {
    const java = readFileSync(
      resolve(__dirname, '../../../../backend/src/main/java/com/fashion/supplychain/shop/orchestration/ProductionContentDetector.java'),
      'utf-8'
    );
    const ts = readFileSync(
      resolve(__dirname, '../../modules/ecommerce/pages/ShopListing/listingCompliance.ts'),
      'utf-8'
    );
    // 取后端 PROCESS_MARKERS 里的中文词，逐个在前端词表里找
    const javaBlock = java.slice(
      java.indexOf('PROCESS_MARKERS = {'),
      java.indexOf('};', java.indexOf('PROCESS_MARKERS = {'))
    );
    const markers = Array.from(javaBlock.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
    expect(markers.length).toBeGreaterThan(10);
    const missing = markers.filter((m) => !ts.includes(`'${m}'`));
    expect(missing).toEqual([]);

    // 阈值也必须一致
    expect(java).toContain('MIN_HITS = 2');
    expect(ts).toContain('PROCESS_MIN_HITS = 2');
    expect(java).toContain('MIN_LENGTH = 40');
    expect(ts).toContain('PROCESS_MIN_LENGTH = 40');
  });
});