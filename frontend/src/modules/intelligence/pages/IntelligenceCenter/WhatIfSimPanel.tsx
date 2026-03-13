/**
 * WhatIf 推演仿真面板
 * 用户选择行进中订单 + 设置场景参数，AI 推演多个情景并给出最优方案
 * 驾驶舱专用，对所有租户用户可见
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ExperimentOutlined, ReloadOutlined, StarFilled } from '@ant-design/icons';
import { simulateWhatIf, type WhatIfResult, type WhatIfParams, type ScenarioResult } from '@/services/intelligenceApi';
import api from '@/utils/api';

const { Text } = Typography;

interface OrderOption { id: number; label: string; }

const WhatIfSimPanel: React.FC = () => {
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [extraWorkers, setExtraWorkers] = useState(5);
  const [overtimeHours, setOvertimeHours] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState('');

  // 拉取活跃订单列表
  useEffect(() => {
    api.post<any>('/production/orders/list', { filters: { status: 'IN_PROGRESS' }, pageSize: 50 })
      .then(res => {
        const rows = res?.data?.records ?? res?.data?.data?.records ?? [];
        setOrders(rows.map((o: any) => ({ id: o.id, label: `${o.orderNo ?? o.id} · ${o.customerName ?? ''}` })));
      })
      .catch(() => {/* 拉取失败静默 */});
  }, []);

  const handleSimulate = useCallback(async () => {
    if (selectedOrderIds.length === 0) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const params: WhatIfParams = {
        orderIds: selectedOrderIds,
        scenarios: [
          {
            scenarioKey: 'baseline',
            description: '当前方案（不变）',
            tweaks: {},
          },
          {
            scenarioKey: 'extra_workers',
            description: `增加 ${extraWorkers} 名工人`,
            tweaks: { workerDelta: extraWorkers },
          },
          {
            scenarioKey: 'overtime',
            description: `每日加班 ${overtimeHours} 小时`,
            tweaks: { overtimeHoursPerDay: overtimeHours },
          },
          {
            scenarioKey: 'workers_plus_overtime',
            description: `增员${extraWorkers}人 + 加班${overtimeHours}h`,
            tweaks: { workerDelta: extraWorkers, overtimeHoursPerDay: overtimeHours },
          },
        ],
      };
      const res = await simulateWhatIf(params);
      setResult(res);
    } catch {
      setError('推演仿真请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [selectedOrderIds, extraWorkers, overtimeHours]);

  const columns = [
    {
      title: '方案',
      dataIndex: 'description',
      render: (text: string, row: ScenarioResult) => (
        <Space>
          {row.scenarioKey === result?.recommendedScenario && (
            <Tooltip title="AI 推荐方案">
              <StarFilled style={{ color: '#fbbf24', fontSize: 12 }} />
            </Tooltip>
          )}
          <Text style={{ color: row.scenarioKey === result?.recommendedScenario ? '#fbbf24' : '#e2e8f0', fontSize: 12 }}>
            {text}
          </Text>
        </Space>
      ),
    },
    {
      title: '完工提前/推迟',
      dataIndex: 'finishDateDeltaDays',
      align: 'center' as const,
      render: (v: number) => (
        <Tag color={v < 0 ? 'green' : v === 0 ? 'default' : 'red'}>
          {v === 0 ? '持平' : `${v > 0 ? '+' : ''}${v} 天`}
        </Tag>
      ),
    },
    {
      title: '成本变化',
      dataIndex: 'costDelta',
      align: 'center' as const,
      render: (v: number) => (
        <Text style={{ color: v > 0 ? '#ef4444' : '#10b981', fontSize: 12 }}>
          {v > 0 ? `+¥${v.toLocaleString()}` : v === 0 ? '持平' : `-¥${Math.abs(v).toLocaleString()}`}
        </Text>
      ),
    },
    {
      title: '逾期风险',
      dataIndex: 'overdueRiskDelta',
      align: 'center' as const,
      render: (v: number) => (
        <Tag color={v < 0 ? 'green' : v === 0 ? 'default' : 'orange'}>
          {v === 0 ? '不变' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`}
        </Tag>
      ),
    },
    {
      title: '综合分',
      dataIndex: 'score',
      align: 'center' as const,
      render: (v: number, row: ScenarioResult) => (
        <Text style={{ color: row.scenarioKey === result?.recommendedScenario ? '#fbbf24' : '#94a3b8', fontWeight: 700 }}>
          {v}
        </Text>
      ),
    },
    { title: '建议行动', dataIndex: 'action', render: (v: string) => <Text style={{ color: '#94a3b8', fontSize: 11 }}>{v}</Text> },
  ];

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 参数控制行 */}
      <Row gutter={12} align="middle" style={{ marginBottom: 12 }}>
        <Col span={10}>
          <Select
            mode="multiple"
            placeholder="选择订单（可多选，最多5个）"
            style={{ width: '100%' }}
            size="small"
            value={selectedOrderIds}
            onChange={v => setSelectedOrderIds(v.slice(0, 5))}
            options={orders.map(o => ({ value: o.id, label: o.label }))}
            maxTagCount={2}
          />
        </Col>
        <Col>
          <Space size={4}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>加人</Text>
            <InputNumber
              min={1} max={50} value={extraWorkers}
              onChange={v => setExtraWorkers(v ?? 5)}
              size="small" style={{ width: 64 }}
            />
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>人</Text>
          </Space>
        </Col>
        <Col>
          <Space size={4}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>加班</Text>
            <InputNumber
              min={0.5} max={6} step={0.5} value={overtimeHours}
              onChange={v => setOvertimeHours(v ?? 2)}
              size="small" style={{ width: 64 }}
            />
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>h/天</Text>
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            size="small"
            icon={loading ? undefined : <ExperimentOutlined />}
            loading={loading}
            onClick={handleSimulate}
            disabled={selectedOrderIds.length === 0}
            style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
          >
            开始推演
          </Button>
        </Col>
        {result && (
          <Col>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => setResult(null)} style={{ color: '#475569' }} />
          </Col>
        )}
      </Row>

      {/* 加载中 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin />
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>AI 推演多情景中，请稍候…</div>
        </div>
      )}

      {/* 错误 */}
      {error && <Alert message={error} type="error" showIcon banner style={{ marginBottom: 8 }} />}

      {/* 结果表格 */}
      {result && !loading && (
        <>
          {/* AI 总结 */}
          {result.summary && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(124,58,237,0.1)', borderRadius: 6, border: '1px solid rgba(124,58,237,0.25)' }}>
              <Text style={{ color: '#c4b5fd', fontSize: 12 }}>🤖 {result.summary}</Text>
            </div>
          )}
          <Table
            dataSource={[result.baseline, ...result.scenarios]}
            columns={columns}
            rowKey="scenarioKey"
            size="small"
            pagination={false}
            rowClassName={(row) => row.scenarioKey === result.recommendedScenario ? 'whatif-recommended-row' : ''}
            style={{ background: 'transparent' }}
          />
        </>
      )}

      {/* 空状态提示 */}
      {!loading && !result && !error && (
        <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
          选择订单 → 设置参数 → 点「开始推演」，AI 将对比多个调度方案
        </div>
      )}

      <style>{`
        .whatif-recommended-row td { background: rgba(251,191,36,0.06) !important; }
      `}</style>
    </div>
  );
};

export default WhatIfSimPanel;
