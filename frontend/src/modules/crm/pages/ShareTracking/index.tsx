import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Spin, Result, Typography, Descriptions, Steps, Tag, Row, Col } from 'antd';
import { ShareAltOutlined } from '@ant-design/icons';
import axios from 'axios';
import './styles.css';

const { Title, Text } = Typography;

export default function ShareTracking() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setError('无效的追踪链接');
      setLoading(false);
      return;
    }
    // Share page is a public API, use bare axios without auth header
    axios.get(`/api/public/portal/order-status?token=${encodeURIComponent(token)}`)
      .then(res => {
        const d = res.data;
        if (d && d.code === 200) {
          setData(d.data);
        } else {
          setError(d.message || '获取订单状态失败');
        }
      })
      .catch(_err => {
        setError('网络异常，请稍后重试');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="share-tracking-loading">
        <Spin size="large" spinning tip="正在加载订单进度..."><div /></Spin>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Result
        status="error"
        title="无法查看进度"
        subTitle={error}
      />
    );
  }

  const order = data.order || {};
  const progressNodes = data.progressNodes || [];

  return (
    <div className="share-tracking-container">
      <Card title={<><ShareAltOutlined /> 客户专属追踪视图 - 订单进度</>} bordered={false} className="share-tracking-card">
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="订单编号">{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label="款式编号">{order.styleNo}</Descriptions.Item>
              <Descriptions.Item label="数量">{order.orderQuantity} 件</Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color="blue">{order.status === 'IN_PROGRESS' ? '生产中' : order.status === 'COMPLETED' ? '已完成' : order.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>

        <div style={{ marginTop: 24 }}>
          <Title level={5}>生产阶段</Title>
          {progressNodes.length > 0 ? (
             <Steps direction="vertical" current={progressNodes.findIndex((n: any) => !n.completed)} items={progressNodes.map((node: any, index: number) => ({ key: index, title: node.name, description: `已完成 ${node.completedQuantity || 0} 件`, status: node.completed ? "finish" : (node.completedQuantity > 0 ? "process" : "wait") }))} />
          ) : (
            <Text type="secondary">暂无生产进度数据</Text>
          )}
        </div>
      </Card>
    </div>
  );
}
