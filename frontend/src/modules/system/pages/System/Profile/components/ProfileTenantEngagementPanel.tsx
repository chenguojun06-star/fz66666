import React from 'react';
import { Button, Card, QRCode, Space, Tag, Typography } from 'antd';
import { LinkOutlined, MessageOutlined, QrcodeOutlined, TeamOutlined } from '@ant-design/icons';
import type { UserFeedback } from '@/services/feedbackService';

const FEEDBACK_CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  BUG: { label: '缺陷', color: 'red' },
  SUGGESTION: { label: '建议', color: 'blue' },
  QUESTION: { label: '咨询', color: 'orange' },
  OTHER: { label: '其他', color: 'default' },
};

const FEEDBACK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'default' },
  PROCESSING: { label: '处理中', color: 'processing' },
  RESOLVED: { label: '已解决', color: 'success' },
  CLOSED: { label: '已关闭', color: 'default' },
};

type Props = {
  tenantInfo: { tenantCode?: string; tenantName?: string };
  myFeedbacks: UserFeedback[];
  loadingFeedbacks: boolean;
  onOpenFeedback: () => void;
  onLoadFeedbacks: () => void;
  onCopyRegisterUrl: (url: string) => void;
  onCopyTenantCode: (tenantCode: string) => void;
};

const ProfileTenantEngagementPanel: React.FC<Props> = ({
  tenantInfo,
  myFeedbacks,
  loadingFeedbacks,
  onOpenFeedback,
  onLoadFeedbacks,
  onCopyRegisterUrl,
  onCopyTenantCode,
}) => {
  const origin = window.location.origin;
  const registerUrl = `${origin}/register?tenantCode=${encodeURIComponent(tenantInfo.tenantCode || '')}&tenantName=${encodeURIComponent(tenantInfo.tenantName || '')}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <TeamOutlined style={{ color: 'var(--primary-color)' }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>员工招募</span>
      </div>
      <Card style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <QRCode value={registerUrl} size={160} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, justifyContent: 'flex-start' }}>
              <span style={{ color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>工厂码</span>
              <Typography.Text code copyable={{ text: tenantInfo.tenantCode }} style={{ fontSize: 16, fontWeight: 700 }}>
                {tenantInfo.tenantCode}
              </Typography.Text>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button icon={<LinkOutlined />} onClick={() => onCopyRegisterUrl(registerUrl)}>复制注册链接</Button>
              <Button icon={<QrcodeOutlined />} onClick={() => onCopyTenantCode(tenantInfo.tenantCode || '')}>复制工厂码</Button>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block', wordBreak: 'break-all' }}>
              员工扫码二维码或输入工厂码即可申请加入
            </Typography.Text>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <MessageOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>问题反馈</span>
        </div>
        <Card style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            遇到问题或有改进建议？提交反馈帮助我们优化系统
          </Typography.Text>
          <Space>
            <Button type="primary" icon={<MessageOutlined />} onClick={onOpenFeedback}>提交反馈</Button>
            <Button onClick={onLoadFeedbacks}>我的反馈</Button>
          </Space>
          {myFeedbacks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>最近反馈</div>
              {myFeedbacks.slice(0, 5).map((fb) => (
                <div key={fb.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <Tag color={FEEDBACK_CATEGORY_MAP[fb.category]?.color || 'default'} style={{ margin: 0 }}>
                    {FEEDBACK_CATEGORY_MAP[fb.category]?.label || fb.category}
                  </Tag>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fb.title}</span>
                  <Tag color={FEEDBACK_STATUS_MAP[fb.status || 'PENDING']?.color || 'default'} style={{ margin: 0 }}>
                    {FEEDBACK_STATUS_MAP[fb.status || 'PENDING']?.label}
                  </Tag>
                </div>
              ))}
            </div>
          )}
          {loadingFeedbacks && <div style={{ textAlign: 'center', padding: 16, color: '#999' }}>加载中...</div>}
        </Card>
      </div>
    </div>
  );
};

export default ProfileTenantEngagementPanel;
