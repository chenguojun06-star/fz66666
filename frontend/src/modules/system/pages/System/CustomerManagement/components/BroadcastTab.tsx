import React, { useState } from 'react';
import { Form, Input, Select, Button, Alert, Card, Space } from 'antd';
import { SendOutlined, NotificationOutlined } from '@ant-design/icons';
import request from '@/utils/api';
import { message } from '@/utils/antdStatic';

const { TextArea } = Input;

const BROADCAST_TYPES = [
  { value: 'upgrade',      label: ' 系统升级' },
  { value: 'maintenance',  label: ' 系统维护' },
  { value: 'announcement', label: ' 重要公告' },
];

const BroadcastTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ sentCount: number; time: string } | null>(null);

  const handleSend = async (values: Record<string, string>) => {
    setLoading(true);
    try {
      const res: any = await request.post('/system/tenant/broadcast', values);
      const sentCount: number = res?.data?.sentCount ?? res?.sentCount ?? 0;
      setLastResult({ sentCount, time: new Date().toLocaleString() });
      message.success(`已向 ${sentCount} 个租户发送通知`);
      form.resetFields();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, padding: '24px 0' }}>
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Alert
          type="info"
          showIcon
          title="发送后所有活跃租户的主账号将在系统通知铃铛中收到该公告"
          description="适用于系统升级、停机维护、功能变更等需要提前告知客户的场景"
        />
        <Card title={<><NotificationOutlined /> 发送全租户通知</>}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSend}
            initialValues={{ type: 'announcement' }}
          >
            <Form.Item label="通知类型" name="type" rules={[{ required: true }]}>
              <Select options={BROADCAST_TYPES} />
            </Form.Item>
            <Form.Item
              label="通知标题"
              name="title"
              rules={[{ required: true, message: '请填写标题' }]}
            >
              <Input
                placeholder="例：系统将于今晚22:00进行升级维护"
                maxLength={100}
                showCount
              />
            </Form.Item>
            <Form.Item
              label="通知内容"
              name="content"
              rules={[{ required: true, message: '请填写内容' }]}
            >
              <TextArea
                rows={5}
                placeholder="请详细说明本次升级/维护的影响范围、预计时长及注意事项..."
                maxLength={500}
                showCount
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<SendOutlined />}
                size="large"
              >
                发送给所有租户
              </Button>
            </Form.Item>
          </Form>
        </Card>
        {lastResult && (
          <Alert
            type="success"
            title={`上次发送：${lastResult.time} — 已推送 ${lastResult.sentCount} 个租户`}
          />
        )}
      </Space>
    </div>
  );
};

export default BroadcastTab;
