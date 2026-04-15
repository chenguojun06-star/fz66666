import { useState, useEffect } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';

export default function InvitePage() {
  const [tenantCode, setTenantCode] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [qrUrl, setQrUrl] = useState('');
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
    <div className="sub-page">
      <div className="card-item" style={{ textAlign: 'center' }}>
        <div className="card-item-title" style={{ marginBottom: 16 }}>邀请员工</div>
        {loading ? (
          <div className="loading-state">加载中...</div>
        ) : (
          <>
            {qrUrl && (
              <div style={{ marginBottom: 16 }}>
                <img src={qrUrl.startsWith('data:') ? qrUrl : `data:image/png;base64,${qrUrl}`} alt="邀请二维码"
                  className="qr-code-img" />
              </div>
            )}
            <div className="card-item-meta">{tenantName || '工厂'}</div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '8px 0', letterSpacing: 2 }}>{tenantCode || '-'}</div>
            <div className="card-item-meta" style={{ marginBottom: 16 }}>工厂码</div>
            <div className="sub-page-row-stretch">
              <button className="primary-button" onClick={onCopyTenantCode}>复制工厂码</button>
              <button className="secondary-button" onClick={onCopyInviteUrl}>复制链接</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
