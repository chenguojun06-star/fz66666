import { useState, useEffect } from 'react';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';

export default function InvitePage() {
  const user = useAuthStore((s) => s.user);
  const tenantName = useAuthStore((s) => s.tenantName);
  const [tenantCode, setTenantCode] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrError, setQrError] = useState(false);

  useEffect(() => { loadTenantInfo(); }, []);

  const loadTenantInfo = async () => {
    setLoading(true);
    setQrError(false);
    try {
      const [tenantResp, qrResp] = await Promise.allSettled([
        api.tenant.myTenant(),
        api.wechat.generateInviteQr({}),
      ]);
      const tenant = tenantResp.status === 'fulfilled' ? (tenantResp.value?.data || tenantResp.value || {}) : {};
      const qrData = qrResp.status === 'fulfilled' ? (qrResp.value?.data || qrResp.value || {}) : {};
      setTenantCode(tenant?.tenantCode || user?.tenantCode || '');

      const base64 = qrData?.qrCodeBase64 || qrData?.qrCode || qrData?.base64 || '';
      if (base64) {
        setQrUrl(base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`);
      } else if (qrData?.url) {
        setQrUrl(qrData.url);
      } else {
        setQrError(true);
      }
    } catch (err) {
      setQrError(true);
      toast.error('加载失败，请重试');
    } finally { setLoading(false); }
  };

  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast.success('已复制'); }
    catch (_) { toast.error('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  };

  const onCopyTenantCode = () => {
    if (!tenantCode) { toast.error('暂无工厂码'); return; }
    navigator.clipboard.writeText(tenantCode).then(() => toast.success('工厂码已复制')).catch(() => fallbackCopy(tenantCode));
  };

  const onCopyInviteUrl = () => {
    if (!tenantCode) { toast.error('暂无邀请码'); return; }
    const origin = window.location.origin;
    const url = `${origin}/register?tenantCode=${encodeURIComponent(tenantCode)}&tenantName=${encodeURIComponent(tenantName || '')}`;
    navigator.clipboard.writeText(url).then(() => toast.success('注册链接已复制')).catch(() => fallbackCopy(url));
  };

  return (
    <div className="sub-page">
      <div className="card-item" style={{ textAlign: 'center' }}>
        <div className="card-item-title" style={{ marginBottom: 16, fontSize: 'var(--font-size-lg)' }}>员工邀请</div>
        {loading ? (
          <div className="loading-state">正在加载...</div>
        ) : (
          <>
            {qrUrl && !qrError ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 8 }}>微信扫一扫，加入工厂</div>
                <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-light)' }}>
                  <img src={qrUrl} alt="邀请二维码"
                    className="qr-code-img" style={{ width: 200, height: 200, borderRadius: 'var(--radius-md)', display: 'block' }}
                    onError={(e) => { e.target.style.display = 'none'; setQrError(true); }} />
                </div>
              </div>
            ) : (
              <div style={{ padding: 32, color: 'var(--color-text-tertiary)' }}>
                <Icon name="image" size={48} color="var(--color-text-disabled)" />
                <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)' }}>二维码加载失败</div>
                <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 4, color: 'var(--color-text-disabled)' }}>请在微信环境中使用此功能</div>
                <button className="ghost-button" style={{ marginTop: 12 }} onClick={loadTenantInfo}>点击重试</button>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 16, marginTop: 8 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 8 }}>工厂邀请码</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{tenantName || '工厂'}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '8px 0', letterSpacing: 2, color: 'var(--color-primary)' }}>{tenantCode || '-'}</div>
              <button className="primary-button" style={{ width: '100%' }} onClick={onCopyTenantCode}>复制工厂码</button>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 16, marginTop: 16 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 4 }}>注册链接</div>
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
