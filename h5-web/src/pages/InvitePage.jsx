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
      const tenant = tenantResp.status === 'fulfilled' ? tenantResp.value : {};
      const qrData = qrResp.status === 'fulfilled' ? qrResp.value : {};
      setTenantCode(tenant?.tenantCode || '');
      setTenantName(tenant?.tenantName || '');
      setQrUrl(qrData?.qrCodeBase64 || '');
      setInviteToken(qrData?.inviteToken || '');
    } catch (err) {
      toast.error('加载失败，请重试');
    } finally { setLoading(false); }
  };

  const onCopyTenantCode = () => {
    if (!tenantCode) { toast.error('暂无邀请码'); return; }
    navigator.clipboard.writeText(tenantCode).then(() => toast.success('工厂码已复制')).catch(() => toast.error('复制失败'));
  };

  const onCopyInviteUrl = () => {
    if (!tenantCode) { toast.error('暂无邀请码'); return; }
    const url = window.location.origin + '/register?tenantCode=' + encodeURIComponent(tenantCode) + '&tenantName=' + encodeURIComponent(tenantName);
    navigator.clipboard.writeText(url).then(() => toast.success('链接已复制')).catch(() => toast.error('复制失败'));
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 16px' }}>邀请员工</h3>
        {loading ? (
          <div style={{ padding: 20, color: 'var(--color-text-secondary)' }}>加载中...</div>
        ) : (
          <>
            {qrUrl && (
              <div style={{ marginBottom: 16 }}>
                <img src={qrUrl.startsWith('data:') ? qrUrl : `data:image/png;base64,${qrUrl}`} alt="邀请二维码"
                  style={{ width: 200, height: 200, borderRadius: 8 }} />
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{tenantName || '工厂'}</div>
            <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0', letterSpacing: 2 }}>{tenantCode || '-'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>工厂码</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary-button" style={{ flex: 1 }} onClick={onCopyTenantCode}>复制工厂码</button>
              <button className="secondary-button" style={{ flex: 1 }} onClick={onCopyInviteUrl}>复制链接</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
