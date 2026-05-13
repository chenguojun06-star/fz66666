import React, { useState, useEffect, useCallback } from 'react';
import { Card, Statistic, Row, Col, Typography, Tag, Button, Empty, Timeline } from 'antd';
import { ApiOutlined, CheckCircleOutlined, SwapOutlined, LinkOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import tenantAppService from '@/services/tenantAppService';
import type { TenantAppLogInfo, IntegrationOverview, IntegrationModuleInfo } from '@/services/tenantAppService';
import { message } from '@/utils/antdStatic';
import { MODULE_ICONS, getFlowDescription, getApiEndpoints } from '../constants';

const { Text } = Typography;

const IntegrationOverviewTab: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<IntegrationOverview | null>(null);
  const [allLogs, setAllLogs] = useState<TenantAppLogInfo[]>([]);
  const [_loading, setLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantAppService.getIntegrationOverview();
      const data = res?.data || res;
      setOverview(data);
      setAllLogs(data?.recentLogs || []);
    } catch {
      message.error('加载集成总览失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card style={{ borderLeft: '3px solid var(--color-primary)' }}>
            <Statistic title="已配置应用" value={overview?.totalApps || 0} suffix="个" prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderLeft: '3px solid var(--color-success)' }}>
            <Statistic title="运行中" value={overview?.activeApps || 0} suffix="个" styles={{ content: { color: 'var(--color-success)' } }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderLeft: '3px solid var(--color-info)' }}>
            <Statistic title="总API调用" value={overview?.totalCalls || 0} suffix="次" prefix={<SwapOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderLeft: '3px solid var(--color-warning)' }}>
            <Statistic
              title="已对接模块"
              value={overview?.modules?.filter(m => m.connected).length || 0}
              suffix={`/ ${overview?.modules?.length || 4}`}
              prefix={<LinkOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}> 对接模块状态</div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {(overview?.modules || []).map((mod: IntegrationModuleInfo) => {
          const cfg = MODULE_ICONS[mod.appType] || { icon: '', color: 'var(--color-text-tertiary)', bgColor: 'var(--color-bg-subtle)' };
          return (
            <Col span={6} key={mod.appType}>
              <Card
               
                hoverable
                style={{
                  borderTop: `3px solid ${cfg.color}`,
                  background: mod.connected ? '#fff' : '#fafafa',
                  minHeight: 220,
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 32, marginBottom: 4 }}>{cfg.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{mod.appTypeName}</div>
                  <Tag color={mod.connected ? 'success' : 'default'} style={{ marginTop: 4 }}>
                    {mod.connected ? ' 已对接' : '未对接'}
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  <div>活跃应用: <strong>{mod.activeApps}</strong> 个</div>
                  <div>累计调用: <strong>{(mod.totalCalls || 0).toLocaleString()}</strong> 次</div>
                  {mod.lastCallTime && <div>最后调用: {mod.lastCallTime}</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  {getFlowDescription(mod.appType)}
                </div>
                <Button
                  type="link"
                 
                  icon={<EyeOutlined />}
                  onClick={() => navigate(mod.viewPath)}
                  style={{ padding: 0, fontSize: 12 }}
                >
                  查看数据：{mod.viewPage}
                </Button>
              </Card>
            </Col>
          );
        })}
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Card title=" API 端点速查" style={{ minHeight: 360 }}>
            {(overview?.modules || []).map((mod: IntegrationModuleInfo) => {
              const cfg = MODULE_ICONS[mod.appType] || { icon: '', color: 'var(--color-text-tertiary)', bgColor: 'var(--color-bg-subtle)' };
              const endpoints = getApiEndpoints(mod.appType);
              return (
                <div key={mod.appType} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: cfg.color }}>
                    {cfg.icon} {mod.appTypeName}
                  </div>
                  {endpoints.map((ep, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 12 }}>
                      {ep.method !== '-' ? (
                        <Tag color="blue" style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>{ep.method}</Tag>
                      ) : (
                        <Tag color="green" style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>PUSH</Tag>
                      )}
                      <Text code style={{ fontSize: 11 }}>{ep.path}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{ep.desc}</Text>
                    </div>
                  ))}
                </div>
              );
            })}
          </Card>
        </Col>
        <Col span={12}>
          <Card
           
            title=" 最近 API 调用"
            style={{ minHeight: 360 }}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>最新10条</Text>}
          >
            {allLogs.length === 0 ? (
              <Empty description="暂无调用记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Timeline
                items={allLogs.map((log, idx) => ({
                  key: idx,
                  color: log.result === 'SUCCESS' ? 'green' : 'red',
                  children: (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag color={log.direction === 'INBOUND' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                          {log.direction === 'INBOUND' ? '入站' : '出站'}
                        </Tag>
                        <Tag style={{ fontSize: 10 }}>{log.httpMethod}</Tag>
                        <Text code style={{ fontSize: 10 }}>{log.requestPath}</Text>
                        <Tag color={log.result === 'SUCCESS' ? 'green' : 'red'} style={{ fontSize: 10 }}>
                          {log.responseCode} {log.costMs}ms
                        </Tag>
                      </div>
                      <Text type="secondary" style={{ fontSize: 11 }}>{log.createTime}</Text>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default IntegrationOverviewTab;
