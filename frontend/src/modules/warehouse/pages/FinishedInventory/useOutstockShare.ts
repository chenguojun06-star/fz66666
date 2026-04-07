import { useState, useCallback } from 'react';
import api from '@/utils/api';

interface ShareHookResult {
  shareModalOpen: boolean;
  shareUrl: string;
  shareLoading: boolean;
  handleShare: (record: { customerName?: string }) => Promise<void>;
  handleCopyShareUrl: () => Promise<void>;
  setShareModalOpen: (open: boolean) => void;
}

export function useOutstockShare(message: { success: (msg: string) => void; warning: (msg: string) => void; error: (msg: string) => void }): ShareHookResult {
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);

  const handleShare = useCallback(async (record: { customerName?: string }) => {
    if (!record.customerName) {
      message.warning('该记录无客户信息，无法分享');
      return;
    }
    setShareModalOpen(true);
    setShareUrl('');
    setShareLoading(true);
    try {
      const res = await api.post('/warehouse/finished-inventory/outstock/share-token', {
        customerName: record.customerName,
      });
      const data = res.data || res;
      const token = data?.token;
      if (!token) {
        setShareModalOpen(false);
        message.error('生成分享链接失败');
        return;
      }
      setShareUrl(`${window.location.origin}/share/outstock/${token}`);
    } catch {
      setShareModalOpen(false);
      message.error('生成分享链接失败，请重试');
    } finally {
      setShareLoading(false);
    }
  }, [message]);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success('链接已复制到剪贴板');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      message.success('链接已复制到剪贴板');
    }
  }, [shareUrl, message]);

  return { shareModalOpen, shareUrl, shareLoading, handleShare, handleCopyShareUrl, setShareModalOpen };
}
