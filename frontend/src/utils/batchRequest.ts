/**
 * D-471：批量请求分批执行工具
 *
 * 背景：部分"批量操作"在前端写成 `Promise.allSettled(items.map(fn))`，
 * 勾选 N 条就同时发出 N 个 HTTP 请求。2核4G 的服务器扛不住这种瞬时并发，
 * 后面的请求会超时/500（成品结算批量审批就是这样失败的）。
 *
 * 本工具把「一次全发」改成「一批一批发」（默认每批 5 个），既保留并发提速，
 * 又把瞬时压力控制在服务端可承受范围，且无需改动后端接口。
 */

/** 默认每批并发数：5 个足够快，又不会打爆 2核4G 的后端 */
export const DEFAULT_BATCH_SIZE = 5;

/**
 * 分批并发执行，返回与输入顺序一致的结果数组。
 *
 * @param items 待处理条目
 * @param fn    单条处理函数
 * @param batchSize 每批并发数
 */
export async function runInBatches<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const size = Math.max(1, batchSize);

  for (let start = 0; start < items.length; start += size) {
    const slice = items.slice(start, start + size);
    const batchResults = await Promise.allSettled(
      slice.map((item, i) => fn(item, start + i)),
    );
    batchResults.forEach((r, i) => {
      results[start + i] = r;
    });
  }
  return results;
}

/** 统计分批执行结果中的成功/失败数量 */
export function summarizeSettled<R>(results: PromiseSettledResult<R>[]): {
  succeeded: number;
  failed: number;
} {
  let succeeded = 0;
  let failed = 0;
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      succeeded++;
    } else {
      failed++;
    }
  });
  return { succeeded, failed };
}
