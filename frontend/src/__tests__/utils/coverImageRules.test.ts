import { describe, it, expect } from 'vitest';
import {
  evaluateCoverImage,
  isSquareish,
  formatFromUrl,
  formatBytes,
  manualCoverChecks,
  COVER_MIN_SIZE_PX,
  COVER_RECOMMEND_SIZE_PX,
  COVER_MAX_BYTES,
  COVER_WHITE_RATIO_MIN,
  COVER_SUBJECT_MIN,
} from '../../modules/ecommerce/pages/ShopListing/coverImageRules';

/**
 * 主图规范校验（D-778）
 *
 * 为什么要机器校验：
 * 平台对主图有**硬性下限**（拼多多白底图 480×480/<3M、淘宝系 1:1 800×800）。
 * 低于下限不是"不好看"，而是**平台直接判不合格 / 放大发糊 / 被裁掉商品边缘**。
 * 人工靠肉眼发现不了 796×800 这种差 4px 的问题，但平台会卡。
 */
describe('主图规范校验（D-778）', () => {
  describe('硬性阻断项', () => {
    it('缺主图元数据时不给任何结论（不得误伤）', () => {
      expect(evaluateCoverImage(null)).toEqual([]);
      expect(evaluateCoverImage(undefined)).toEqual([]);
      expect(evaluateCoverImage({ width: 0, height: 0 })).toEqual([]);
    });

    it('占位图必须阻断，且不再叠加其它尺寸提示', () => {
      const issues = evaluateCoverImage({ width: 1, height: 1 });
      expect(issues.length).toBe(1);
      expect(issues[0].level).toBe('block');
      expect(issues[0].message).toContain('占位图');
    });

    it(`短边低于 ${COVER_MIN_SIZE_PX}px 必须阻断（平台底线）`, () => {
      const issues = evaluateCoverImage({ width: 400, height: 400 });
      const block = issues.find((i) => i.level === 'block');
      expect(block).toBeTruthy();
      expect(block!.message).toContain(String(COVER_MIN_SIZE_PX));
    });

    it('恰好等于平台底线不应被阻断', () => {
      const issues = evaluateCoverImage({ width: COVER_MIN_SIZE_PX, height: COVER_MIN_SIZE_PX });
      expect(issues.filter((i) => i.level === 'block')).toHaveLength(0);
    });

    it('超过 3MB 必须阻断', () => {
      const issues = evaluateCoverImage({ width: 1000, height: 1000, bytes: COVER_MAX_BYTES + 1 });
      expect(issues.some((i) => i.level === 'block' && i.message.includes('3MB'))).toBe(true);
    });

    it('非 JPG/PNG 格式必须阻断', () => {
      for (const f of ['webp', 'gif', 'bmp', 'tiff']) {
        const issues = evaluateCoverImage({ width: 1000, height: 1000, format: f });
        expect(issues.some((i) => i.level === 'block' && i.message.includes(f.toUpperCase()))).toBe(
          true,
        );
      }
    });

    it('JPG / PNG 应放行格式检查', () => {
      for (const f of ['jpg', 'jpeg', 'png']) {
        const issues = evaluateCoverImage({ width: 1000, height: 1000, format: f });
        expect(issues.filter((i) => i.level === 'block')).toHaveLength(0);
      }
    });
  });

  describe('清晰度与比例建议', () => {
    it(`短边处于底线与推荐值之间只给 warn（${COVER_MIN_SIZE_PX}~${COVER_RECOMMEND_SIZE_PX}）`, () => {
      const issues = evaluateCoverImage({ width: 600, height: 600 });
      expect(issues.filter((i) => i.level === 'block')).toHaveLength(0);
      expect(issues.some((i) => i.level === 'warn' && i.message.includes('清晰度'))).toBe(true);
    });

    it('达到推荐清晰度后不再提示', () => {
      const issues = evaluateCoverImage({ width: 1000, height: 1000, format: 'jpg' });
      expect(issues).toEqual([]);
    });

    it('非 1:1 必须提示会被平台裁切', () => {
      const issues = evaluateCoverImage({ width: 502, height: 845, format: 'png' });
      const warn = issues.find((i) => i.level === 'warn' && i.message.includes('1:1'));
      expect(warn).toBeTruthy();
      expect(warn!.action).toContain('裁成正方形');
    });

    it('1:1 判定留容差，不误伤 795×800 这类', () => {
      expect(isSquareish(800, 800)).toBe(true);
      expect(isSquareish(795, 800)).toBe(true);
      expect(isSquareish(502, 845)).toBe(false);
      expect(isSquareish(0, 0)).toBe(false);
    });
  });

  describe('白底与主体占比', () => {
    it('非白底必须提示', () => {
      const issues = evaluateCoverImage({
        width: 1000, height: 1000, format: 'jpg', whiteRatio: 0.3,
      });
      expect(issues.some((i) => i.message.includes('不是白底'))).toBe(true);
    });

    it(`白底达到 ${COVER_WHITE_RATIO_MIN} 即视为通过`, () => {
      const issues = evaluateCoverImage({
        width: 1000, height: 1000, format: 'jpg', whiteRatio: COVER_WHITE_RATIO_MIN,
      });
      expect(issues.filter((i) => i.message.includes('不是白底'))).toHaveLength(0);
    });

    it(`主体占比低于 ${COVER_SUBJECT_MIN} 必须提示（低点击率主因）`, () => {
      const issues = evaluateCoverImage({
        width: 1000, height: 1000, format: 'jpg', whiteRatio: 1, subjectCoverage: 0.42,
      });
      expect(issues.some((i) => i.message.includes('主体仅占'))).toBe(true);
    });

    it('分析结果为 null 时必须跳过检查，不得当成不通过', () => {
      const issues = evaluateCoverImage({
        width: 1000, height: 1000, format: 'jpg',
        whiteRatio: null, subjectCoverage: null,
      });
      expect(issues).toEqual([]);
    });
  });

  describe('工具函数', () => {
    it('从 URL 推断格式，带查询串也能识别', () => {
      expect(formatFromUrl('/api/file/tenant-download/2/a.png')).toBe('png');
      expect(formatFromUrl('https://x/y/IMG_1.JPG?v=2')).toBe('jpg');
      expect(formatFromUrl('https://x/noext')).toBeNull();
      expect(formatFromUrl(null)).toBeNull();
    });

    it('字节数可读化', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(2048)).toBe('2 KB');
      expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
      expect(formatBytes(null)).toBe('未知');
    });

    it('必须显式告知机器判不了的人工检查项', () => {
      const checks = manualCoverChecks();
      expect(checks.length).toBeGreaterThanOrEqual(4);
      const joined = checks.join('|');
      expect(joined).toContain('联系方式');
      expect(joined).toContain('水印');
      expect(joined).toContain('安全区');
    });
  });

  describe('真实合规主图不应被拦', () => {
    it('1200×1200 白底 JPG 全项通过', () => {
      const issues = evaluateCoverImage({
        width: 1200, height: 1200, format: 'jpg',
        bytes: 1.2 * 1024 * 1024, whiteRatio: 0.96, subjectCoverage: 0.78,
      });
      expect(issues).toEqual([]);
    });
  });
});