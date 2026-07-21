import React from 'react';
import { Button, Spin } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';
import { message } from '@/utils/antdStatic';
import tenantService from '@/services/tenantService';
import { formatDateTime } from '@/utils/datetime';

interface InviteQrState {
  open: boolean;
  loading: boolean;
  qrBase64?: string;
  expiresAt?: string;
}

interface InviteQrModalProps {
  inviteQr: InviteQrState;
  onClose: () => void;
  user: any;
}

const InviteQrModal: React.FC<InviteQrModalProps> = ({ inviteQr, onClose, user }) => {
  return (
    <SmallModal
      title="邀请员工扫码绑定微信"
      open={inviteQr.open}
      onCancel={onClose}
      footer={null}
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        {inviteQr.loading ? (
          <Spin tip="正在生成二维码..."><div style={{ padding: '48px 0' }} /></Spin>
        ) : inviteQr.qrBase64 ? (
          <>
            <img src={inviteQr.qrBase64} alt="邀请二维码" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--color-text-secondary, #666)', fontSize: 13 }}>
              员工用微信扫码后，输入系统账号密码即可完成绑定
            </div>
            {inviteQr.expiresAt && (
              <div style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12, marginTop: 6 }}>
                有效期至：{formatDateTime(inviteQr.expiresAt)}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Button
                icon={<LinkOutlined />}
                onClick={async () => {
                  try {
                    const res: any = await tenantService.myTenant();
                    const tc = res?.data?.tenantCode || res?.tenantCode || '';
                    const tn = res?.data?.tenantName || res?.tenantName || user?.tenantName || '';
                    if (!tc) { message.warning('未获取到工厂码，请稍后重试'); return; }
                    const origin = window.location.origin;
                    const url = `${origin}/register?tenantCode=${encodeURIComponent(tc)}&tenantName=${encodeURIComponent(tn)}`;
                    await navigator.clipboard.writeText(url);
                    message.success('注册链接已复制');
                  } catch { message.error('复制失败，请稍后重试'); }
                }}
              >
                复制注册链接
              </Button>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-tertiary, #999)', padding: '24px 0' }}>二维码生成失败，请重试</div>
        )}
      </div>
    </SmallModal>
  );
};

export default InviteQrModal;
