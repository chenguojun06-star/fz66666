import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserPreference } from '@/hooks/useUserPreference';

/**
 * 通用列设置 Hook
 * 替代散落的 localStorage 实现，与后端 t_user_preference 对齐
 * 支持列显隐/列顺序持久化（按 pageKey 隔离）
 *
 * 使用方式：
 *   const { visibleColumns, setVisible, reset, columnOptions } = useColumnSettings({
 *     pageKey: 'style-list',
 *     allColumns: [{ key: 'styleNo', label: '款号' }, ...],
 *     defaultVisible: { styleNo: true, styleName: true, ... },
 *     bizType: 'style',
 *   });
 */

export type ColumnOption = { key: string; label: string };

type UseColumnSettingsOptions = {
  /** 页面唯一标识，用于持久化隔离 */
  pageKey: string;
  /** 全部列定义（key + label） */
  allColumns: ColumnOption[];
  /** 默认显隐配置 */
  defaultVisible: Record<string, boolean>;
  /** 业务对象类型（可选，用于后端偏好索引） */
  bizType?: string;
  /** 是否启用后端持久化（默认 true）；false 时退化为 localStorage */
  enableRemote?: boolean;
};

const LOCAL_STORAGE_PREFIX = 'column-settings:';

export function useColumnSettings({
  pageKey,
  allColumns,
  defaultVisible,
  bizType = 'common',
  enableRemote = true,
}: UseColumnSettingsOptions) {
  const { listByPage, save, remove } = useUserPreference();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(defaultVisible);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => allColumns.map(c => c.key));
  const [loaded, setLoaded] = useState(false);

  // 初始化：从后端拉取偏好（失败回退 localStorage）
  useEffect(() => {
    let cancelled = false;
    const localKey = `${LOCAL_STORAGE_PREFIX}${pageKey}`;

    const loadLocal = () => {
      try {
        const saved = localStorage.getItem(localKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            if (parsed.visible) setVisibleColumns({ ...defaultVisible, ...parsed.visible });
            if (Array.isArray(parsed.order)) setColumnOrder(parsed.order);
          }
        }
      } catch {
        // 忽略解析错误
      }
    };

    const loadRemote = async () => {
      if (!enableRemote) {
        loadLocal();
        setLoaded(true);
        return;
      }
      try {
        const list = await listByPage(pageKey);
        if (cancelled) return;
        const visItem = list.find(x => x.preferenceType === 'visible_columns');
        const orderItem = list.find(x => x.preferenceType === 'column_order');
        if (visItem) {
          try {
            const parsed = JSON.parse(visItem.preferenceValue);
            setVisibleColumns({ ...defaultVisible, ...parsed });
          } catch {
            // 忽略
          }
        }
        if (orderItem) {
          try {
            const parsed = JSON.parse(orderItem.preferenceValue);
            if (Array.isArray(parsed) && parsed.length > 0) setColumnOrder(parsed);
          } catch {
            // 忽略
          }
        }
        // 同步到 localStorage 作为兜底
        localStorage.setItem(localKey, JSON.stringify({
          visible: visItem ? JSON.parse(visItem.preferenceValue) : defaultVisible,
          order: orderItem ? JSON.parse(orderItem.preferenceValue) : allColumns.map(c => c.key),
        }));
      } catch {
        loadLocal();
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    loadRemote();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  const setVisible = useCallback((key: string, visible: boolean) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: visible };
      // 异步持久化
      if (enableRemote) {
        save({ bizType, pageKey, preferenceType: 'visible_columns', preferenceValue: next });
      }
      const localKey = `${LOCAL_STORAGE_PREFIX}${pageKey}`;
      try {
        const saved = localStorage.getItem(localKey);
        const parsed = saved ? JSON.parse(saved) : {};
        localStorage.setItem(localKey, JSON.stringify({ ...parsed, visible: next }));
      } catch {
        // 忽略
      }
      return next;
    });
  }, [bizType, pageKey, enableRemote, save]);

  const setOrder = useCallback((order: string[]) => {
    setColumnOrder(order);
    if (enableRemote) {
      save({ bizType, pageKey, preferenceType: 'column_order', preferenceValue: order });
    }
    const localKey = `${LOCAL_STORAGE_PREFIX}${pageKey}`;
    try {
      const saved = localStorage.getItem(localKey);
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem(localKey, JSON.stringify({ ...parsed, order }));
    } catch {
      // 忽略
    }
  }, [bizType, pageKey, enableRemote, save]);

  const reset = useCallback(() => {
    setVisibleColumns(defaultVisible);
    setColumnOrder(allColumns.map(c => c.key));
    if (enableRemote) {
      remove(pageKey, 'visible_columns');
      remove(pageKey, 'column_order');
    }
    const localKey = `${LOCAL_STORAGE_PREFIX}${pageKey}`;
    localStorage.removeItem(localKey);
  }, [defaultVisible, allColumns, pageKey, enableRemote, remove]);

  /** 按当前顺序排列且可见的列 */
  const orderedVisibleColumns = useMemo(() => {
    return columnOrder
      .map(key => allColumns.find(c => c.key === key))
      .filter((c): c is ColumnOption => Boolean(c) && visibleColumns[c!.key] !== false);
  }, [columnOrder, allColumns, visibleColumns]);

  return {
    visibleColumns,
    columnOrder,
    setVisible,
    setOrder,
    reset,
    columnOptions: allColumns,
    orderedVisibleColumns,
    loaded,
  };
}
