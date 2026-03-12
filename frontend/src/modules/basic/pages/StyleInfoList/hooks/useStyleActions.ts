import React from 'react';
import { App, Input } from 'antd';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';

/**
 * 款式列表操作 Hook
 * 提供报废、置顶、打印等行操作
 */
export const useStyleActions = (refreshCallback?: () => void) => {
  const { message, modal } = App.useApp();

  /**
   * 报废款式
   */
  const handleScrap = async (id: string) => {
    return new Promise((resolve, reject) => {
      let scrapReason = '';
      modal.confirm({
        title: '确认报废',
        content: React.createElement(
          'div',
          null,
          React.createElement(
            'div',
            { style: { marginBottom: 12 } },
            '报废后记录会保留在当前页面，进度停止，并显示为开发样报废。'
          ),
          React.createElement(Input.TextArea, {
            rows: 4,
            placeholder: '请输入报废原因',
            onChange: (e) => {
              scrapReason = e.target.value;
            },
          })
        ),
        okText: '确认报废',
        cancelText: '取消',
        onOk: async () => {
          try {
            if (!scrapReason.trim()) {
              reject(new Error('请输入报废原因'));
              return Promise.reject(new Error('请输入报废原因'));
            }
            const res = await api.post(`/style/info/${id}/scrap`, { reason: scrapReason.trim() });
            if (res.code === 200) {
              message.success('报废成功');
              refreshCallback?.();
              resolve(true);
            } else {
              message.error(res.message || '报废失败');
              reject(new Error(res.message || '报废失败'));
            }
          } catch (error: any) {
            message.error(error?.message || '报废失败');
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
    handleScrap,
    handleToggleTop,
    handlePrint
  };
};
