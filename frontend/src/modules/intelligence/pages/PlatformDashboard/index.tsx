/**
 * PlatformDashboard — 平台级 AI 数据面板
 *
 * 仅超管可访问（ROLE_SUPER_ADMIN），展示跨租户 AI 决策质量数据：
 *   • 综合摘要：工具命中率、决策采纳率、巡检 MTTR
 *   • 工具表现明细表
 *   • 决策采纳率明细表
 *   • 巡检关闭循环 MTTR 明细表
 *
 * 路由挂载：intelligence/platform-dashboard（通过 routeConfig.ts 注册）
 */
import React, { useState, useCallback } from 'react';
import { Card, Col, Row, Select, Spin, Statistic, Tag, Typography, Alert } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { useUser } from '@/utils/AuthContext';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

const { Title, Text } = Typography;

interface Summary {
  toolCount?: number;
  totalCalls?: number;
  avgSuccessRate?: number;
  avgAdoptionRate?: number;
  avgMttrHours?: number;
  [key: string]: unknown;
}

interface ToolRow {
  toolName?: string;
  total?: number;
  successCount?: number;
  successRate?: number;
  avgScore?: number;
  [key: string]: unknown;
}

interface AdoptionRow {
  scene?: string;
  total?: number;
  adopted_count?: number;
  adoption_rate?: number;
  [key: string]: unknown;
}

interface MttrRow {
  issueType?: string;
  closedCount?: number;
  avgMttrHours?: number;
  maxMttrHours?: number;
  [key: string]: unknown;
}

function safeNum(v: unknown, dec = 1): string {
  const n = Number(v);
  return isNaN(n) ? '-' : n.toFixed(dec);
}

const DAYS_OPTIONS = [7, 14, 30, 60, 90].map(d => ({ label: `近 ${d} 天`, value: d }));

