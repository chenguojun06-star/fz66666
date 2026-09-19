import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../utils/debounce';

describe('debounce 防抖函数', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该延迟执行函数', () => {
    const func = vi.fn();
    const debounced = debounce(func, 300);

    debounced();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('快速多次调用应该只执行最后一次', () => {
    const func = vi.fn();
    const debounced = debounce(func, 300);

    debounced('call 1');
    debounced('call 2');
    debounced('call 3');

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledTimes(1);
    expect(func).toHaveBeenCalledWith('call 3');
  });

  it('cancel 应该取消延迟执行', () => {
    const func = vi.fn();
    const debounced = debounce(func, 300);

    debounced();
    debounced.cancel();

    vi.advanceTimersByTime(300);
    expect(func).not.toHaveBeenCalled();
  });

  it('flush 应该立即执行函数', () => {
    const func = vi.fn();
    const debounced = debounce(func, 300);

    debounced('test');
    debounced.flush();
    expect(func).toHaveBeenCalledTimes(1);
    expect(func).toHaveBeenCalledWith('test');

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledTimes(1); // 不会再次执行
  });

  it('组件卸载时应该正确清理 timeout (模拟)', () => {
    const func = vi.fn();
    const debounced = debounce(func, 300);

    debounced();
    debounced.cancel(); // 模拟组件卸载时的清理

    vi.advanceTimersByTime(300);
    expect(func).not.toHaveBeenCalled();
  });

  it('应该保留 this 上下文', () => {
    const obj = {
      value: 42,
      getValue: function() {
        return this.value;
      }
    };

    const spy = vi.spyOn(obj, 'getValue');
    const debounced = debounce(obj.getValue, 300);

    debounced.call(obj);
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalled();
    expect(spy).toHaveReturnedWith(42);
  });
});
