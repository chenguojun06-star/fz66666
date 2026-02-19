/**
 * useProgressActions - 进度操作Hook
 * 功能：扫码提交、进度回退、快速编辑
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import { ProductionOrder } from '@/types/production';
import { productionScanApi, productionOrderApi } from '@/services/production/productionApi';

export const useProgressActions = (refreshCallback?: () => void) => {
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // 扫码提交
  const submitScan = useCallback(async (payload: any) => {
    setScanSubmitting(true);
    try {
      const res = await productionScanApi.create(payload);
      const result = res as any;
      if (result.code === 200) {
        message.success('扫码成功');
        refreshCallback?.();
        return true;
      } else {
        message.error(result.message || '扫码失败');
        return false;
      }
    } catch (error: any) {
      message.error(error.message || '扫码失败');
      return false;
    } finally {
      setScanSubmitting(false);
    }
  }, [refreshCallback]);

  // 进度回退
  const submitRollback = useCallback(async (orderId: string, payload: any) => {
    setRollbackSubmitting(true);
    try {
      const res = await productionScanApi.rollback(orderId, payload);
      const result = res as any;
      if (result.code === 200) {
        message.success('进度回退成功');
        refreshCallback?.();
        return true;
      } else {
        message.error(result.message || '进度回退失败');
        return false;
      }
    } catch (error: any) {
      message.error(error.message || '进度回退失败');
      return false;
    } finally {
      setRollbackSubmitting(false);
    }
  }, [refreshCallback]);

  // 快速编辑
  const quickEdit = useCallback(async (record: ProductionOrder, updates: any) => {
    setQuickEditSaving(true);
    try {
      const res = await productionOrderApi.quickEdit({
        id: record.id,
        ...updates,
      });
      const result = res as any;
      if (result.code === 200) {
        message.success('保存成功');
        refreshCallback?.();
        return true;
      } else {
        message.error(result.message || '保存失败');
        return false;
      }
    } catch (error: any) {
      message.error(error.message || '保存失败');
      return false;
    } finally {
      setQuickEditSaving(false);
    }
  }, [refreshCallback]);

  return {
    scanSubmitting,
    rollbackSubmitting,
    quickEditSaving,
    submitScan,
    submitRollback,
    quickEdit,
  };
};
