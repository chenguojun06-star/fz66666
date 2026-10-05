import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D-702：data_card 事件必须真正被消费（回归守护）
 *
 * <p><b>这个洞是怎么漏掉的</b>：后端 {@code AiAgentOrchestrator} 在 DirectQueryRouter
 * 直查命中时会发 {@code data_card} 事件；{@code xiaoyunUnifiedHandler} 也有对应的
 * {@code case 'data_card'} 分支，并调用 {@code callbacks.onDataCard?.(data)}。
 *
 * <p>但 {@code useAiChatStream} 注册的 14 个回调里<b>独缺 onDataCard</b> ——
 * 可选链 {@code ?.()} 直接短路，事件被静默丢弃。
 *
 * <p>后果：「确定性查询 20s → 0.5s」的直查快路径，在 PC 端<b>只剩一句话，
 * 数据卡片完全不显示</b>；而 H5 恰好实现了该回调，于是三端表现不一致。
 *
 * <p>这类缺陷编译期无感知、运行期无报错（可选链吞掉）、后端日志一切正常，
 * 只能用「断言回调确实被注册」来防住。
 */
const streamFile = resolve(
  __dirname,
  '../useAiChatStream.ts',
);

describe('D-702 data_card 事件消费（直查卡片不能被丢弃）', () => {
  const src = readFileSync(streamFile, 'utf8');

  it('必须注册 onDataCard 回调', () => {
    expect(src).toContain('onDataCard:');
  });

  it('onDataCard 必须把卡片挂到消息上，而不是只更新瞬时状态', () => {
    const start = src.indexOf('onDataCard:');
    expect(start).toBeGreaterThan(-1);
    const segment = src.slice(start, start + 2200);
    // 卡片是"要随对话保留的业务内容"，必须进 messages，不能只进 LiveStatus
    expect(segment).toContain('safeSetMessages');
    expect(segment).toContain('cards:');
  });

  it('只渲染后端已确认的字段，不得展示未知键', () => {
    const start = src.indexOf('onDataCard:');
    const segment = src.slice(start, start + 2200);
    // 白名单式取字段，避免把含义不明的数字渲染给用户
    expect(segment).toContain('overallProgress');
    expect(segment).toContain('expectedShipDate');
    expect(segment).toContain('未知');
  });

  it('必须声明数据来源，让用户可区分"查库结果"与"AI 生成"', () => {
    const start = src.indexOf('onDataCard:');
    const segment = src.slice(start, start + 2200);
    expect(segment).toContain('直接查库');
  });

  it('DataCardEvent 类型须包含后端实际发送的 order_progress', () => {
    const handler = readFileSync(
      resolve(__dirname, '../../../../services/intelligence/xiaoyunUnifiedHandler.ts'),
      'utf8',
    );
    expect(handler).toMatch(/type:\s*'chart'[\s\S]*'order_progress'/);
  });
});