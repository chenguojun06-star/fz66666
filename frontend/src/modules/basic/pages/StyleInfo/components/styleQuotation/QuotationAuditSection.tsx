import React from 'react';
import { Card, Tag, Input, Space, Button, Popconfirm, Descriptions } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

interface Props {
  isLocked: boolean;
  quotation: any;
  auditRemark: string;
  onRemarkChange: (v: string) => void;
  auditSubmitting: boolean;
  onAudit: (status: number) => void;
}

const QuotationAuditSection: React.FC<Props> = ({
  isLocked,
  quotation,
  auditRemark,
  onRemarkChange,
  auditSubmitting,
  onAudit,
}) => {
  if (!isLocked) return null;

  const auditStatus = quotation?.auditStatus ?? 0;

  const statusTag = () => {
    if (auditStatus === 1)
      return <Tag color="success" icon={<CheckCircleOutlined />}>审核通过</Tag>;
    if (auditStatus === 2)
      return <Tag color="error" icon={<CloseCircleOutlined />}>已驳回</Tag>;
    return <Tag color="warning" icon={<ExclamationCircleOutlined />}>待审核</Tag>;
  };

  return (
    <Card
      title={<span style={{ fontSize: '15px', fontWeight: 600 }}>报价审核</span>}
      extra={statusTag()}
      size="small"
      style={{ marginTop: 4 }}
      styles={{ body: { padding: '16px' } }}
    >
      {auditStatus === 0 ? (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            value={auditRemark}
            onChange={(e) => onRemarkChange(e.target.value)}
            rows={3}
            placeholder="请输入审核意见（可选）"
            disabled={auditSubmitting}
          />
          <Space>
            <Popconfirm
              title="确认审核通过？"
              onConfirm={() => onAudit(1)}
              okText="确认通过"
              cancelText="取消"
            >
              <Button type="primary" loading={auditSubmitting} icon={<CheckCircleOutlined />}>
                审核通过
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认驳回此报价？"
              onConfirm={() => onAudit(2)}
              okText="确认驳回"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger loading={auditSubmitting} icon={<CloseCircleOutlined />}>
                驳回
              </Button>
            </Popconfirm>
          </Space>
        </Space>
      ) : (
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="审核结论">{statusTag()}</Descriptions.Item>
          <Descriptions.Item label="审核人">{quotation?.auditorName || '-'}</Descriptions.Item>
          <Descriptions.Item label="审核时间">{quotation?.auditTime || '-'}</Descriptions.Item>
          <Descriptions.Item label="审核意见" span={2}>
            {quotation?.auditRemark || '无'}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
};

export default QuotationAuditSection;
