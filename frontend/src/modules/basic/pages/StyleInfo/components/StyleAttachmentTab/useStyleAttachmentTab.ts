import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { StyleAttachment } from '@/types/style';
import api from '@/utils/api';
import { debugValue } from './helpers';

interface UseStyleAttachmentTabOptions {
  styleId: string | number;
  styleNo?: string;
  bizType?: string;
  readOnly?: boolean;
  onListChange?: (list: StyleAttachment[]) => void;
}

export const useStyleAttachmentTab = ({
  styleId,
  styleNo,
  bizType,
  onListChange,
}: UseStyleAttachmentTabOptions) => {
  const [data, setData] = useState<StyleAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const messageRef = useRef(message);
  messageRef.current = message;

  const normalizedStyleId = useMemo(() => {
    const value = String(styleId ?? '').trim();
    if (!value || value === 'undefined' || value === 'null') {
      return '';
    }
    return value;
  }, [styleId]);

  const normalizedStyleNo = useMemo(() => String(styleNo || '').trim(), [styleNo]);

  const onListChangeRef = useRef(onListChange);
  onListChangeRef.current = onListChange;

  const isPattern = useMemo(() => {
    const type = String(bizType || '').trim().toLowerCase();
    return type === 'pattern' || type === 'pattern_grading';
  }, [bizType]);

  const fetchList = useCallback(async () => {
    if (!normalizedStyleId && !normalizedStyleNo) {
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<StyleAttachment[]>('/style/attachment/list', {
        params: {
          ...(normalizedStyleId ? { styleId: normalizedStyleId } : {}),
          ...(normalizedStyleNo ? { styleNo: normalizedStyleNo } : {}),
          ...(bizType ? { bizType } : {}),
        },
      });
      const result = res as any;
      if (result.code === 200) {
        const list = Array.isArray(result.data) ? (result.data as StyleAttachment[]) : [];
        setData(list);
        onListChangeRef.current?.(list);
      }
    } catch (error) {
      messageRef.current.error('获取附件列表失败');
    } finally {
      setLoading(false);
    }
  }, [normalizedStyleId, normalizedStyleNo, bizType]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleDelete = async (id: string | number) => {
    try {
      const res = await api.delete(`/style/attachment/${id}`);
      const result = res as any;
      if (result.code === 200 && result.data === true) {
        message.success('删除成功');
        fetchList();
      } else {
        const detail = `code:${debugValue(result?.code)}, data:${debugValue(result?.data)}`;
        message.error(`${result?.message || '删除失败'}（${detail}）`);
      }
    } catch (error: unknown) {
      message.error(`删除失败（${error instanceof Error ? error.message : '请求失败'}）`);
    }
  };

  const uploadOne = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      message.error('文件过大，最大15MB');
      return;
    }
    if (!normalizedStyleId && !normalizedStyleNo) {
      message.error('请先保存基础信息，再上传附件');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    if (normalizedStyleId) {
      formData.append('styleId', normalizedStyleId);
    }
    if (normalizedStyleNo) {
      formData.append('styleNo', normalizedStyleNo);
    }
    if (bizType) {
      formData.append('bizType', String(bizType));
    }

    try {
      const res = await api.post('/style/attachment/upload', formData);
      const result = res as any;
      if (result.code === 200) {
        message.success('上传成功');
        fetchList();
      } else {
        message.error(result.message || '上传失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '上传失败');
    }
  };

  return {
    data,
    loading,
    isPattern,
    fetchList,
    handleDelete,
    uploadOne,
  };
};