export const PlatformDashboard: React.FC = () => {
  const { user } = useUser();
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary>({});
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [adoptions, setAdoptions] = useState<AdoptionRow[]>([]);
  const [mttrs, setMttrs] = useState<MttrRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>('');

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const [dash, tool, adopt, mttr] = await Promise.all([
        intelligenceApi.platformSuperDashboard(d),
        intelligenceApi.platformToolPerformance(d),
        intelligenceApi.platformDecisionAdoption(d),
        intelligenceApi.platformPatrolMttr(d),
      ]);
      setSummary(dash as Summary);
      setTools(tool as ToolRow[]);
      setAdoptions(adopt as AdoptionRow[]);
      setMttrs(mttr as MttrRow[]);
      setLoaded(true);
    } catch {
      setError('数据加载失败，请确认当前账号具有超管权限');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDaysChange = (v: number) => {
    setDays(v);
    load(v);
  };

  // 未加载时显示 CTA
  React.useEffect(() => { load(days); }, []);

  if (!user?.isSuperAdmin) {
    return <Alert type="error" message="无权限" description="仅平台超级管理员可访问本页面" showIcon />;
  }

  const toolColumns = [
    { title: '工具名', dataIndex: 'toolName', key: 'toolName', width: 200 },
    { title: '调用次数', dataIndex: 'total', key: 'total', width: 100, render: (v: unknown) => safeNum(v, 0) },
    { title: '成功次数', dataIndex: 'successCount', key: 'successCount', width: 100, render: (v: unknown) => safeNum(v, 0) },
    {
      title: '成功率', key: 'successRate', width: 100,
      render: (_: unknown, row: ToolRow) => {
        const total = Number(row.total || 0);
        const succ = Number(row.successCount || 0);
        const rate = total > 0 ? (succ / total * 100) : 0;
        const color = rate >= 80 ? 'green' : rate >= 50 ? 'orange' : 'red';
        return <Tag color={color}>{rate.toFixed(1)}%</Tag>;
      },
    },
    { title: '平均评分', dataIndex: 'avgScore', key: 'avgScore', width: 100, render: (v: unknown) => safeNum(v) },
  ];

  const adoptionColumns = [
    { title: '场景', dataIndex: 'scene', key: 'scene', width: 200 },
    { title: '决策总数', dataIndex: 'total', key: 'total', width: 100, render: (v: unknown) => safeNum(v, 0) },
    { title: '采纳次数', dataIndex: 'adopted_count', key: 'adopted_count', width: 100, render: (v: unknown) => safeNum(v, 0) },
    {
      title: '采纳率', key: 'rate', width: 100,
      render: (_: unknown, row: AdoptionRow) => {
        const total = Number(row.total || 0);
        const adopted = Number(row.adopted_count || 0);
        const rate = total > 0 ? (adopted / total * 100) : 0;
        const color = rate >= 60 ? 'green' : rate >= 30 ? 'orange' : 'red';
        return <Tag color={color}>{rate.toFixed(1)}%</Tag>;
      },
    },
  ];

  const mttrColumns = [
    { title: '问题类型', dataIndex: 'issueType', key: 'issueType', width: 220 },
    { title: '已关闭数', dataIndex: 'closedCount', key: 'closedCount', width: 100, render: (v: unknown) => safeNum(v, 0) },
    { title: '平均 MTTR (h)', dataIndex: 'avgMttrHours', key: 'avgMttrHours', width: 140, render: (v: unknown) => safeNum(v) },
    { title: '最长 MTTR (h)', dataIndex: 'maxMttrHours', key: 'maxMttrHours', width: 140, render: (v: unknown) => safeNum(v) },
  ];

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>🧠 平台级 AI 数据面板</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary">统计周期：</Text>
          <Select
            value={days}
            options={DAYS_OPTIONS}
            onChange={handleDaysChange}
            style={{ width: 120 }}
          />
        </div>
      </div>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable />}

      <Spin spinning={loading}>
        {/* 综合指标卡 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {[
            { title: '接入工具数', value: summary.toolCount, suffix: '个' },
            { title: 'AI 总调用次数', value: summary.totalCalls, suffix: '次' },
            { title: '平均工具成功率', value: summary.avgSuccessRate != null ? `${safeNum(Number(summary.avgSuccessRate) * 100)}%` : '-', rawStr: true },
            { title: '决策平均采纳率', value: summary.avgAdoptionRate != null ? `${safeNum(Number(summary.avgAdoptionRate) * 100)}%` : '-', rawStr: true },
            { title: '平均巡检 MTTR', value: summary.avgMttrHours != null ? `${safeNum(summary.avgMttrHours)} h` : '-', rawStr: true },
          ].map((item, i) => (
            <Col span={4} key={i}>
              <Card>
                {item.rawStr
                  ? <Statistic title={item.title} value={String(item.value ?? '-')} />
                  : <Statistic title={item.title} value={item.value as number ?? 0} suffix={item.suffix} />}
              </Card>
            </Col>
          ))}
        </Row>

        {/* 工具表现 */}
        <Card title="工具表现明细" style={{ marginBottom: 16 }}>
          <ResizableTable<ToolRow>
            storageKey="platform-tool-table"
            dataSource={tools}
            columns={toolColumns}
            rowKey={r => String(r.toolName ?? Math.random())}
           
            pagination={{ pageSize: 15 }}
            scroll={{ x: 600 }}
            locale={{ emptyText: loaded ? '暂无数据' : '加载中…' }}
          />
        </Card>

        {/* 决策采纳率 */}
        <Row gutter={16}>
          <Col span={12}>
            <Card title="决策采纳率（场景维度）">
              <ResizableTable<AdoptionRow>
                storageKey="platform-adoption-table"
                dataSource={adoptions}
                columns={adoptionColumns}
                rowKey={r => String(r.scene ?? Math.random())}
               
                pagination={{ pageSize: 10 }}
                scroll={{ x: 500 }}
                locale={{ emptyText: loaded ? '暂无数据' : '加载中…' }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="巡检关闭循环 MTTR">
              <ResizableTable<MttrRow>
                storageKey="platform-mttr-table"
                dataSource={mttrs}
                columns={mttrColumns}
                rowKey={r => String(r.issueType ?? Math.random())}
               
                pagination={{ pageSize: 10 }}
                scroll={{ x: 600 }}
                locale={{ emptyText: loaded ? '暂无数据' : '加载中…' }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default PlatformDashboard;
