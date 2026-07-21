import React from 'react';
import { App, Button, Spin } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';
import tenantService from '@/services/tenantService';
import { useUser } from '@/utils/AuthContext';
import type { InviteQrState } from '../hooks/useTemplateAndQr';

interface InviteQrModalProps {
  inviteQr: InviteQrState;
  setInviteQr: React.Dispatch<React.SetStateAction<InviteQrState>>;
}

/** 邀请员工扫码绑定微信弹窗 */
const InviteQrModal: React.FC<InviteQrModalProps> = ({ inviteQr, setInviteQr }) => {
  const { message } = App.useApp();
  const { user } = useUser();

  return (
    <SmallModal
      title="邀请员工扫码绑定微信"
      open={inviteQr.open}
      onCancel={() => setInviteQr({ open: false, loading: false })}
      footer={null}
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        {inviteQr.loading ? (
          <div style={{ padding: '48px 0' }}><Spin tip="正在生成二维码..." /></div>
        ) : inviteQr.qrBase64 ? (
          <>
            <img src={inviteQr.qrBase64} alt="邀请二维码" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }} />
            <div style={{ color: 'var(--color-text-secondary, #666)', fontSize: 14 }}>
              员工用微信扫码后，输入系统账号密码即可完成绑定
            </div>
            {inviteQr.expiresAt && (
              <div style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 14, marginTop: 8 }}>
                有效期至：{inviteQr.expiresAt.replace('T', ' ').slice(0, 16)}
              </div>
            )}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
              <Button
                icon={<LinkOutlined />}
                onClick={async () => {
                  try {
                    const res: any = await tenantService.myTenant();
                    const tc = res?.data?.tenantCode || res?.tenantCode || '';
                    const tn = res?.data?.tenantName || res?.tenantName || (user as any)?.tenantName || '';
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
