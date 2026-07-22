import { useCallback, useState } from 'react';
import { App } from 'antd';
import { useModal } from '@/hooks';
import api from '@/utils/api';

export function useLogModal() {
  const { message } = App.useApp();
  const logModal = useModal();
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  const openLogModal = useCallback(async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title);
    logModal.open();
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as any;
      if (result.code === 200) {
        setLogRecords(Array.isArray(result.data) ? result.data : []);
      } else {
        message.error(result.message || '获取日志失败');
        setLogRecords([]);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '获取日志失败');
      setLogRecords([]);
    } finally {
      setLogLoading(false);
    }
  }, [logModal, message]);

  return {
    logModal,
    logLoading,
    logRecords,
    logTitle,
    setLogRecords,
    openLogModal,
  };
}
