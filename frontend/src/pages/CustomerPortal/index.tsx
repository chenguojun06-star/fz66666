import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Card, Col, Descriptions, Progress, Row, Space, Spin, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { getOrderStatusByToken } from '@/services/crm/customerApi';

const { Title, Text } = Typography;

interface OrderStatus {
  orderNo: string;
  styleName: string;
  orderQuantity: number;
  completedQuantity: number;
  productionProgress: number;
  status: string;
  expectedDeliveryDate?: string;
  expireTime?: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING:     { label: '待生产', color: 'default' },
  IN_PROGRESS: { label: '生产中', color: 'processing' },
  COMPLETED:   { label: '已完成', color: 'success' },
  CANCELLED:   { label: '已取消', color: 'error' },
};

const ProgressIcon: React.FC<{ percent: number }> = ({ percent }) => {
  if (percent >= 100) return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
  if (percent >= 50)  return <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />;
  return <ClockCircleOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
};

const CustomerPortal: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<'invalid' | 'expired' | 'unknown' | null>(null);

  useEffect(() => {
    if (!token) {
      setError('invalid');
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await getOrderStatusByToken(token);
        const data = (res as any)?.data ?? res;
        if (!data || !data.orderNo) {
          setError('invalid');
          return;
        }
        setOrder(data);
      } catch (e: any) {
        const statusCode = e?.response?.status ?? e?.status;
        if (statusCode === 404 || statusCode === 401) {
          setError('expired');
        } else {
          setError('unknown');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <Spin size="large" spinning tip="正在查询订单进度..."><div /></Spin>
      </div>
    );
  }

  const Header = () => (
    <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '24px 32px', color: '#fff' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
          生产进度查询门户
        </Text>
        <Title level={4} style={{ color: '#fff', margin: '4px 0 0' }}>
          订单实时追踪
        </Title>
      </div>
    </div>
  );

  if (error) {
    const msg = error === 'invalid'
      ? '链接无效：未找到有效的追踪令牌，请检查链接是否完整。'
      : error === 'expired'
      ? '链接已过期：此追踪链接已失效或超过有效期，请向工厂申请新链接。'
      : '查询失败：服务暂时不可用，请稍后重试。';

    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header />
        <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
          <Alert
            type={error === 'unknown' ? 'warning' : 'error'}
            showIcon
            icon={<WarningOutlined />}
            title={error === 'expired' ? '链接已过期' : error === 'invalid' ? '链接无效' : '查询失败'}
            description={msg}
          />
        </div>
      </div>
    );
  }

  if (!order) return null;

  const statusCfg = STATUS_LABEL[order.status] ?? { label: order.status, color: 'default' };
  const percent = Math.min(100, Number(order.productionProgress) || 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
        {/* 进度卡片 */}
        <Card
          style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 16 }}
          styles={{ body: { padding: '24px 28px' } }}
        >
          <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
            <Col>
              <Text type="secondary" style={{ fontSize: 12 }}>订单编号</Text>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{order.orderNo}</div>
            </Col>
            <Col>
              <Tag color={statusCfg.color} style={{ fontSize: 14, padding: '4px 12px', borderRadius: 20 }}>
                {statusCfg.label}
              </Tag>
            </Col>
          </Row>

          <div style={{ marginBottom: 20 }}>
            <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
              <Col>
                <Space size={6}>
                  <ProgressIcon percent={percent} />
                  <Text style={{ fontSize: 15, fontWeight: 600 }}>
                    生产进度 {percent}%
                  </Text>
                </Space>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {order.completedQuantity} / {order.orderQuantity} 件
                </Text>
              </Col>
            </Row>
            <Progress
              percent={percent}
              strokeColor={
                percent >= 100
                  ? '#52c41a'
                  : { from: '#667eea', to: '#764ba2' }
              }
              trailColor="#f0f0f0"
              strokeWidth={10}
            />
          </div>

          <Descriptions column={1} size="small">
            <Descriptions.Item label="款式名称">
              <Text strong>{order.styleName || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="订单数量">
              <Text>{order.orderQuantity} 件</Text>
            </Descriptions.Item>
            <Descriptions.Item label="已完成数量">
              <Text>{order.completedQuantity} 件</Text>
            </Descriptions.Item>
            {order.expectedDeliveryDate && (
              <Descriptions.Item label="预计交期">
                <Text>{order.expectedDeliveryDate}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* 底部说明 */}
        <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 12, lineHeight: 2 }}>
          <div>此页面为安全只读视图，不含商业机密信息</div>
          {order.expireTime && (
            <div>链接有效期至 {order.expireTime?.substring(0, 10)}</div>
          )}
          <div style={{ marginTop: 8 }}>Powered by 服装供应链管理系统</div>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortal;
