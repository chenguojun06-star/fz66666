import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeThinkingStage } from '../helpers';

/**
 * D-770 守护：后端 `thinking` 事件里带的 stage 必须被真正用起来。
 *
 * 后端早已在 `emitSse("thinking", Map.of("stage","planning"))` /
 * `("stage","querying")` 里带上阶段，但前端此前**直接忽略** —— 无论后端在做什么，
 * 用户永远只看到同一句「小云正在整理思路，准备给你结论…」，
 * 叠加长耗时就成了用户反馈的「一直思考 / 到处都在思考」。
 */
describe('thinking 阶段文案（D-770）', () => {
  it('planning / querying 必须给出不同且能说明在做什么的文案', () => {
    const planning = describeThinkingStage('planning');
    const querying = describeThinkingStage('querying');

    expect(planning).not.toBe(querying);
    expect(planning).toContain('理解');
    expect(querying).toContain('查数据');
  });

  it('未知 / 缺失 / 非字符串 stage 一律回退通用文案，且不得抛异常', () => {
    const fallback = '小云正在整理思路，准备给你结论…';
    expect(describeThinkingStage(undefined)).toBe(fallback);
    expect(describeThinkingStage(null)).toBe(fallback);
    expect(describeThinkingStage('')).toBe(fallback);
    expect(describeThinkingStage('unexpected-stage')).toBe(fallback);
    expect(describeThinkingStage(123)).toBe(fallback);
    expect(describeThinkingStage({ stage: 'planning' })).toBe(fallback);
  });

  it('接线必须真的用上它：thinking 分支不得再写死同一句文案', () => {
    const src = readFileSync(
      resolve(__dirname, '../useAiChatStream.ts'),
      'utf8',
    );
    const start = src.indexOf("case 'thinking':");
    expect(start).toBeGreaterThan(0);
    const branch = src.slice(start, start + 400);
    expect(branch).toContain('describeThinkingStage(event.data?.stage)');
    expect(branch).not.toContain("'小云正在整理思路，准备给你结论…'");
  });
});
