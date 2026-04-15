import { useState, useEffect } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';

export default function InvitePage() {
  const [tenantCode, setTenantCode] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadTenantInfo(); }, []);

  const loadTenantInfo = async () => {
    setLoading(true);
    try {
      const [tenantResp, qrResp] = await Promise.allSettled([
        api.tenant.myTenant(),
        api.wechat.generateInviteQr({}),
      ]);
      const tenant = tenantResp.status === 'fulfilled' ? (tenantResp.value?.data || tenantResp.value || {}) : {};
      const qrData = qrResp.status === 'fulfilled' ? (qrResp.value?.data || qrResp.value || {}) : {};
      setTenantCode(tenant?.tenantCode || '');
      setTenantName(tenant?.tenantName || '');
      setInviteToken(qrData?.inviteToken || '');
      const base64 = qrData?.qrCodeBase64 || '';
      setQrUrl(base64);
    } catch (err) {
      toast.error('加载失败，请重试');
    } finally { setLoading(false); }
  };

  const onCopyTenantCode = () => {
    if (!tenantCode) { toast.error('暂无邀请码'); return; }
    navigator.clipboard.writeText(tenantCode).then(() => toast.success('工厂码已复制')).catch(() => {
      fallbackCopy(tenantCode);
    });
  };

  const onCopyInviteUrl = () => {
    if (!tenantCode) { toast.error('暂无邀请码'); return; }
    const origin = window.location.origin;
    const url = `${origin}/register?tenantCode=${encodeURIComponent(tenantCode)}&tenantName=${encodeURIComponent(tenantName)}`;
    navigator.clipboard.writeText(url).then(() => toast.success('注册链接已复制')).catch(() => {
      fallbackCopy(url);
    });
  };

  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast.success('已复制');
    } catch (_) {
      toast.error('复制失败，请手动复制');
    }
    document.body.removeChild(ta);
  };

  return (
    <div className="sub-page">
      <div className="card-item" style={{ textAlign: 'center' }}>
        <div className="card-item-title" style={{ marginBottom: 16 }}>邀请员工</div>
        {loading ? (
          <div className="loading-state">正在生成邀请码...</div>
        ) : (
          <>
            {qrUrl ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 8 }}>微信扫一扫，加入工厂</div>
                <img src={qrUrl.startsWith('data:') ? qrUrl : `data:image/png;base64,${qrUrl}`} alt="邀请二维码"
                  className="qr-code-img" style={{ width: 200, height: 200, borderRadius: 'var(--radius-md)' }} />
              </div>
            ) : (
              <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📋</div>
                <div>二维码加载失败</div>
                <button className="ghost-button" style={{ marginTop: 8 }} onClick={loadTenantInfo}>点击重试</button>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 16, marginTop: 8 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 8 }}>工厂邀请码</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{tenantName || '工厂'}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '8px 0', letterSpacing: 2, color: 'var(--color-primary)' }}>{tenantCode || '-'}</div>
              <button className="ghost-button" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 16px' }} onClick={onCopyTenantCode}>复制</button>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 16, marginTop: 16 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 4 }}>PC端注册链接</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>员工可通过此链接在电脑端注册账号</div>
              <button className="secondary-button" style={{ width: '100%' }} onClick={onCopyInviteUrl}>复制注册链接</button>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 16, marginTop: 16 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 8 }}>邀请步骤</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 2, textAlign: 'left' }}>
                <div>1. 分享二维码或工厂码给新员工</div>
                <div>2. 新员工扫码或输入工厂码注册</div>
                <div>3. 管理员在用户审批中确认成员</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
