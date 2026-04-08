import { useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';

/**
 * 款式列表操作 Hook
 * 提供报废、置顶、打印等行操作
 */
export const useStyleActions = (refreshCallback?: () => void) => {
  const { message } = App.useApp();
  const [pendingScrapId, setPendingScrapId] = useState<string | null>(null);
  const [scrapLoading, setScrapLoading] = useState(false);

  /**
   * 报废款式 - 打开确认弹窗
   */
  const handleScrap = (id: string) => {
    setPendingScrapId(id);
  };

  const confirmScrap = async (reason: string) => {
    if (!pendingScrapId) return;
    setScrapLoading(true);
    try {
      const res = await api.post(`/style/info/${pendingScrapId}/scrap`, { reason });
      if (res.code === 200) {
        message.success('报废成功');
        setPendingScrapId(null);
        refreshCallback?.();
      } else {
        message.error(res.message || '报废失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '报废失败');
    } finally {
      setScrapLoading(false);
    }
  };

  const cancelScrap = () => {
    setPendingScrapId(null);
  };

  /**
   * 切换置顶状态
   */
  const handleToggleTop = async (record: StyleInfo) => {
    try {
      const newTopStatus = record.isTop === 1 ? 0 : 1;
      const res = await api.put('/style/info', {
        ...record,
        isTop: newTopStatus
      });

      if (res.code === 200) {
        message.success(newTopStatus === 1 ? '置顶成功' : '取消置顶成功');
        refreshCallback?.();
        return true;
      } else {
        message.error(res.message || '操作失败');
        return false;
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败');
      return false;
    }
  };

  /**
   * 打印款式信息
   * 返回款式记录，由外部控制打印弹窗
   */
  const handlePrint = (record: StyleInfo) => {
    return record;
  };

  return {
    handleScrap,
    confirmScrap,
    cancelScrap,
    pendingScrapId,
    scrapLoading,
    handleToggleTop,
    handlePrint
  };
};
