import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Badge, Statistic, Button, Tag, Spin, message, Tooltip, Divider } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  StopOutlined,
  CopyOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';

interface ChannelInfo {
  name: string;
  category: 'PAYMENT' | 'LOGISTICS';
  code: string;
  enabled: boolean;
  configured: boolean;
  mode: 'LIVE' | 'MOCK' | 'DISABLED';
  webhookPath: string;
}

interface DashboardStats {
  paymentCount7d: number;
  logisticsCount7d: number;
  unprocessedCallbacks: number;
}

interface Props { active: boolean; }

// yml 字段对照
const CONFIG_HINTS: Record<string, string> = {
  ALIPAY: 'alipay.enabled=true\nalipay.app-id=\nalipay.private-key=\nalipay.public-key=\nalipay.notify-url=',
  WECHAT_PAY: 'wechat-pay.enabled=true\nwechat-pay.app-id=\nwechat-pay.mch-id=\nwechat-pay.api-v3-key=\nwechat-pay.notify-url=',
  SF: 'sf-express.enabled=true\nsf-express.app-key=\nsf-express.app-secret=\nsf-express.notify-url=',
  STO: 'sto-express.enabled=true\nsto-express.app-key=\nsto-express.app-secret=\nsto-express.notify-url=',
};

const MODE_CONFIG = {
  LIVE:     { color: 'success', icon: <CheckCircleOutlined />, text: '已接入 LIVE', tagColor: 'green' },
  MOCK:     { color: 'warning', icon: <WarningOutlined />,     text: 'Mock 模式',  tagColor: 'orange' },
  DISABLED: { color: 'default', icon: <StopOutlined />,        text: '未启用',     tagColor: 'default' },
} as const;

const WEBHOOK_BASE = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8088` : '';

const ChannelStatusTab: React.FC<Props> = ({ active }) => {
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: { channels: ChannelInfo[]; stats: DashboardStats } }>(
        '/integration/channel-status', {}
      );
      if (res.code === 200) {
        setChannels(res.data.channels);
        setStats(res.data.stats);
      }
    } catch {
      message.error('获取渠道状态失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (active) fetchData(); }, [active, fetchData]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制到剪贴板'));
  };

  return (
    <Spin spinning={loading}>
      {/* 统计栏 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24, marginTop: 16 }}>
          <Col span={8}>
            <Card size="small" bordered={false} style={{ background: '#f6ffed', borderRadius: 8 }}>
              <Statistic title="近7天支付流水" value={stats.paymentCount7d} suffix="笔" valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" bordered={false} style={{ background: '#e6f4ff', borderRadius: 8 }}>
              <Statistic title="近7天物流运单" value={stats.logisticsCount7d} suffix="件" valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" bordered={false} style={{ background: stats.unprocessedCallbacks > 0 ? '#fff7e6' : '#f9f9f9', borderRadius: 8 }}>
              <Statistic title="待处理回调" value={stats.unprocessedCallbacks} suffix="条"
                valueStyle={{ color: stats.unprocessedCallbacks > 0 ? '#fa8c16' : '#999' }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 渠道卡片 */}
      <Row gutter={[16, 16]}>
        {channels.map(ch => {
          const modeConf = MODE_CONFIG[ch.mode];
          const hint = CONFIG_HINTS[ch.code] || '';
          const webhookUrl = `${WEBHOOK_BASE}${ch.webhookPath}`;
          return (
            <Col key={ch.code} xs={24} sm={12} lg={12} xl={6}>
              <Badge.Ribbon text={modeConf.text} color={modeConf.tagColor}>
                <Card
                  title={
                    <span>
                      {modeConf.icon}&nbsp;
                      <Tag color={ch.category === 'PAYMENT' ? 'blue' : 'geekblue'} style={{ marginRight: 4 }}>
                        {ch.category === 'PAYMENT' ? '支付' : '物流'}
                      </Tag>
                      {ch.name}
                    </span>
                  }
                  style={{ height: '100%', borderRadius: 8 }}
                  styles={{ body: { paddingTop: 12 } }}
                >
                  {ch.mode === 'LIVE' && (
                    <p style={{ color: '#52c41a', margin: '0 0 8px' }}>✓ 密钥已配置，正在调用真实 API</p>
                  )}
                  {ch.mode === 'MOCK' && (
                    <p style={{ color: '#fa8c16', margin: '0 0 8px' }}>尚未填写密钥，当前以 Mock 模拟运行</p>
                  )}
                  {ch.mode === 'DISABLED' && (
                    <p style={{ color: '#999', margin: '0 0 8px' }}>application.yml 中 enabled=false</p>
                  )}

                  <Divider style={{ margin: '8px 0' }} />

                  <div style={{ fontSize: 12, color: '#666' }}>
                    <div style={{ marginBottom: 4 }}>
                      <strong>Webhook 地址：</strong>
                      <Tooltip title={webhookUrl}>
                        <span style={{ fontFamily: 'monospace', marginRight: 6, wordBreak: 'break-all' }}>
                          ...{ch.webhookPath}
                        </span>
                      </Tooltip>
                      <Button type="link" size="small" icon={<CopyOutlined />}
                        onClick={() => copyText(webhookUrl)} style={{ padding: 0 }}>
                        复制
                      </Button>
                    </div>

                    {ch.mode !== 'LIVE' && hint && (
                      <div style={{ marginTop: 8 }}>
                        <strong>填写到 application.yml：</strong>
                        <Tooltip title={<pre style={{ fontSize: 11 }}>{hint}</pre>} placement="bottom">
                          <Button type="link" size="small" icon={<QuestionCircleOutlined />}
                            style={{ padding: '0 4px' }}>查看配置项</Button>
                        </Tooltip>
                        <Button type="link" size="small" icon={<CopyOutlined />}
                          onClick={() => copyText(hint)} style={{ padding: 0 }}>
                          复制配置
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </Badge.Ribbon>
            </Col>
          );
        })}
      </Row>
    </Spin>
  );
};

export default ChannelStatusTab;
