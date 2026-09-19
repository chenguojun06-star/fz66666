import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFormDraft } from '../../hooks/useFormDraft';

vi.mock('../../utils/formDraft', () => ({
  saveDraft: vi.fn(),
  loadDraft: vi.fn(),
  clearDraft: vi.fn(),
  hasDraft: vi.fn(),
  getDraftSavedTime: vi.fn(),
  getDraftTimeDescription: vi.fn(),
  DraftManager: {
    clearAll: vi.fn(),
    getAllDrafts: vi.fn(),
    clearExpired: vi.fn(),
  },
}));

import {
  saveDraft as mockSaveDraft,
  loadDraft as mockLoadDraft,
  clearDraft as mockClearDraft,
  hasDraft as mockHasDraft,
  getDraftSavedTime as mockGetDraftSavedTime,
  getDraftTimeDescription as mockGetDraftTimeDescription,
} from '../../utils/formDraft';

// 强制类型为 Mock 以支持 mockReturnValue
const typedMockSaveDraft = mockSaveDraft as ReturnType<typeof vi.fn>;
const typedMockLoadDraft = mockLoadDraft as ReturnType<typeof vi.fn>;
const typedMockClearDraft = mockClearDraft as ReturnType<typeof vi.fn>;
const typedMockHasDraft = mockHasDraft as ReturnType<typeof vi.fn>;
const typedMockGetDraftSavedTime = mockGetDraftSavedTime as ReturnType<typeof vi.fn>;
const typedMockGetDraftTimeDescription = mockGetDraftTimeDescription as ReturnType<typeof vi.fn>;

describe('useFormDraft Hook', () => {
  const FORM_KEY = 'test_form';
  const TEST_DATA = { name: 'test', value: 123 };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should return initial functions', () => {
    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    expect(typeof result.current.saveDraft).toBe('function');
    expect(typeof result.current.saveDraftDebounced).toBe('function');
    expect(typeof result.current.flushSaveDraft).toBe('function');
    expect(typeof result.current.loadDraft).toBe('function');
    expect(typeof result.current.clearDraft).toBe('function');
    expect(typeof result.current.hasDraft).toBe('function');
    expect(typeof result.current.getDraftInfo).toBe('function');
    expect(typeof result.current.getDraftSavedTime).toBe('function');
    expect(typeof result.current.getDraftTimeDescription).toBe('function');
    expect(typeof result.current.restoreDraft).toBe('function');
  });

  it('should call saveDraft with correct parameters', () => {
    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    act(() => {
      result.current.saveDraft(TEST_DATA);
    });

    expect(mockSaveDraft).toHaveBeenCalledWith(FORM_KEY, TEST_DATA, 7 * 24 * 60 * 60 * 1000);
  });

  it('should call saveDraft with custom expireMs', () => {
    const customExpire = 3600000;
    const { result } = renderHook(() => useFormDraft(FORM_KEY, { expireMs: customExpire }));

    act(() => {
      result.current.saveDraft(TEST_DATA);
    });

    expect(mockSaveDraft).toHaveBeenCalledWith(FORM_KEY, TEST_DATA, customExpire);
  });

  it('should debounce saveDraft', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFormDraft(FORM_KEY, { debounceMs: 300 }));

    act(() => {
      result.current.saveDraftDebounced(TEST_DATA);
    });

    expect(mockSaveDraft).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveDraft).toHaveBeenCalledWith(FORM_KEY, TEST_DATA, 7 * 24 * 60 * 60 * 1000);

    vi.useRealTimers();
  });

  it('should cancel previous debounce when new data arrives', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFormDraft(FORM_KEY, { debounceMs: 300 }));

    act(() => {
      result.current.saveDraftDebounced({ name: 'first' });
      result.current.saveDraftDebounced({ name: 'second' });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveDraft).toHaveBeenCalledWith(FORM_KEY, { name: 'second' }, 7 * 24 * 60 * 60 * 1000);

    vi.useRealTimers();
  });

  it('should flush pending save on demand', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFormDraft(FORM_KEY, { debounceMs: 300 }));

    act(() => {
      result.current.saveDraftDebounced(TEST_DATA);
    });

    expect(mockSaveDraft).not.toHaveBeenCalled();

    act(() => {
      result.current.flushSaveDraft();
    });

    expect(mockSaveDraft).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should call loadDraft with correct key', () => {
    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    act(() => {
      result.current.loadDraft();
    });

    expect(mockLoadDraft).toHaveBeenCalledWith(FORM_KEY);
  });

  it('should call clearDraft with correct key', () => {
    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    act(() => {
      result.current.clearDraft();
    });

    expect(mockClearDraft).toHaveBeenCalledWith(FORM_KEY);
  });

  it('should call hasDraft with correct key', () => {
    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    act(() => {
      result.current.hasDraft();
    });

    expect(mockHasDraft).toHaveBeenCalledWith(FORM_KEY);
  });

  it('should return draft info', () => {
    typedMockHasDraft.mockReturnValue(true);
    typedMockGetDraftSavedTime.mockReturnValue(new Date('2024-01-01'));
    typedMockGetDraftTimeDescription.mockReturnValue('1天前保存');
    typedMockLoadDraft.mockReturnValue(TEST_DATA);

    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    const info = result.current.getDraftInfo();

    expect(info.hasDraft).toBe(true);
    expect(info.savedTime).toEqual(new Date('2024-01-01'));
    expect(info.timeDescription).toBe('1天前保存');
    expect(info.data).toEqual(TEST_DATA);
  });

  it('should restore draft to form', () => {
    typedMockLoadDraft.mockReturnValue(TEST_DATA);
    // 完整的 mock FormInstance
    const mockForm = {
      setFieldsValue: vi.fn(),
      getFieldValue: vi.fn(),
      getFieldsValue: vi.fn(),
      resetFields: vi.fn(),
      validateFields: vi.fn(),
      scrollToField: vi.fn(),
      focusField: vi.fn(),
      getFieldInstance: vi.fn(),
    };

    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    const restored = result.current.restoreDraft(mockForm as any);

    expect(restored).toBe(true);
    expect(mockForm.setFieldsValue).toHaveBeenCalledWith(TEST_DATA);
  });

  it('should return false when no draft to restore', () => {
    typedMockLoadDraft.mockReturnValue(null);
    const mockForm = {
      setFieldsValue: vi.fn(),
      getFieldValue: vi.fn(),
      getFieldsValue: vi.fn(),
      resetFields: vi.fn(),
      validateFields: vi.fn(),
      scrollToField: vi.fn(),
      focusField: vi.fn(),
      getFieldInstance: vi.fn(),
    };

    const { result } = renderHook(() => useFormDraft(FORM_KEY));

    const restored = result.current.restoreDraft(mockForm as any);

    expect(restored).toBe(false);
    expect(mockForm.setFieldsValue).not.toHaveBeenCalled();
  });

  it('should flush draft on beforeunload', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useFormDraft(FORM_KEY));

    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('should not add beforeunload listener when autoSaveOnUnload is false', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useFormDraft(FORM_KEY, { autoSaveOnUnload: false }));

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});