import { useState, useCallback } from 'react';
import { message, modal } from '@/utils/antdStatic';

/**
 * 批量操作Hook - 统一封装
 *
 * 提供批量选择、批量操作、进度反馈
 *
 * 使用方式：
 *   const {
 *     selectedIds,
 *     selectedRows,
 *     isSelected,
 *     toggleSelect,
 *     selectAll,
 *     clearSelection,
 *     selectRange,
 *     batchOperation,
 *   } = useBatchOperation<T>({
 *     getRowKey: (row) => row.id,
 *     onBatchSuccess: (ids) => { message.success(`成功操作${ids.length}条`); },
 *   });
 */

interface UseBatchOperationOptions<T> {
  /** 获取行的唯一key */
  getRowKey: (row: T) => string | number;
  /** 批量操作成功回调 */
  onBatchSuccess?: (ids: (string | number)[], successCount: number) => void;
  /** 批量操作失败回调 */
  onBatchError?: (ids: (string | number)[], failedCount: number) => void;
  /** 最大批量操作数量，0表示不限制 */
  maxBatchSize?: number;
}

interface BatchOperationResult {
  /** 批量操作的结果 */
  results: Array<{ id: string | number; success: boolean; error?: string }>;
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 是否全部成功 */
  allSuccess: boolean;
  /** 总数量 */
  total: number;
}

