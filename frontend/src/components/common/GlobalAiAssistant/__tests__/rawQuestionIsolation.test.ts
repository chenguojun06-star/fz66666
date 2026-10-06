import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D-755：直查必须只看「用户原话」（PC 端回归守护）
 *
 * <p><b>事故</b>：停在「生产管理模块」页时，任意问题（订单号、什么情况、快捷按钮）
 * 全部返回同一条异常检测卡片。
 *
 * <p><b>根因</b>：{@code buildContextualText()} 把两件不同的事拼进同一个 question ——
 * 用户原话 + 给 LLM 的提示（页面快捷建议 / 历史摘要）。后端直查是「包含关键词」的
 * 松散正则，在这整段上匹配：该页前 3 条建议里正好有「检测生产异常」，
 * 于是「停在哪个页面」决定了「问什么都被劫持」。
 *
 * <p>修复靠的是把原话<b>单独作为 rawQuestion 传出去</b>。这一步是纯接线，
 * 编译期无感知、运行期也不报错（只是又走回慢路径或被劫持），
 * 所以必须断言「参数确实传了、URL 确实拼了」。
 *
 * <p>注意：H5 / 小程序本来就只发原话（question 即用户输入），不受此问题影响，
 * 因此这里只守护 PC 端这两个文件。
 */
const apiFile = resolve(__dirname, '../../../../services/intelligence/intelligenceApi.ts');
const streamFile = resolve(__dirname, '../useAiChatStream.ts');

describe('D-755 直查只看用户原话（原话必须单独传，不能只传拼接后的上下文）', () => {
  const api = readFileSync(apiFile, 'utf8');
  const stream = readFileSync(streamFile, 'utf8');

  it('流式接口必须声明 rawQuestion 并拼进请求 URL', () => {
    expect(api).toContain('rawQuestion?: string');
    expect(api).toContain('&rawQuestion=');
  });

  it('流式调用必须同时带完整上下文与原话', () => {
    const start = stream.indexOf('intelligenceApi.aiAdvisorChatStream(');
    expect(start).toBeGreaterThan(-1);
    const call = stream.slice(start, stream.indexOf(');', start) + 2);
    // contextualText 仍要给 LLM（页面建议/历史对推理有用）
    expect(call).toContain('contextualText');
    // 但原话必须单独带，否则后端直查又会在整段上匹配
    expect(call).toContain('text');
  });

  it('非流式回退路径同样必须带原话', () => {
    const start = stream.indexOf('intelligenceApi.aiAdvisorChat(');
    expect(start).toBeGreaterThan(-1);
    const call = stream.slice(start, stream.indexOf(')', start) + 1);
    expect(call).toContain('contextualText');
    expect(call).toContain('text');
  });
});
