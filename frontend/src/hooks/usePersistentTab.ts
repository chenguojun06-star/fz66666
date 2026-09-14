import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Tab 选中项持久化到 URL query —— 解决「刷新后 Tab 跳回第一个」的问题。
 *
 * 背景：antd 的 `defaultActiveKey` 是非受控写法，值只存在于组件内存中，
 *       页面刷新或路由离开再回来都会丢失，Tab 回到第一项。
 *       另一种常见写法 `useState('xxx')` + `activeKey` 也只是内存态，刷新同样丢失。
 *       改用本 hook 后，选中项写进 URL，刷新后自动还原。
 *
 * 用法：
 *   const [activeKey, setActiveKey] = usePersistentTab('orderTab', 'list');
 *   <Tabs activeKey={activeKey} onChange={setActiveKey} items={[...]} />
 *
 * 需要限定字面量类型时（比如要和其他 union 类型的 state 对齐）：
 *   const [tab, setTab] = usePersistentTab<'a' | 'b'>('myTab', 'a', ['a', 'b']);
 *
 * 设计取舍：
 *   - 用 URL 而不是 sessionStorage：链接可分享、可收藏，刷新和前进后退都能还原。
 *     项目里 StyleInfo / FinanceCenter 等页面已有 ?tab= 的先例，保持一致。
 *   - 每个 Tab 用独立的参数名（如 ?orderTab=list），同页面多个 Tab 不会互相覆盖。
 *   - 选中默认值时不写进 URL，避免污染地址栏。
 *   - setSearchParams 用 replace：切 Tab 不塞历史记录，点「返回」是直接离开页面
 *     而不是一个个 Tab 往回退（这符合多数人的预期）。
 *   - 传了 allowed 白名单时，URL 上的非法值会回退到默认值，避免手改地址栏导致白屏。
 *
 * @param paramName URL 参数名，同一页面内多个 Tab 需各不相同
 * @param defaultKey 默认选中项（也是 URL 无参数或值非法时的回退值）
 * @param allowed 可选，合法 key 白名单
 */
export function usePersistentTab<T extends string = string>(
  paramName: string,
  defaultKey: T,
  allowed?: readonly T[]
): readonly [T, (key: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(paramName);
  const isValid = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw));
  const activeKey = (isValid ? raw : defaultKey) as T;

  const setActiveKey = useCallback(
    (key: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === defaultKey) {
            next.delete(paramName);
          } else {
            next.set(paramName, key);
          }
          return next;
        },
        { replace: true }
      );
    },
    [paramName, defaultKey, setSearchParams]
  );

  return [activeKey, setActiveKey] as const;
}

export default usePersistentTab;
