import { App } from 'antd';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';

/**
 * 款式列表操作 Hook
 * 提供删除、置顶、打印等行操作
 */
export const useStyleActions = (refreshCallback?: () => void) => {
  const { message, modal } = App.useApp();

  /**
   * 删除款式
   */
  const handleDelete = async (id: string) => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: '确认删除',
        content: '删除后无法恢复，确定要删除这个款式吗？',
        okText: '确定',
        cancelText: '取消',
        onOk: async () => {
          try {
            const res = await api.delete(`/style/info/${id}`);
            if (res.code === 200) {
              message.success('删除成功');
              refreshCallback?.();
              resolve(true);
            } else {
              message.error(res.message || '删除失败');
              reject(new Error(res.message || '删除失败'));
            }
          } catch (error: any) {
            message.error(error?.message || '删除失败');
            reject(error);
          }
        },
        onCancel: () => {
          resolve(false);
        }
      });
    });
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
    } catch (error: any) {
      message.error(error?.message || '操作失败');
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
    handleDelete,
    handleToggleTop,
    handlePrint
  };
};
