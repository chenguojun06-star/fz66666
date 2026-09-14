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
      <Row gutter={16} className="u-mb-24">
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
      <div className="u-fw-600 u-fs-15 u-mb-12"> 对接模块状态</div>
      <Row gutter={16} className="u-mb-24">
        {(overview?.modules || []).map((mod: IntegrationModuleInfo) => {
          const cfg = MODULE_ICONS[mod.appType] || { icon: '', color: 'var(--color-text-tertiary)', bgColor: 'var(--color-bg-subtle)' };
          return (
            <Col span={6} key={mod.appType}>
              <Card
               
                hoverable
                style={{
                  borderTop: `3px solid ${cfg.color}`,
                  background: mod.connected ? 'var(--color-bg-base)' : 'var(--color-bg-container)',
                  minHeight: 220,
                }}
              >
                <div className="u-ta-center u-mb-12">
                  <div className="u-mb-4" style={{ fontSize: 32 }}>{cfg.icon}</div>
                  <div className="u-fw-600 u-fs-15">{mod.appTypeName}</div>
                  <Tag color={mod.connected ? 'success' : 'default'} className="u-mt-4">
                    {mod.connected ? ' 已对接' : '未对接'}
                  </Tag>
                </div>
                <div className="u-fs-14 u-mb-12" style={{ color: 'var(--color-text-secondary)' }}>
                  <div>活跃应用: <strong>{mod.activeApps}</strong> 个</div>
                  <div>累计调用: <strong>{(mod.totalCalls || 0).toLocaleString()}</strong> 次</div>
                  {mod.lastCallTime && <div>最后调用: {mod.lastCallTime}</div>}
                </div>
                <div className="u-fs-14 u-mb-12" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
                  {getFlowDescription(mod.appType)}
                </div>
                <Button
                  type="link"
                 
                  icon={<EyeOutlined />}
                  onClick={() => navigate(mod.viewPath)}
                  className="u-p-0 u-fs-14"
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
                <div key={mod.appType} className="u-mb-16">
                  <div style={{ fontWeight: 600, marginBottom: 4, color: cfg.color }}>
                    {cfg.icon} {mod.appTypeName}
                  </div>
                  {endpoints.map((ep, idx) => (
                    <div key={idx} className="u-d-flex u-gap-8 u-fs-14" style={{ padding: '2px 0' }}>
                      {ep.method !== '-' ? (
                        <Tag color="blue" className="u-fs-14 u-ta-center" style={{ minWidth: 44 }}>{ep.method}</Tag>
                      ) : (
                        <Tag color="green" className="u-fs-14 u-ta-center" style={{ minWidth: 44 }}>PUSH</Tag>
                      )}
                      <Text code className="u-fs-14">{ep.path}</Text>
                      <Text type="secondary" className="u-fs-14">{ep.desc}</Text>
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
            extra={<Text type="secondary" className="u-fs-14">最新10条</Text>}
          >
            {allLogs.length === 0 ? (
              <Empty description="暂无调用记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Timeline
                items={allLogs.map((log, idx) => ({
                  key: idx,
                  color: log.result === 'SUCCESS' ? 'green' : 'red',
                  content: (
                    <div className="u-fs-14">
                      <div className="u-d-flex u-gap-6 u-ai-center u-fwrap-wrap">
                        <Tag color={log.direction === 'INBOUND' ? 'blue' : 'green'} className="u-fs-14">
                          {log.direction === 'INBOUND' ? '入站' : '出站'}
                        </Tag>
                        <Tag className="u-fs-14">{log.httpMethod}</Tag>
                        <Text code className="u-fs-14">{log.requestPath}</Text>
                        <Tag color={log.result === 'SUCCESS' ? 'green' : 'red'} className="u-fs-14">
                          {log.responseCode} {log.costMs}ms
                        </Tag>
                      </div>
                      <Text type="secondary" className="u-fs-14">{log.createTime}</Text>
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
