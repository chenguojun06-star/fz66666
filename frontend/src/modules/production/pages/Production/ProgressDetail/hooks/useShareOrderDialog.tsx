import { useCallback, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { productionOrderApi } from '@/services/production/productionApi';
import type { ProductionOrder } from '@/types/production';

interface UseShareOrderDialogOptions {
  message: any;
}

export const useShareOrderDialog = ({ message }: UseShareOrderDialogOptions) => {
  const [shareModal, setShareModal] = useState<{
    open: boolean;
    shareUrl: string;
    loading: boolean;
  }>({ open: false, shareUrl: '', loading: false });

  const closeShareModal = useCallback(() => {
    setShareModal({ open: false, shareUrl: '', loading: false });
  }, []);

  const copyTextSafely = useCallback(async (text: string) => {
    const value = String(text || '').trim();
    if (!value) {
      message.warning('复制内容为空');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        message.success('链接已复制到剪贴板');
        return;
      }
    } catch {
    }

    try {
      if (typeof document === 'undefined') {
        message.error('当前环境不支持复制，请手动复制');
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.left = '-1000px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (copied) {
        message.success('链接已复制到剪贴板');
      } else {
        message.error('复制失败，请手动复制');
      }
    } catch {
      message.error('复制失败，请手动复制');
    }
  }, [message]);

  const handleShareOrder = useCallback(async (order: ProductionOrder) => {
    if (!order.id) return;
    setShareModal({ open: true, shareUrl: '', loading: true });
    try {
      const res = await productionOrderApi.generateShareToken(String(order.id));
      const token = (res as any)?.token || (res as any)?.data?.token;
      const shareUrl = token ? `${window.location.origin}/share/${token}` : '';
      if (!shareUrl) {
        closeShareModal();
        message.error('生成分享链接失败');
        return;
      }
      setShareModal({ open: true, shareUrl, loading: false });
    } catch {
      closeShareModal();
      message.error('生成分享链接失败，请重试');
    }
  }, [closeShareModal, message]);

  const shareOrderDialog = (
    <Modal
      title=" 客户订单追踪链接"
      open={shareModal.open}
      onCancel={closeShareModal}
      footer={
        shareModal.loading
          ? null
          : [
            <Button
              key="copy"
              type="primary"
              onClick={() => {
                void copyTextSafely(shareModal.shareUrl);
              }}
            >
              复制链接
            </Button>,
            <Button key="ok" onClick={closeShareModal}>
              知道了
            </Button>,
          ]
      }
      width={540}
      destroyOnHidden
    >
      {shareModal.loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#666' }}>正在生成分享链接…</div>
      ) : (
        <div>
          <p style={{ marginBottom: 8, color: '#555', fontSize: 13 }}>
            发送以下链接给客户，客户无需登录即可实时查看订单工序跟进（30天有效）：
          </p>
          <Input.TextArea
            value={shareModal.shareUrl}
            autoSize={{ minRows: 2 }}
            readOnly
            style={{ fontSize: 12, background: '#f5f5f5', cursor: 'text' }}
          />
        </div>
      )}
    </Modal>
  );

  return {
    handleShareOrder,
    shareOrderDialog,
  };
};
