import { useCallback, useEffect, useRef } from 'react';

/**
 * 表单草稿自动保存Hook
 *
 * 将表单数据自动保存到 localStorage，防止刷新丢失
 *
 * 使用方式：
 *   const { saveDraft, loadDraft, clearDraft, hasDraft } = useFormDraft('order-create');
 *
 *   // 保存草稿
 *   saveDraft(formValues);
 *
 *   // 加载草稿
 *   const draft = loadDraft();
 *   if (draft) {
 *     form.setFieldsValue(draft);
 *   }
 *
 *   // 提交成功后清除草稿
 *   clearDraft();
 *
 *   // 检查是否有草稿
 *   if (hasDraft()) {
 *     Modal.confirm({ title: '发现未保存的草稿，是否恢复？' });
 *   }
 */

interface UseFormDraftOptions {
  /** 草稿过期时间（毫秒），默认7天 */
  expireMs?: number;
  /** 是否在页面离开时自动保存 */
  autoSaveOnUnload?: boolean;
}

export function useFormDraft(formKey: string, options: UseFormDraftOptions = {}) {
  const { expireMs = 7 * 24 * 60 * 60 * 1000, autoSaveOnUnload = true } = options;
  const storageKey = `form_draft_${formKey}`;
  const lastSaveTimeRef = useRef<number>(0);

  /**
   * 生成草稿key
   */
  const getDraftKey = useCallback(() => storageKey, [storageKey]);

  /**
   * 保存草稿到 localStorage
   */
  const saveDraft = useCallback((data: Record<string, unknown>) => {
    try {
      const draft = {
        data,
        savedAt: Date.now(),
        expiredAt: Date.now() + expireMs,
      };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      lastSaveTimeRef.current = Date.now();
      console.debug('[FormDraft] 草稿已保存:', formKey);
    } catch (e) {
      // localStorage 满了或其他错误，静默处理
      console.warn('[FormDraft] 保存草稿失败:', e);
    }
  }, [formKey, getDraftKey, expireMs]);

  /**
   * 从 localStorage 加载草稿
   */
  const loadDraft = useCallback((): Record<string, unknown> | null => {
    try {
      const raw = localStorage.getItem(getDraftKey());
      if (!raw) return null;

      const draft = JSON.parse(raw) as {
        data: Record<string, unknown>;
        savedAt: number;
        expiredAt: number;
      };

      // 检查是否过期
      if (draft.expiredAt < Date.now()) {
        console.debug('[FormDraft] 草稿已过期:', formKey);
        localStorage.removeItem(getDraftKey());
        return null;
      }

      console.debug('[FormDraft] 找到草稿:', formKey, draft.savedAt);
      return draft.data;
    } catch (e) {
      console.warn('[FormDraft] 加载草稿失败:', e);
      return null;
    }
  }, [formKey, getDraftKey]);

  /**
   * 清除草稿
   */
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(getDraftKey());
      lastSaveTimeRef.current = 0;
      console.debug('[FormDraft] 草稿已清除:', formKey);
    } catch (e) {
      console.warn('[FormDraft] 清除草稿失败:', e);
    }
  }, [formKey, getDraftKey]);

  /**
   * 检查是否有未过期的草稿
   */
  const hasDraft = useCallback((): boolean => {
    const draft = loadDraft();
    return draft !== null;
  }, [loadDraft]);

  /**
   * 获取草稿保存时间
   */
  const getDraftSavedTime = useCallback((): Date | null => {
    try {
      const raw = localStorage.getItem(getDraftKey());
      if (!raw) return null;

      const draft = JSON.parse(raw) as { savedAt: number };
      return new Date(draft.savedAt);
    } catch {
      return null;
    }
  }, [getDraftKey]);

  /**
   * 获取距草稿保存的相对时间描述
   */
  const getDraftTimeDescription = useCallback((): string => {
    const savedAt = getDraftSavedTime();
    if (!savedAt) return '';

    const diff = Date.now() - savedAt.getTime();
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (minutes < 1) return '刚刚保存';
    if (minutes < 60) return `${minutes}分钟前保存`;
    if (hours < 24) return `${hours}小时前保存`;
    return `${days}天前保存`;
  }, [getDraftSavedTime]);

  /**
   * 页面离开时自动保存
   */
  useEffect(() => {
    if (!autoSaveOnUnload) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 只在有修改时提示
      if (lastSaveTimeRef.current > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoSaveOnUnload]);

  /**
   * 获取草稿数据（用于显示给用户）
   */
  const getDraftInfo = useCallback((): {
    hasDraft: boolean;
    savedTime: Date | null;
    timeDescription: string;
    data: Record<string, unknown> | null;
  } => {
    return {
      hasDraft: hasDraft(),
      savedTime: getDraftSavedTime(),
      timeDescription: getDraftTimeDescription(),
      data: loadDraft(),
    };
  }, [hasDraft, getDraftSavedTime, getDraftTimeDescription, loadDraft]);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
    getDraftInfo,
    getDraftSavedTime,
    getDraftTimeDescription,
  };
}

/**
 * 批量操作草稿管理
 *
 * 用于多个表单共享草稿的场景
 */
export const DraftManager = {
  /**
   * 清除所有草稿
   */
  clearAll(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('form_draft_'));
    keys.forEach(k => localStorage.removeItem(k));
    console.debug('[DraftManager] 已清除所有草稿:', keys.length);
  },

  /**
   * 获取所有草稿信息
   */
  getAllDrafts(): Array<{ key: string; savedAt: Date; expiredAt: Date }> {
    const drafts: Array<{ key: string; savedAt: Date; expiredAt: Date }> = [];
    const keys = Object.keys(localStorage).filter(k => k.startsWith('form_draft_'));

    keys.forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const draft = JSON.parse(raw);
          drafts.push({
            key: k.replace('form_draft_', ''),
            savedAt: new Date(draft.savedAt),
            expiredAt: new Date(draft.expiredAt),
          });
        }
      } catch {
        // 忽略解析错误
      }
    });

    return drafts.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  },

  /**
   * 清除过期草稿
   */
  clearExpired(): number {
    const drafts = this.getAllDrafts();
    const now = Date.now();
    let cleared = 0;

    drafts.forEach(d => {
      if (d.expiredAt.getTime() < now) {
        localStorage.removeItem(`form_draft_${d.key}`);
        cleared++;
      }
    });

    if (cleared > 0) {
      console.debug('[DraftManager] 已清除过期草稿:', cleared);
    }
    return cleared;
  },
};
