import React from 'react';
import { App, Button, QRCode, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { OrganizationUnit } from '@/types/system';

interface QrCodeModalProps {
  open: boolean;
  unit: OrganizationUnit | null;
  tenantCode: string;
  onClose: () => void;
}

const QrCodeModal: React.FC<QrCodeModalProps> = ({ open, unit, tenantCode, onClose }) => {
  const { message } = App.useApp();

  const registerUrl = unit
    ? `${window.location.origin}/register?type=FACTORY_INVITE&tenantCode=${encodeURIComponent(tenantCode)}&factoryId=${encodeURIComponent(unit.factoryId || String(unit.id))}&factoryName=${encodeURIComponent(unit.unitName)}&orgUnitId=${encodeURIComponent(String(unit.id))}`
    : ' ';

  const handleCopyLink = () => {
    if (!unit) return;
    navigator.clipboard.writeText(registerUrl).then(() => {
      message.success('注册链接已复制');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  return (
    <ResizableModal
      open={open}
      title={`${unit?.unitName || ''} · 注册二维码`}
      onCancel={onClose}
      footer={null}
      width="30vw"
      initialHeight={420}
    >
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <QRCode
          value={registerUrl}
          size={220}
          style={{ margin: '0 auto' }}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
          外发工厂工人扫码注册，自动归属到「{unit?.unitName}」
        </Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={handleCopyLink}>
            复制注册链接
          </Button>
        </div>
      </div>
    </ResizableModal>
  );
};

export default QrCodeModal;
