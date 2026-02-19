import { useCallback, useRef } from 'react';
import { message } from 'antd';
import api from '@/utils/api';

interface AutoCollectOptions {
  dictType: string;
  enabled?: boolean;
  silent?: boolean; // 是否静默收录（不显示提示）
  debounceMs?: number; // 防抖时间，默认500ms
}

/**
 * 自动收录词典 Hook
 * 用于在输入框中自动收录新词汇到词典系统
 */
export const useAutoCollectDict = (options: AutoCollectOptions) => {
  const {
    dictType,
    enabled = true,
    silent = true,
    debounceMs = 500
  } = options;

  // 缓存已存在的词汇，避免重复检查
  const existingWordsCache = useRef<Set<string>>(new Set());
  const pendingTimers = useRef<Map<string, number>>(new Map());

  /**
   * 检查词汇是否已存在
   */
  const checkWordExists = async (word: string): Promise<boolean> => {
    if (!word || word.trim() === '') return true;

    const trimmedWord = word.trim();

    // 先检查缓存
    if (existingWordsCache.current.has(trimmedWord)) {
      return true;
    }

    try {
      // 调用后端 API 检查
      const response = await api.get('/system/dict/list', {
        params: {
          dictType,
          dictLabel: trimmedWord,
          pageSize: 1
        }
      });

      const exists = response.data?.records?.some(
        (item: any) => item.dictLabel === trimmedWord
      );

      if (exists) {
        existingWordsCache.current.add(trimmedWord);
      }

      return exists;
    } catch (error) {
      // API 失败时返回 true，避免重复添加
      return true;
    }
  };

  /**
   * 自动收录新词汇
   */
  const collectWord = async (word: string) => {
    if (!enabled || !word || word.trim() === '') return;

    const trimmedWord = word.trim();

    try {
      // 检查是否已存在
      const exists = await checkWordExists(trimmedWord);
      if (exists) return;

      // 生成词汇编码（大写字母+下划线）
      const dictCode = generateDictCode(trimmedWord, dictType);

      // 获取当前词典的最大排序号
      const maxSortOrder = await getMaxSortOrder(dictType);

      // 调用后端 API 添加新词汇
      await api.post('/system/dict', {
        dictType,
        dictCode,
        dictLabel: trimmedWord,
        sortOrder: maxSortOrder + 1,
        remark: '自动收录'
      });

      // 添加到缓存
      existingWordsCache.current.add(trimmedWord);

      if (!silent) {
        message.success(`已自动收录新词汇: ${trimmedWord}`);
      }
    } catch (error) {
      // 静默失败，不影响用户操作
    }
  };

  /**
   * 带防抖的收录函数
   */
  const collectWordDebounced = useCallback((word: string) => {
    if (!enabled || !word || word.trim() === '') return;

    const trimmedWord = word.trim();

    // 清除之前的定时器
    const existingTimer = pendingTimers.current.get(trimmedWord);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      collectWord(trimmedWord);
      pendingTimers.current.delete(trimmedWord);
    }, debounceMs) as unknown as number;

    pendingTimers.current.set(trimmedWord, timer);
  }, [enabled, dictType, debounceMs]);

  /**
   * 清除所有待处理的定时器
   */
  const clearPendingTimers = useCallback(() => {
    pendingTimers.current.forEach(timer => clearTimeout(timer));
    pendingTimers.current.clear();
  }, []);

  return {
    collectWord: collectWordDebounced,
    clearPendingTimers,
    existingWordsCache: existingWordsCache.current
  };
};

/**
 * 生成词典编码
 */
function generateDictCode(label: string, dictType: string): string {
  // 将中文转换为拼音首字母或使用编号
  const timestamp = Date.now().toString().slice(-6);
  const prefix = dictType.toUpperCase().slice(0, 3);

  // 尝试转换为拼音首字母（简单实现）
  let code = '';
  for (let i = 0; i < Math.min(label.length, 4); i++) {
    const charCode = label.charCodeAt(i);
    if (charCode >= 0x4e00 && charCode <= 0x9fa5) {
      // 中文字符，使用简单的映射
      code += 'ZH';
    } else {
      code += label[i].toUpperCase();
    }
  }

  return `${prefix}_${code}_${timestamp}`;
}

/**
 * 获取指定词典类型的最大排序号
 */
async function getMaxSortOrder(dictType: string): Promise<number> {
  try {
    const response = await api.get('/system/dict/list', {
      params: {
        dictType,
        pageSize: 1,
        sortField: 'sort_order',
        sortOrder: 'desc'
      }
    });

    const maxRecord = response.data?.records?.[0];
    return maxRecord?.sortOrder || 0;
  } catch (error) {
    return 0;
  }
}
