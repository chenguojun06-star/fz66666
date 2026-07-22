import { useState } from 'react';
import { message } from 'antd';
import api from '@/utils/api';
import { getErrorMessage } from '@/types/api';
import type { OperationLog } from './helpers';

export function useOperationLog() {
  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<OperationLog[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title); setLogVisible(true); setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) setLogRecords(Array.isArray(result.data) ? (result.data as OperationLog[]) : []);
      else { message.error(String(result.message || '获取日志失败')); setLogRecords([]); }
    } catch (e: unknown) { message.error(getErrorMessage(e, '获取日志失败')); setLogRecords([]); }
    finally { setLogLoading(false); }
  };

  return {
    logVisible,
    setLogVisible,
    logLoading,
    logRecords,
    setLogRecords,
    logTitle,
    openLogModal,
  };
}
