import { describe, it, expect } from 'vitest';
import {
  detectBannedWords,
  diagnoseListingQuality,
  summarizeListingIssues,
  calcListingProfit,
  profitLevelOf,
  BANNED_WORD_RULES,
  diagnoseListingFromSummary,
} from '../../modules/ecommerce/pages/ShopListing/listingCompliance';

/**
 * 电商店铺刊登合规与质量规则（D-769）
 *
 * 覆盖三类风险：
 * 1. 违禁词漏检 → 上架被平台拒绝 / 罚款（直接经济损失）
 * 2. 误伤 → 正常描述被判违规，运营被迫乱改（会逼人绕过规则）
 * 3. 质量诊断漏项 → 上架后才发现缺图缺价
 */
describe('店铺刊登合规与质检（D-769）', () => {
  describe('违禁词检测', () => {
    it('绝对化用语必须命中', () => {
      const hits = detectBannedWords('国家级高品质纯棉T恤');
      expect(hits.map((h) => h.word)).toContain('国家级');
      expect(hits[0].categoryLabel).toBeTruthy();
    });

    it('医疗功效宣称必须命中', () => {
      const hits = detectBannedWords('塑形紧身裤 燃脂减肥');
      expect(hits.map((h) => h.word)).toEqual(expect.arrayContaining(['塑形', '减肥']));
    });

    it('品牌侵权大小写都要能命中（gucci / GUCCI）', () => {
      expect(detectBannedWords('GUCCI同款衬衫').length).toBeGreaterThan(0);
      expect(detectBannedWords('gucci 同款衬衫').length).toBeGreaterThan(0);
    });

    it('虚假促销必须命中', () => {
      const hits = detectBannedWords('全网最低价 亏本甩卖');
      expect(hits.map((h) => h.word)).toEqual(expect.arrayContaining(['全网最低', '亏本甩卖']));
    });

    it('必须返回命中的原文片段，便于运营定位', () => {
      const hits = detectBannedWords('高端晚礼服，达到国家级标准');
      const hit = hits.find((h) => h.word === '国家级')!;
      expect(hit.matchedText).toBe('国家级');
      expect(hit.reason).toBeTruthy();
    });

    /**
     * 「执行国家标准」是**陈述所依据的标准**（事实描述），不是宣称自己「国家级」，
     * 广告法禁的是后者。故必须放行——误伤会逼运营去改正常的合规表述。
     */
    it('「执行国家标准」属事实陈述，不得误伤', () => {
      expect(detectBannedWords('高端晚礼服，执行国家标准')).toEqual([]);
    });

    it('正常商品描述不得误伤（误伤会逼运营绕过规则）', () => {
      const safe = [
        '2026春季新款纯棉短袖T恤 宽松显瘦 春夏百搭',
        '重磅纯棉 男女同款 短袖 圆领 情侣装',
        '韩版宽松工装裤 多袋工装阔腿裤',
        '儿童连衣裙 公主裙 泡泡袖 婚礼走秀',
        '男士西服套装 商务正装 免烫衬衫搭配',
      ];
      for (const t of safe) {
        expect(detectBannedWords(t), `不应误伤：${t}`).toEqual([]);
      }
    });

    it('空值不得报错', () => {
      expect(detectBannedWords(null)).toEqual([]);
      expect(detectBannedWords(undefined)).toEqual([]);
      expect(detectBannedWords('')).toEqual([]);
    });

    it('词库不得有重复词（避免同一处报两条）', () => {
      const words = BANNED_WORD_RULES.map((r) => r.word);
      expect(new Set(words).size).toBe(words.length);
    });

    it('每条词库规则都必须填原因（否则运营不知道为什么不能发）', () => {
      for (const r of BANNED_WORD_RULES) {
        expect(r.reason, `${r.word} 缺原因`).toBeTruthy();
      }
    });
  });

  describe('刊登质量诊断', () => {
    const complete = {
      styleNo: 'BR24XQ0098',
      styleName: '2026春季新款纯棉短袖T恤 宽松显瘦',
      cover: 'http://x/1.jpg',
      skus: [
        { salesPrice: 89, stockQuantity: 100, color: '白', image: 'http://x/w.jpg' },
      ],
    };

    it('资料齐全时无问题，可上架', () => {
      const issues = diagnoseListingQuality(complete);
      expect(summarizeListingIssues(issues).canPublish).toBe(true);
    });

    it('缺主图必须阻断上架', () => {
      const issues = diagnoseListingQuality({ ...complete, cover: null });
      expect(issues.some((i) => i.level === 'block' && i.field === '主图')).toBe(true);
      expect(summarizeListingIssues(issues).canPublish).toBe(false);
    });

    it('缺款号必须阻断（顾客端无法识别商品）', () => {
      const issues = diagnoseListingQuality({ ...complete, styleNo: '' });
      expect(issues.some((i) => i.level === 'block' && i.field === '款号')).toBe(true);
    });

    it('无 SKU 必须阻断', () => {
      const issues = diagnoseListingQuality({ ...complete, skus: [] });
      expect(issues.some((i) => i.level === 'block' && i.field === 'SKU')).toBe(true);
    });

    it('售价全为 0 必须阻断（无法下单）', () => {
      const issues = diagnoseListingQuality({
        ...complete,
        skus: [{ salesPrice: 0, stockQuantity: 5, image: 'a' }],
      });
      expect(issues.some((i) => i.field === '售价' && i.level === 'block')).toBe(true);
    });

    it('库存全为 0 必须阻断（平台会自动下架）', () => {
      const issues = diagnoseListingQuality({
        ...complete,
        skus: [{ salesPrice: 89, stockQuantity: 0, image: 'a' }],
      });
      expect(issues.some((i) => i.field === '库存' && i.level === 'block')).toBe(true);
    });

    it('标题超长只警告不阻断（平台会截断，不至于发不出去）', () => {
      const issues = diagnoseListingQuality({
        ...complete,
        styleName: '款'.repeat(80),
      });
      const t = issues.find((i) => i.field === '商品标题')!;
      expect(t.level).toBe('warn');
      expect(summarizeListingIssues(issues).canPublish).toBe(true);
    });

    it('标题过短只警告并给建议', () => {
      const issues = diagnoseListingQuality({ ...complete, styleName: 'T恤' });
      const t = issues.find((i) => i.field === '商品标题')!;
      expect(t.level).toBe('warn');
      expect(t.action).toBeTruthy();
    });

    it('标题含违禁词必须阻断', () => {
      const issues = diagnoseListingQuality({
        ...complete,
        styleName: '国家级品质纯棉短袖T恤',
      });
      expect(summarizeListingIssues(issues).canPublish).toBe(false);
    });

    it('每条问题都必须带修复建议（只报错不给路等于没用）', () => {
      const issues = diagnoseListingQuality({ styleNo: '', styleName: '', cover: null, skus: [] });
      expect(issues.length).toBeGreaterThan(0);
      for (const i of issues) {
        expect(i.action, `${i.field} 缺修复建议`).toBeTruthy();
        expect(i.message).toBeTruthy();
      }
    });

    it('阻断项与警告项计数必须正确', () => {
      const issues = diagnoseListingQuality({ styleNo: '', styleName: 'T恤', cover: 'a', skus: [] });
      const s = summarizeListingIssues(issues);
      expect(s.canPublish).toBe(false);
      expect(s.blockCount).toBeGreaterThan(0);
      expect(s.warnCount).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * 列表列用的是聚合口径（列表接口只返回 minPrice/totalStock/skuCount，
   * 没有 per-SKU 明细）。这里锁住聚合口径不得漏判——
   * 漏判会让运营以为「可上架」，上架后被平台拒绝。
   */
  describe('聚合口径体检（列表列用）', () => {
    const ok = {
      styleNo: 'BR24XQ0098',
      styleName: '2026春季新款纯棉短袖T恤 宽松显瘦',
      cover: 'http://x/1.jpg',
      minPrice: 89,
      maxPrice: 89,
      totalStock: 100,
      skuCount: 3,
    };

    it('资料齐全且无告警时，issues 为空（列上显示「可上架」）', () => {
      expect(diagnoseListingFromSummary(ok)).toEqual([]);
    });

    it('缺主图必须阻断', () => {
      const issues = diagnoseListingFromSummary({ ...ok, cover: null });
      expect(summarizeListingIssues(issues).canPublish).toBe(false);
    });

    it('skuCount 为 0 必须阻断（未维护 SKU）', () => {
      const issues = diagnoseListingFromSummary({ ...ok, skuCount: 0 });
      expect(issues.some((i) => i.field === 'SKU' && i.level === 'block')).toBe(true);
    });

    it('可售库存为 0 必须阻断（平台会自动下架）', () => {
      const issues = diagnoseListingFromSummary({ ...ok, totalStock: 0 });
      expect(issues.some((i) => i.field === '库存' && i.level === 'block')).toBe(true);
    });

    it('未设售价必须阻断', () => {
      const issues = diagnoseListingFromSummary({ ...ok, minPrice: null, maxPrice: null });
      expect(issues.some((i) => i.field === '售价' && i.level === 'block')).toBe(true);
    });

    it('标题含违禁词必须阻断', () => {
      const issues = diagnoseListingFromSummary({ ...ok, styleName: '国家级纯棉短袖T恤 宽松' });
      expect(summarizeListingIssues(issues).canPublish).toBe(false);
    });

    it('summary 尚未加载（全部 undefined）不得误判成可上架', () => {
      const issues = diagnoseListingFromSummary({});
      const s = summarizeListingIssues(issues);
      expect(s.canPublish).toBe(false);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('聚合口径不得声称「颜色图缺失」——它看不到 per-SKU 图像', () => {
      expect(diagnoseListingFromSummary(ok).some((i) => i.field === '颜色图')).toBe(false);
    });
  });

  describe('利润核算', () => {
    it('正常计算利润额与毛利率', () => {
      expect(calcListingProfit(100, 60)).toEqual({ profit: 40, marginRate: 40 });
    });

    it('售价低于成本应得到负利润（亏损必须暴露，不能被四舍五入抹平）', () => {
      expect(calcListingProfit(50, 60)).toEqual({ profit: -10, marginRate: -20 });
    });

    it('成本缺失必须返回 null，禁止用 0 冒充成本', () => {
      expect(calcListingProfit(100, null)).toBeNull();
      expect(calcListingProfit(100, undefined)).toBeNull();
      expect(calcListingProfit(100, 0)).toBeNull();
    });

    it('售价非法时返回 null', () => {
      expect(calcListingProfit(0, 60)).toBeNull();
      expect(calcListingProfit(null, 60)).toBeNull();
    });

    it('毛利率分级边界正确', () => {
      expect(profitLevelOf(-1)).toBe('loss');
      expect(profitLevelOf(0)).toBe('loss');
      expect(profitLevelOf(5)).toBe('low');
      expect(profitLevelOf(39.99)).toBe('normal');
      expect(profitLevelOf(40)).toBe('high');
      expect(profitLevelOf(80)).toBe('high');
    });
  });
});