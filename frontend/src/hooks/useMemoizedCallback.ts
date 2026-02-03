import React, { useCallback, useRef } from 'react';

/**
 * 记忆化回调Hook
 * 用于优化子组件的回调函数，避免不必要的重渲染
 * 
 * @example
 * const handleClick = useMemoizedCallback((id: string) => {
 *   console.log(id);
 * }, []);
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  const callbackRef = useRef(callback);
  
  // 更新回调引用
  callbackRef.current = callback;
  
  // 返回稳定的回调函数
  return useCallback(((...args: any[]) => {
    return callbackRef.current(...args);
  }) as T, deps);
}

/**
 * 记忆化事件处理Hook
 * 专门用于处理事件回调，自动处理事件对象
 */
export function useMemoizedEventHandler<
  E extends React.SyntheticEvent,
  T extends (event: E, ...args: any[]) => any
>(handler: T, deps: React.DependencyList): T {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  
  return useCallback(((event: E, ...args: any[]) => {
    event.persist?.();
    return handlerRef.current(event, ...args);
  }) as T, deps);
}
