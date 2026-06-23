import { useCallback, useEffect, useRef } from 'react';
import type { FormInstance } from 'antd';
import {
  saveDraft as saveDraftUtil,
  loadDraft as loadDraftUtil,
  clearDraft as clearDraftUtil,
  hasDraft as hasDraftUtil,
  getDraftSavedTime as getDraftSavedTimeUtil,
  getDraftTimeDescription as getDraftTimeDescriptionUtil,
  DraftManager,
} from '@/utils/formDraft';

interface UseFormDraftOptions {
  expireMs?: number;
  autoSaveOnUnload?: boolean;
  debounceMs?: number;
}

export function useFormDraft(formKey: string, options: UseFormDraftOptions = {}) {
  const { expireMs = 7 * 24 * 60 * 60 * 1000, autoSaveOnUnload = true, debounceMs = 300 } = options;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<Record<string, unknown> | null>(null);

  const saveDraft = useCallback(
    (data: Record<string, unknown>) => saveDraftUtil(formKey, data, expireMs),
    [formKey, expireMs],
  );

  const saveDraftDebounced = useCallback(
    (data: Record<string, unknown>) => {
      pendingDataRef.current = data;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (pendingDataRef.current) saveDraft(pendingDataRef.current);
        debounceTimerRef.current = null;
      }, debounceMs);
    },
    [saveDraft, debounceMs],
  );

  const flushSaveDraft = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingDataRef.current) {
      saveDraft(pendingDataRef.current);
      pendingDataRef.current = null;
    }
  }, [saveDraft]);

  const loadDraft = useCallback(() => loadDraftUtil(formKey), [formKey]);
  const clearDraft = useCallback(() => clearDraftUtil(formKey), [formKey]);
  const hasDraft = useCallback(() => hasDraftUtil(formKey), [formKey]);
  const getDraftSavedTime = useCallback(() => getDraftSavedTimeUtil(formKey), [formKey]);
  const getDraftTimeDescription = useCallback(() => getDraftTimeDescriptionUtil(formKey), [formKey]);

  const getDraftInfo = useCallback(() => ({
    hasDraft: hasDraft(),
    savedTime: getDraftSavedTime(),
    timeDescription: getDraftTimeDescription(),
    data: loadDraft(),
  }), [hasDraft, getDraftSavedTime, getDraftTimeDescription, loadDraft]);

  const restoreDraft = useCallback((form: FormInstance) => {
    const draft = loadDraft();
    if (draft) {
      form.setFieldsValue(draft);
      return true;
    }
    return false;
  }, [loadDraft]);

  useEffect(() => {
    if (!autoSaveOnUnload) return;
    const handleBeforeUnload = () => flushSaveDraft();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      flushSaveDraft();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoSaveOnUnload, flushSaveDraft]);

  return {
    saveDraft,
    saveDraftDebounced,
    flushSaveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
    getDraftInfo,
    getDraftSavedTime,
    getDraftTimeDescription,
    restoreDraft,
  };
}

export { DraftManager };
