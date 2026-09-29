import { useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';

/**
 * 款式列表操作 Hook
 * 提供报废、打印等行操作（置顶由 usePinnedRows 提供，见 StyleInfoList/index.tsx）
 */
export const useStyleActions = (refreshCallback?: () => void) => {
  const { message, modal } = App.useApp();
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
   * 取消报废：恢复已报废款式为启用状态（误报废/想重做单子的恢复入口）
   */
  const handleUnscrap = (id: string) => {
    modal.confirm({
      title: '取消报废',
      content: '取消报废后该款式将恢复为启用状态，可继续编辑和下单。确定恢复吗？',
      okText: '取消报废',
      cancelText: '再想想',
      onOk: async () => {
        try {
          const res = await api.post(`/style/info/${id}/unscrap`);
          if (res.code === 200) {
            message.success('已恢复为启用状态');
            refreshCallback?.();
          } else {
            message.error(res.message || '取消报废失败');
          }
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '取消报废失败');
        }
      },
    });
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
    handleUnscrap,
    handlePrint
  };
};
