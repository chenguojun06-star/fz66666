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
      <div className="u-d-flex u-ai-center u-gap-8 u-mb-12">
        <TeamOutlined style={{ color: 'var(--primary-color)' }} />
        <span className="u-fw-600 u-fs-15">员工招募</span>
      </div>
      <Card style={{ borderRadius: 10, background: 'var(--card-bg, var(--color-slate-50))' }}>
        <div className="u-d-grid u-gap-12 u-ai-center" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="u-ta-center">
            <QRCode value={registerUrl} size={160} />
          </div>
          <div>
            <div className="u-d-flex u-ai-center u-gap-8 u-mb-10" style={{ justifyContent: 'flex-start' }}>
              <span className="u-fs-14 u-ws-nowrap" style={{ color: 'var(--color-text-muted)' }}>工厂码</span>
              <Typography.Text code copyable={{ text: tenantInfo.tenantCode }} style={{ fontSize: 16, fontWeight: 700 }}>
                {tenantInfo.tenantCode}
              </Typography.Text>
            </div>
            <div className="u-d-flex u-fwrap-wrap u-gap-8">
              <Button icon={<LinkOutlined />} onClick={() => onCopyRegisterUrl(registerUrl)}>复制注册链接</Button>
              <Button icon={<QrcodeOutlined />} onClick={() => onCopyTenantCode(tenantInfo.tenantCode || '')}>复制工厂码</Button>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 15, marginTop: 8, display: 'block', wordBreak: 'break-all' }}>
              员工扫码二维码或输入工厂码即可申请加入
            </Typography.Text>
          </div>
        </div>
      </Card>

      <div className="u-mt-16">
        <div className="u-d-flex u-ai-center u-gap-8 u-mb-12">
          <MessageOutlined style={{ color: 'var(--primary-color)' }} />
          <span className="u-fw-600 u-fs-15">问题反馈</span>
        </div>
        <Card style={{ borderRadius: 10, background: 'var(--card-bg, var(--color-slate-50))' }}>
          <Typography.Text type="secondary" style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
            遇到问题或有改进建议？提交反馈帮助我们优化系统
          </Typography.Text>
          <Space>
            <Button type="primary" icon={<MessageOutlined />} onClick={onOpenFeedback}>提交反馈</Button>
            <Button onClick={onLoadFeedbacks}>我的反馈</Button>
          </Space>
          {myFeedbacks.length > 0 && (
            <div className="u-mt-16">
              <div className="u-fs-14 u-fw-600 u-mb-8">最近反馈</div>
              {myFeedbacks.slice(0, 5).map((fb) => (
                <div key={fb.id} className="u-d-flex u-ai-center u-gap-8" style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                  <Tag color={FEEDBACK_CATEGORY_MAP[fb.category]?.color || 'default'} style={{ margin: 0 }}>
                    {FEEDBACK_CATEGORY_MAP[fb.category]?.label || fb.category}
                  </Tag>
                  <span className="u-flex-1 u-fs-14 u-ov-hidden u-ws-nowrap" style={{ textOverflow: 'ellipsis' }}>{fb.title}</span>
                  <Tag color={FEEDBACK_STATUS_MAP[fb.status || 'PENDING']?.color || 'default'} style={{ margin: 0 }}>
                    {FEEDBACK_STATUS_MAP[fb.status || 'PENDING']?.label}
                  </Tag>
                </div>
              ))}
            </div>
          )}
          {loadingFeedbacks && <div className="u-ta-center u-p-16" style={{ color: 'var(--color-text-tertiary)' }}>加载中...</div>}
        </Card>
      </div>
    </div>
  );
};

export default ProfileTenantEngagementPanel;
