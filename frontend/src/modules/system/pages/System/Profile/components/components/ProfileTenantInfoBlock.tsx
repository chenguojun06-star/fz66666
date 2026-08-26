/**
 * 工厂信息区块 — 工厂名称/联系人/联系电话 + 企业微信 Webhook
 */
import React from 'react';
import { Button, Card, Form, Input, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { TenantInfo } from '../types';

interface ProfileTenantInfoBlockProps {
    tenantInfo: TenantInfo | null;
    tenantForm: FormInstance;
    savingWebhook: boolean;
    onSaveWebhook: () => void;
}

const ProfileTenantInfoBlock: React.FC<ProfileTenantInfoBlockProps> = ({
    tenantInfo,
    tenantForm,
    savingWebhook,
    onSaveWebhook,
}) => {
    if (!tenantInfo?.tenantCode) return null;

    return (
        <Card title={<>工厂信息 <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>（如需修改请联系管理员）</Typography.Text></>} style={{ marginBottom: 16 }}>
            <Form form={tenantForm} layout="vertical" requiredMark={false}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
                    <Form.Item label="工厂名称" name="tenantName"><Input disabled autoComplete="organization" /></Form.Item>
                    <Form.Item label="联系人" name="contactName"><Input disabled autoComplete="name" /></Form.Item>
                    <Form.Item label="联系电话" name="contactPhone"><Input disabled autoComplete="tel" /></Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <Form.Item
                        label="企业微信群机器人 Webhook"
                        name="wechatWorkWebhookUrl"
                        style={{ flex: 1, marginBottom: 0 }}
                        tooltip="广播订单风险预警和透单通知到工厂微信群；空时不发送"
                    >
                        <Input
                            placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                            allowClear
                            autoComplete="url"
                        />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                        <Button type="primary" onClick={onSaveWebhook} loading={savingWebhook}>
                            保存
                        </Button>
                    </Form.Item>
                </div>
            </Form>
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                工厂码：<Typography.Text code copyable>{tenantInfo.tenantCode}</Typography.Text>（不可修改）
            </Typography.Text>
        </Card>
    );
};

export default ProfileTenantInfoBlock;
