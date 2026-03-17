import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Card, Typography, Badge, Alert, Row, Col, Progress, Descriptions, Statistic } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import systemStatusService from '@/services/systemStatusService';
import type { SystemStatusOverview } from '@/services/systemStatusService';
import { message } from '@/utils/antdStatic';

const { Text } = Typography;

// ========== 系统运维面板 Tab ==========
const SystemStatusTab: React.FC = () => {
  const [overview, setOverview] = useState<SystemStatusOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tenantStats, setTenantStats] = useState<any>(null);
  const [loadingTenantStats, setLoadingTenantStats] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await systemStatusService.overview();
      const d = res?.data || res;
      setOverview(d);
    } catch { message.error('加载系统状态失败'); } finally { setLoading(false); }
  }, []);

  const fetchTenantStats = useCallback(async () => {
    setLoadingTenantStats(true);
    try {
      const res: any = await systemStatusService.tenantUserStats();
      setTenantStats(res?.data || res);
    } catch { /* ignore */ } finally { setLoadingTenantStats(false); }
  }, []);

  useEffect(() => { fetchOverview(); fetchTenantStats(); }, [fetchOverview, fetchTenantStats]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(fetchOverview, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchOverview]);

  const heapPercent = overview?.heapUsedPercent || 0;
  const heapColor = heapPercent >= 90 ? '#ff4d4f' : heapPercent >= 70 ? '#faad14' : '#52c41a';
  const dbUp = overview?.database?.status === 'UP';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Badge status={overview ? 'success' : 'default'} text={overview ? '系统运行中' : '加载中...'} />
          {overview && <Text type="secondary" style={{ fontSize: 12 }}>运行时长：{overview.uptime}</Text>}
        </Space>
        <Space>
          <Button size="small" onClick={() => setAutoRefresh(!autoRefresh)} type={autoRefresh ? 'primary' : 'default'}>
            {autoRefresh ? '自动刷新中(15s)' : '开启自动刷新'}
          </Button>
          <Button size="small" onClick={fetchOverview} loading={loading}>刷新</Button>
        </Space>
      </div>

      {overview && (
        <>
          {/* 核心指标 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="JVM 堆内存" value={overview.heapUsedMb} suffix={`/ ${overview.heapMaxMb > 0 ? overview.heapMaxMb : '∞'} MB`}
                  valueStyle={{ color: heapColor, fontSize: 20 }}
                />
                <Progress percent={heapPercent} size="small" strokeColor={heapColor} showInfo={false} style={{ marginTop: 8 }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="线程数" value={overview.threadCount} suffix={`/ 峰值 ${overview.peakThreadCount}`}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="CPU 负载" value={overview.systemLoadAverage} precision={2}
                  suffix={`/ ${overview.availableProcessors} 核`}
                  valueStyle={{ fontSize: 20, color: overview.systemLoadAverage > overview.availableProcessors ? '#ff4d4f' : undefined }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="数据库"
                  value={dbUp ? '正常' : '异常'}
                  valueStyle={{ color: dbUp ? '#52c41a' : '#ff4d4f', fontSize: 20 }}
                />
                {dbUp && <Text type="secondary" style={{ fontSize: 11 }}>{overview.database.product} {overview.database.version?.split('-')[0]}</Text>}
              </Card>
            </Col>
          </Row>

          {/* 详细信息 */}
          <Card size="small" title="系统详情">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="应用名称">{overview.applicationName}</Descriptions.Item>
              <Descriptions.Item label="Java 版本">{overview.javaVersion}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{overview.osName} ({overview.osArch})</Descriptions.Item>
              <Descriptions.Item label="CPU 核心数">{overview.availableProcessors}</Descriptions.Item>
              <Descriptions.Item label="启动时间">{overview.startTime}</Descriptions.Item>
              <Descriptions.Item label="当前时间">{overview.currentTime}</Descriptions.Item>
              <Descriptions.Item label="堆内存(已用/最大)">{overview.heapUsedMb}MB / {overview.heapMaxMb > 0 ? overview.heapMaxMb + 'MB' : '无限制'}</Descriptions.Item>
              <Descriptions.Item label="非堆内存">{overview.nonHeapUsedMb}MB</Descriptions.Item>
              <Descriptions.Item label="数据库状态">
                <Badge status={dbUp ? 'success' : 'error'} text={dbUp ? '连接正常' : '连接异常'} />
              </Descriptions.Item>
              <Descriptions.Item label="数据库版本">{overview.database?.product} {overview.database?.version?.split('-')[0] || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}

      {!overview && !loading && (
        <Alert type="warning" title="无法获取系统状态" description="请检查后端服务是否正常运行" />
      )}

      {/* 租户人员统计 */}
      <Card size="small"
        title={<span>租户人员统计{tenantStats ? <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>共 {tenantStats.totalTenants} 个租户，{tenantStats.totalUsers} 名用户</Text> : null}</span>}
        style={{ marginTop: 16 }}
        extra={<Button size="small" onClick={fetchTenantStats} loading={loadingTenantStats}>刷新</Button>}
      >
        {tenantStats?.tenants?.length > 0 ? (
          <ResizableTable
            dataSource={tenantStats.tenants}
            rowKey="tenantId"
            size="small"
            pagination={false}
            columns={[
              { title: '租户ID', dataIndex: 'tenantId', width: 80 },
              { title: '租户名称', dataIndex: 'tenantName', ellipsis: true },
              {
                title: '人员数量', dataIndex: 'userCount', width: 120,
                sorter: (a: any, b: any) => a.userCount - b.userCount,
                render: (v: number) => <Text strong style={{ color: v > 0 ? undefined : '#999' }}>{v}</Text>,
              },
            ]}
          />
        ) : (
          <Text type="secondary">暂无租户数据</Text>
        )}
      </Card>
    </div>
  );
};

export default SystemStatusTab;