export function useBatchOperation<T>(options: UseBatchOperationOptions<T>) {
  const {
    getRowKey,
    onBatchSuccess,
    onBatchError,
    maxBatchSize = 0,
  } = options;

  // 选中的ID集合
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  // 选中的行数据
  const [selectedRows, setSelectedRows] = useState<T[]>([]);

  // 批量操作中
  const [batchLoading, setBatchLoading] = useState(false);

  /**
   * 检查某行是否被选中
   */
  const isSelected = useCallback(
    (row: T): boolean => {
      const key = getRowKey(row);
      return selectedIds.has(key);
    },
    [selectedIds, getRowKey]
  );

  /**
   * 切换选中状态
   */
  const toggleSelect = useCallback(
    (row: T) => {
      const key = getRowKey(row);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          // 检查最大数量限制
          if (maxBatchSize > 0 && next.size >= maxBatchSize) {
            message.warning(`最多只能选择${maxBatchSize}条`);
            return prev;
          }
          next.add(key);
        }
        return next;
      });

      // 同步更新 selectedRows
      setSelectedRows((prev) => {
        const key = getRowKey(row);
        if (selectedIds.has(key)) {
          return prev.filter((r) => getRowKey(r) !== key);
        } else {
          if (maxBatchSize > 0 && prev.length >= maxBatchSize) {
            return prev;
          }
          return [...prev, row];
        }
      });
    },
    [selectedIds, getRowKey, maxBatchSize]
  );

  /**
   * 全选
   */
  const selectAll = useCallback(
    (rows: T[]) => {
      if (maxBatchSize > 0 && rows.length > maxBatchSize) {
        message.warning(`最多只能选择${maxBatchSize}条`);
        setSelectedIds(new Set(rows.slice(0, maxBatchSize).map(getRowKey)));
        setSelectedRows(rows.slice(0, maxBatchSize));
      } else {
        setSelectedIds(new Set(rows.map(getRowKey)));
        setSelectedRows([...rows]);
      }
    },
    [getRowKey, maxBatchSize]
  );

  /**
   * 清除选择
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedRows([]);
  }, []);

  /**
   * 范围选择（Shift键）
   */
  const selectRange = useCallback(
    (rows: T[], startIndex: number, endIndex: number) => {
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);
      const rangeRows = rows.slice(start, end + 1);

      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeRows.forEach((row) => {
          const key = getRowKey(row);
          if (maxBatchSize === 0 || next.size < maxBatchSize) {
            next.add(key);
          }
        });
        return next;
      });

      setSelectedRows((prev) => {
        const newRows = [...prev];
        rangeRows.forEach((row) => {
          const key = getRowKey(row);
          if (!newRows.some((r) => getRowKey(r) === key)) {
            if (maxBatchSize === 0 || newRows.length < maxBatchSize) {
              newRows.push(row);
            }
          }
        });
        return newRows;
      });
    },
    [getRowKey, maxBatchSize]
  );

  /**
   * 执行批量操作
   *
   * @param operation 单条操作函数
   * @param options 选项
   */
  const batchOperation = useCallback(
    async (
      operation: (row: T) => Promise<void>,
      options: {
        /** 确认对话框标题 */
        confirmTitle?: string;
        /** 确认对话框内容 */
        confirmContent?: string;
        /** 成功后是否清除选择 */
        clearOnSuccess?: boolean;
        /** 成功后提示消息 */
        successMessage?: string;
        /** 失败后提示消息 */
        errorMessage?: string;
        /** 是否显示进度 */
        showProgress?: boolean;
      } = {}
    ): Promise<BatchOperationResult> => {
      const {
        confirmTitle = '确认批量操作',
        confirmContent,
        clearOnSuccess = true,
        successMessage,
        errorMessage,
        showProgress = true,
      } = options;

      const ids = Array.from(selectedIds);
      const rows = selectedRows;

      if (ids.length === 0) {
        message.warning('请先选择要操作的数据');
        return { results: [], successCount: 0, failedCount: 0, allSuccess: true, total: 0 };
      }

      // 显示确认对话框
      const confirmed = await new Promise<boolean>((resolve) => {
        if (confirmContent) {
          modal.confirm({
            title: confirmTitle,
            content: confirmContent.replace('{count}', String(ids.length)),
            okText: '确认',
            cancelText: '取消',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        } else {
          resolve(true);
        }
      });

      if (!confirmed) {
        return { results: [], successCount: 0, failedCount: 0, allSuccess: true, total: 0 };
      }

      setBatchLoading(true);
      const results: Array<{ id: string | number; success: boolean; error?: string }> = [];
      let successCount = 0;
      let failedCount = 0;

      try {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const id = getRowKey(row);

          try {
            await operation(row);
            results.push({ id, success: true });
            successCount++;

            if (showProgress) {
              message.loading({ content: `正在处理 ${i + 1}/${rows.length}`, key: 'batch_progress', duration: 0 });
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '操作失败';
            results.push({ id, success: false, error: errorMsg });
            failedCount++;
          }
        }

        // 清除进度消息
        if (showProgress) {
          message.destroy('batch_progress');
        }

        // 显示结果
        if (successCount > 0 && failedCount === 0) {
          const msg = successMessage || `成功操作 ${successCount} 条数据`;
          message.success(msg);
          if (clearOnSuccess) {
            clearSelection();
          }
        } else if (failedCount > 0 && successCount === 0) {
          const msg = errorMessage || `操作失败，请重试`;
          message.error(msg);
        } else {
          message.warning(`部分成功：${successCount} 成功，${failedCount} 失败`);
        }

        // 回调
        if (successCount > 0 && onBatchSuccess) {
          onBatchSuccess(ids, successCount);
        }
        if (failedCount > 0 && onBatchError) {
          onBatchError(ids, failedCount);
        }

        return {
          results,
          successCount,
          failedCount,
          allSuccess: failedCount === 0,
          total: ids.length,
        };
      } finally {
        setBatchLoading(false);
      }
    },
    [selectedIds, selectedRows, getRowKey, onBatchSuccess, onBatchError, clearSelection]
  );

  return {
    // 状态
    selectedIds,
    selectedRows,
    selectedCount: selectedIds.size,
    isAllSelected: selectedIds.size > 0 && selectedRows.length > 0,
    batchLoading,

    // 方法
    isSelected,
    toggleSelect,
    selectAll,
    clearSelection,
    selectRange,
    batchOperation,
  };
}

/**
 * 批量操作配置预设
 */
export const BATCH_OPERATION_PRESETS = {
  /** 批量删除 */
  delete: {
    confirmTitle: '确认删除',
    confirmContent: '确定要删除选中的 {count} 条数据吗？此操作不可撤销！',
    successMessage: '删除成功',
    errorMessage: '删除失败，请重试',
  },

  /** 批量审核 */
  approve: {
    confirmTitle: '确认审核',
    confirmContent: '确定要审核选中的 {count} 条数据吗？',
    successMessage: '审核成功',
    errorMessage: '审核失败，请重试',
  },

  /** 批量导出 */
  export: {
    confirmTitle: '确认导出',
    confirmContent: '确定要导出选中的 {count} 条数据吗？',
    successMessage: '导出任务已创建',
    errorMessage: '导出失败，请重试',
  },

  /** 批量更新状态 */
  updateStatus: {
    confirmTitle: '确认更新状态',
    confirmContent: '确定要更新选中的 {count} 条数据状态吗？',
    successMessage: '状态更新成功',
    errorMessage: '状态更新失败，请重试',
  },
};
