const STORAGE_PREFIX = 'form_draft_';

interface DraftData {
  data: Record<string, unknown>;
  savedAt: number;
  expiredAt: number;
}

function getStorageKey(formKey: string): string {
  return `${STORAGE_PREFIX}${formKey}`;
}

export function saveDraft(formKey: string, data: Record<string, unknown>, expireMs: number): void {
  try {
    const draft: DraftData = {
      data,
      savedAt: Date.now(),
      expiredAt: Date.now() + expireMs,
    };
    localStorage.setItem(getStorageKey(formKey), JSON.stringify(draft));
  } catch (e) {
    console.warn('[FormDraft] 保存草稿失败:', e);
  }
}

export function loadDraft(formKey: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(getStorageKey(formKey));
    if (!raw) return null;

    const draft = JSON.parse(raw) as DraftData;
    if (draft.expiredAt < Date.now()) {
      localStorage.removeItem(getStorageKey(formKey));
      return null;
    }
    return draft.data;
  } catch (e) {
    console.warn('[FormDraft] 加载草稿失败:', e);
    return null;
  }
}

export function clearDraft(formKey: string): void {
  try {
    localStorage.removeItem(getStorageKey(formKey));
  } catch (e) {
    console.warn('[FormDraft] 清除草稿失败:', e);
  }
}

export function hasDraft(formKey: string): boolean {
  return loadDraft(formKey) !== null;
}

export function getDraftSavedTime(formKey: string): Date | null {
  try {
    const raw = localStorage.getItem(getStorageKey(formKey));
    if (!raw) return null;
    const draft = JSON.parse(raw) as { savedAt: number };
    return new Date(draft.savedAt);
  } catch {
    return null;
  }
}

export function getDraftTimeDescription(formKey: string): string {
  const savedAt = getDraftSavedTime(formKey);
  if (!savedAt) return '';

  const diff = Date.now() - savedAt.getTime();
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (minutes < 1) return '刚刚保存';
  if (minutes < 60) return `${minutes}分钟前保存`;
  if (hours < 24) return `${hours}小时前保存`;
  return `${days}天前保存`;
}

export const DraftManager = {
  clearAll(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  },

  getAllDrafts(): Array<{ key: string; savedAt: Date; expiredAt: Date }> {
    const drafts: Array<{ key: string; savedAt: Date; expiredAt: Date }> = [];
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));

    keys.forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const draft = JSON.parse(raw) as DraftData;
          drafts.push({
            key: k.replace(STORAGE_PREFIX, ''),
            savedAt: new Date(draft.savedAt),
            expiredAt: new Date(draft.expiredAt),
          });
        }
      } catch {
        // skip invalid drafts
      }
    });

    return drafts.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  },

  clearExpired(): number {
    const drafts = this.getAllDrafts();
    const now = Date.now();
    let cleared = 0;

    drafts.forEach(d => {
      if (d.expiredAt.getTime() < now) {
        localStorage.removeItem(getStorageKey(d.key));
        cleared++;
      }
    });

    return cleared;
  },
};
