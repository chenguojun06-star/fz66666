import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  hasDraft,
  getDraftSavedTime,
  getDraftTimeDescription,
  DraftManager,
} from '../../utils/formDraft';

describe('Form Draft Utility', () => {
  const FORM_KEY = 'test_form';
  const TEST_DATA = { name: 'test', value: 123 };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveDraft', () => {
    it('should save draft to localStorage', () => {
      saveDraft(FORM_KEY, TEST_DATA, 86400000);
      
      const stored = localStorage.getItem('form_draft_test_form');
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.data).toEqual(TEST_DATA);
      expect(typeof parsed.savedAt).toBe('number');
      expect(typeof parsed.expiredAt).toBe('number');
    });

    it('should handle localStorage quota exceeded', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
      mockSetItem.mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      expect(() => saveDraft(FORM_KEY, TEST_DATA, 86400000)).not.toThrow();
      mockSetItem.mockRestore();
    });

    it('should include expiration time', () => {
      const expireMs = 3600000;
      saveDraft(FORM_KEY, TEST_DATA, expireMs);
      
      const stored = localStorage.getItem('form_draft_test_form');
      const parsed = JSON.parse(stored!);
      
      expect(parsed.expiredAt).toBeGreaterThan(parsed.savedAt);
      expect(parsed.expiredAt - parsed.savedAt).toBe(expireMs);
    });
  });

  describe('loadDraft', () => {
    it('should load existing draft', () => {
      saveDraft(FORM_KEY, TEST_DATA, 86400000);
      
      const loaded = loadDraft(FORM_KEY);
      expect(loaded).toEqual(TEST_DATA);
    });

    it('should return null for non-existent draft', () => {
      const loaded = loadDraft('non_existent');
      expect(loaded).toBeNull();
    });

    it('should return null and remove expired draft', () => {
      const draft = {
        data: TEST_DATA,
        savedAt: Date.now(),
        expiredAt: Date.now() - 1000,
      };
      localStorage.setItem('form_draft_test_form', JSON.stringify(draft));
      
      const loaded = loadDraft(FORM_KEY);
      expect(loaded).toBeNull();
      
      const remaining = localStorage.getItem('form_draft_test_form');
      expect(remaining).toBeNull();
    });

    it('should handle invalid JSON', () => {
      localStorage.setItem('form_draft_test_form', 'invalid json');
      
      const loaded = loadDraft(FORM_KEY);
      expect(loaded).toBeNull();
    });
  });

  describe('clearDraft', () => {
    it('should remove existing draft', () => {
      saveDraft(FORM_KEY, TEST_DATA, 86400000);
      
      clearDraft(FORM_KEY);
      
      const remaining = localStorage.getItem('form_draft_test_form');
      expect(remaining).toBeNull();
    });

    it('should handle non-existent draft gracefully', () => {
      expect(() => clearDraft('non_existent')).not.toThrow();
    });
  });

  describe('hasDraft', () => {
    it('should return true when draft exists', () => {
      saveDraft(FORM_KEY, TEST_DATA, 86400000);
      
      expect(hasDraft(FORM_KEY)).toBe(true);
    });

    it('should return false when draft does not exist', () => {
      expect(hasDraft('non_existent')).toBe(false);
    });

    it('should return false when draft is expired', () => {
      const draft = {
        data: TEST_DATA,
        savedAt: Date.now(),
        expiredAt: Date.now() - 1000,
      };
      localStorage.setItem('form_draft_test_form', JSON.stringify(draft));
      
      expect(hasDraft(FORM_KEY)).toBe(false);
    });
  });

  describe('getDraftSavedTime', () => {
    it('should return saved time', () => {
      saveDraft(FORM_KEY, TEST_DATA, 86400000);
      
      const savedTime = getDraftSavedTime(FORM_KEY);
      expect(savedTime).toBeInstanceOf(Date);
    });

    it('should return null for non-existent draft', () => {
      expect(getDraftSavedTime('non_existent')).toBeNull();
    });
  });

  describe('getDraftTimeDescription', () => {
    it('should return "刚刚保存" for very recent drafts', () => {
      saveDraft(FORM_KEY, TEST_DATA, 86400000);
      
      const desc = getDraftTimeDescription(FORM_KEY);
      expect(desc).toBe('刚刚保存');
    });

    it('should return null for non-existent draft', () => {
      expect(getDraftTimeDescription('non_existent')).toBe('');
    });

    it('should return minutes description', () => {
      const draft = {
        data: TEST_DATA,
        savedAt: Date.now() - 300000,
        expiredAt: Date.now() + 86400000,
      };
      localStorage.setItem('form_draft_test_form', JSON.stringify(draft));
      
      const desc = getDraftTimeDescription(FORM_KEY);
      expect(desc).toMatch(/^\d+分钟前保存$/);
    });

    it('should return hours description', () => {
      const draft = {
        data: TEST_DATA,
        savedAt: Date.now() - 3600000,
        expiredAt: Date.now() + 86400000,
      };
      localStorage.setItem('form_draft_test_form', JSON.stringify(draft));
      
      const desc = getDraftTimeDescription(FORM_KEY);
      expect(desc).toMatch(/^\d+小时前保存$/);
    });

    it('should return days description', () => {
      const draft = {
        data: TEST_DATA,
        savedAt: Date.now() - 86400000,
        expiredAt: Date.now() + 86400000,
      };
      localStorage.setItem('form_draft_test_form', JSON.stringify(draft));
      
      const desc = getDraftTimeDescription(FORM_KEY);
      expect(desc).toMatch(/^\d+天前保存$/);
    });
  });

  describe('DraftManager', () => {
    it('should clear all drafts', () => {
      saveDraft('form1', { key: 'value1' }, 86400000);
      saveDraft('form2', { key: 'value2' }, 86400000);
      
      expect(localStorage.getItem('form_draft_form1')).not.toBeNull();
      expect(localStorage.getItem('form_draft_form2')).not.toBeNull();
      
      DraftManager.clearAll();
      
      expect(localStorage.getItem('form_draft_form1')).toBeNull();
      expect(localStorage.getItem('form_draft_form2')).toBeNull();
    });

    it('should get all drafts', () => {
      saveDraft('form1', { key: 'value1' }, 86400000);
      
      const drafts = DraftManager.getAllDrafts();
      expect(drafts.length).toBe(1);
      expect(drafts[0].key).toBe('form1');
      expect(drafts[0].savedAt).toBeInstanceOf(Date);
      expect(drafts[0].expiredAt).toBeInstanceOf(Date);
    });

    it('should clear expired drafts', () => {
      const expiredDraft = {
        data: TEST_DATA,
        savedAt: Date.now(),
        expiredAt: Date.now() - 1000,
      };
      localStorage.setItem('form_draft_expired', JSON.stringify(expiredDraft));
      
      saveDraft('active', TEST_DATA, 86400000);
      
      const cleared = DraftManager.clearExpired();
      expect(cleared).toBe(1);
      
      expect(localStorage.getItem('form_draft_expired')).toBeNull();
      expect(localStorage.getItem('form_draft_active')).not.toBeNull();
    });

    it('should handle invalid drafts in getAllDrafts', () => {
      localStorage.setItem('form_draft_corrupt', 'invalid json');
      saveDraft('valid', TEST_DATA, 86400000);
      
      const drafts = DraftManager.getAllDrafts();
      expect(drafts.length).toBe(1);
      expect(drafts[0].key).toBe('valid');
    });
  });
});