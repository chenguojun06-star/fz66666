/**
 * 跨组件数据更新广播（window CustomEvent，轻量级，无全局状态库）
 *
 * 用途：某处增删改数据后，通知同页其他组件（下拉/自动完成）即时刷新，
 * 免去跳转字典管理/基础资料页维护后再回来的流程。
 *
 * kind 约定：
 * - `dict:${dictType}`  字典词条变更（如 dict:style_name）
 * - `customer`          客户主数据变更
 * - `supplier`          供应商主数据变更
 */

const EVENT_NAME = 'app:data-updated';

export function notifyDataUpdated(kind: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { kind } }));
}

/**
 * 订阅指定 kind 的数据更新；返回取消订阅函数（供 useEffect cleanup 使用）
 */
export function subscribeDataUpdated(kind: string, cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ kind: string }>).detail;
    if (detail?.kind === kind) cb();
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
