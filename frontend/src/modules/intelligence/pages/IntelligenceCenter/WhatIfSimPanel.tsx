/**
 * WhatIf 推演仿真面板
 * 改为按款号聚合选择，避免一堆生产单号造成噪音。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { factoryApi, type Factory } from '@/services/system/factoryApi';
import api from '@/utils/api';

const { Text } = Typography;

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'scrapped', 'closed']);

interface OrderOption {
  id: string;
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  factoryName?: string;
  orderQuantity?: number;
  plannedEndDate?: string;
  status?: string;
}

interface StyleOption {
  key: string;
  styleNo: string;
  styleName?: string;
  label: string;
  orderIds: string[];
  orderCount: number;
  totalQuantity: number;
  factoryNames: string[];
}

const WhatIfSimPanel: React.FC = () => {
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedStyleKeys, setSelectedStyleKeys] = useState<string[]>([]);
  const [extraWorkers, setExtraWorkers] = useState(5);
  const [costReducePct, setCostReducePct] = useState(8);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoriesLoading, setFactoriesLoading] = useState(false);
  const [targetFactoryId, setTargetFactoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await api.post<any>('/production/order/list', {
        page: 1,
        pageSize: 200,
        excludeTerminal: 'true',
      });
      const rows = Array.isArray(res?.data?.records) ? res.data.records : [];
      const activeRows = rows.filter((row: any) => !TERMINAL_STATUSES.has(String(row?.status || '').trim().toLowerCase()));
      setOrders(
        activeRows
          .map((row: any) => ({
            id: String(row?.id || row?.orderNo || '').trim(),
            orderNo: String(row?.orderNo || row?.id || '').trim(),
            styleNo: String(row?.styleNo || '').trim() || undefined,
            styleName: String(row?.styleName || '').trim() || undefined,
            factoryName: String(row?.factoryName || '').trim() || undefined,
            orderQuantity: Number(row?.orderQuantity || row?.cuttingQuantity || 0) || 0,
            plannedEndDate: String(row?.plannedEndDate || '').trim() || undefined,
            status: String(row?.status || '').trim() || undefined,
          }))
          .filter((row: OrderOption) => Boolean(row.id) && Boolean(row.orderNo))
      );
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const loadFactories = async () => {
      setFactoriesLoading(true);
      try {
        const res = await factoryApi.list({ page: 1, pageSize: 200, status: 'active' });
        const records = Array.isArray(res?.data?.records) ? res.data.records : [];
        setFactories(records.filter((item) => String(item?.factoryName || '').trim()));
      } catch {
        setFactories([]);
      } finally {
        setFactoriesLoading(false);
      }
    };
    loadFactories();
  }, []);

  const styleOptions = useMemo<StyleOption[]>(() => {
    const grouped = new Map<string, StyleOption>();
    orders.forEach((order) => {
      const styleNo = String(order.styleNo || '').trim();
      const styleName = String(order.styleName || '').trim();
      const groupKey = styleNo || styleName || order.orderNo;
      if (!groupKey) return;
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.orderIds.push(order.id);
        existing.orderCount += 1;
        existing.totalQuantity += Number(order.orderQuantity || 0) || 0;
        if (order.factoryName && !existing.factoryNames.includes(order.factoryName)) {
          existing.factoryNames.push(order.factoryName);
        }
        return;
      }
      grouped.set(groupKey, {
        key: groupKey,
        styleNo: styleNo || groupKey,
        styleName: styleName || undefined,
        label: '',
        orderIds: [order.id],
        orderCount: 1,
        totalQuantity: Number(order.orderQuantity || 0) || 0,
        factoryNames: order.factoryName ? [order.factoryName] : [],
      });
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        label: [
          item.styleNo,
          item.styleName,
          `${item.totalQuantity.toLocaleString()}件`,
          item.factoryNames.join(' / '),
        ].filter(Boolean).join(' · '),
      }))
      .sort((left, right) => right.totalQuantity - left.totalQuantity);
  }, [orders]);

  const selectedStyles = useMemo(
    () => styleOptions.filter((item) => selectedStyleKeys.includes(item.key)),
    [selectedStyleKeys, styleOptions]
  );
  const selectedOrderIds = useMemo(
    () => Array.from(new Set(selectedStyles.flatMap((item) => item.orderIds))),
    [selectedStyles]
  );
  const totalSelectedQuantity = selectedStyles.reduce((sum, item) => sum + item.totalQuantity, 0);
  const targetFactory = factories.find((factory) => String(factory.id || '').trim() === targetFactoryId);
  const scenarioRows = result && Array.isArray(result.scenarios) ? result.scenarios : [];
  const controlBarBg = 'rgba(28, 51, 73, 0.52)';

  const handleSimulate = useCallback(async () => {
    if (selectedOrderIds.length === 0) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const params: WhatIfParams = {
        orderIds: selectedOrderIds.join(','),
        scenarios: [
          { type: 'ADD_WORKERS', value: extraWorkers },
          { type: 'COST_REDUCE', value: costReducePct },
          {
            type: 'CHANGE_FACTORY',
            value: 1,
            factoryId: targetFactoryId || undefined,
            ...(targetFactory?.factoryName ? { factoryName: targetFactory.factoryName } : {}),
          },
          { type: 'DELAY_START', value: 2 },
        ],
      };
      const response = await simulateWhatIf(params);
      setResult(response);
    } catch {
      setError('推演仿真请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [selectedOrderIds, extraWorkers, costReducePct, targetFactoryId, targetFactory]);

  const columns = [
    {
      title: '方案',
      dataIndex: 'description',
      render: (text: string, row: ScenarioResult) => (
        <Space>
          {row.scenarioKey === result?.recommendedScenario ? (
            <Tooltip title="AI 推荐方案">
              <StarFilled style={{ color: '#fbbf24', fontSize: 12 }} />
            </Tooltip>
          ) : null}
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
      render: (value: number) => (
        <Tag color={value < 0 ? 'green' : value === 0 ? 'default' : 'red'}>
          {value === 0 ? '持平' : `${value > 0 ? '+' : ''}${value} 天`}
        </Tag>
      ),
    },
    {
      title: '成本变化',
      dataIndex: 'costDelta',
      align: 'center' as const,
      render: (value: number) => (
        <Text style={{ color: value > 0 ? '#ef4444' : '#10b981', fontSize: 12 }}>
          {value > 0 ? `+¥${value.toLocaleString()}` : value === 0 ? '持平' : `-¥${Math.abs(value).toLocaleString()}`}
        </Text>
      ),
    },
    {
      title: '逾期风险',
      dataIndex: 'overdueRiskDelta',
      align: 'center' as const,
      render: (value: number) => (
        <Tag color={value < 0 ? 'green' : value === 0 ? 'default' : 'orange'}>
          {value === 0 ? '不变' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
        </Tag>
      ),
    },
    {
      title: '综合分',
      dataIndex: 'score',
      align: 'center' as const,
      render: (value: number, row: ScenarioResult) => (
        <Text style={{ color: row.scenarioKey === result?.recommendedScenario ? '#fbbf24' : '#94a3b8', fontWeight: 700 }}>
          {value}
        </Text>
      ),
    },
    {
      title: '建议行动',
      dataIndex: 'action',
      render: (value: string) => <Text style={{ color: '#94a3b8', fontSize: 11 }}>{value}</Text>,
    },
    {
      title: '推演依据',
      dataIndex: 'rationale',
      render: (_: string, row: ScenarioResult) => (
        <div style={{ color: '#7f90a7', fontSize: 11, lineHeight: 1.55 }}>
          <div>{row.rationale || '基于当前订单批次负载与交期压力估算。'}</div>
          {row.targetFactoryName ? <div style={{ color: '#8fb8d8', marginTop: 2 }}>目标工厂：{row.targetFactoryName}</div> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="whatif-dark-panel" style={{ padding: '4px 0' }}>
      <Alert
        type="info"
        showIcon
        banner
        style={{
          marginBottom: 10,
          background: 'rgba(28, 51, 73, 0.52)',
          border: '1px solid rgba(56, 189, 248, 0.18)',
          color: '#cbd5e1',
        }}
        title="当前版本已接通真实订单与工厂数据，推演口径会参考剩余件数、当前进度、交期压力、工厂负载。它属于轻量决策推演，不是工序级数字孪生排产。"
      />

      <div
        style={{
          marginBottom: 12,
          padding: '8px 10px',
          background: controlBarBg,
          border: '1px solid rgba(56, 189, 248, 0.12)',
          borderRadius: 8,
        }}
      >
      <Row gutter={12} align="middle">
        <Col span={10}>
          <Select
            mode="multiple"
            placeholder="选择款号"
            variant="borderless"
            style={{ width: '100%', color: '#e2e8f0' }}
            size="small"
            showSearch
            loading={ordersLoading}
            value={selectedStyleKeys}
            onChange={(values) => setSelectedStyleKeys(values.slice(0, 3))}
            options={styleOptions.map((item) => ({ value: item.key, label: item.label }))}
            maxTagCount={2}
            optionFilterProp="label"
            notFoundContent={<div style={{ padding: '20px 0', color: '#6b7a90', textAlign: 'center' }}>暂无可推演的活跃款号</div>}
            classNames={{ popup: { root: 'whatif-select-popup' } }}
            popupStyle={{ background: '#162033', border: '1px solid #2f425c', borderRadius: 8 }}
            className="whatif-style-select"
          />
        </Col>
        <Col>
          <Space size={4}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>数量</Text>
            <InputNumber
              value={totalSelectedQuantity}
              readOnly
              controls={false}
              size="small"
              variant="borderless"
              formatter={(value) => `${Number(value || 0).toLocaleString()}`}
              parser={(value) => Number(String(value || '').replace(/,/g, ''))}
              style={{ width: 92, color: '#e2e8f0' }}
            />
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>件</Text>
          </Space>
        </Col>
        <Col>
          <Space size={4}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>加人</Text>
            <InputNumber
              min={1}
              max={50}
              value={extraWorkers}
              onChange={(value) => setExtraWorkers(value ?? 5)}
              size="small"
              variant="borderless"
              style={{ width: 64, color: '#e2e8f0' }}
            />
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>人</Text>
          </Space>
        </Col>
        <Col>
          <Space size={4}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>降本</Text>
            <InputNumber
              min={1}
              max={30}
              step={1}
              value={costReducePct}
              onChange={(value) => setCostReducePct(value ?? 8)}
              size="small"
              variant="borderless"
              style={{ width: 64, color: '#e2e8f0' }}
            />
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>%</Text>
          </Space>
        </Col>
        <Col flex="260px">
          <Select
            allowClear
            showSearch
            size="small"
            variant="borderless"
            loading={factoriesLoading}
            value={targetFactoryId || undefined}
            onChange={(value) => setTargetFactoryId(String(value || ''))}
            placeholder="转厂推演目标工厂"
            optionFilterProp="label"
            style={{ width: '100%', color: '#e2e8f0' }}
            className="whatif-style-select"
            options={factories.map((factory) => ({
              value: String(factory.id || '').trim(),
              label: `${factory.factoryName}${factory.factoryType ? ` · ${factory.factoryType}` : ''}`,
            }))}
          />
        </Col>
        <Col>
          <Button
            type="primary"
            size="small"
            icon={loading ? undefined : <ExperimentOutlined />}
            loading={loading}
            onClick={handleSimulate}
            disabled={selectedStyleKeys.length === 0}
            style={{ background: '#1d4f63', borderColor: '#27677f', color: '#d9edf7', boxShadow: 'none' }}
          >
            开始推演
          </Button>
        </Col>
        <Col>
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={loadOrders} style={{ color: '#6b7a90' }}>
            刷新款号
          </Button>
        </Col>
      </Row>
      </div>

      {selectedStyles.length > 0 ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(71, 85, 105, 0.45)', borderRadius: 8 }}>
          <Text style={{ color: '#9fb0c8', fontSize: 12 }}>
            本次推演已关联 {selectedStyles.length} 个款号，共 {totalSelectedQuantity.toLocaleString()} 件{targetFactory?.factoryName ? `；转厂场景目标工厂：${targetFactory.factoryName}` : ''}：
            {selectedStyles.map((item) => {
              const meta = [item.styleName, `${item.totalQuantity.toLocaleString()}件`, item.factoryNames.join(' / ')];
              return ` ${item.styleNo}${meta.filter(Boolean).length ? `（${meta.filter(Boolean).join(' / ')}）` : ''}`;
            }).join('；')}
          </Text>
        </div>
      ) : null}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin />
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>AI 推演多情景中，请稍候…</div>
        </div>
      ) : null}

      {error ? <Alert title={error} type="error" showIcon banner style={{ marginBottom: 8 }} /> : null}

      {result && !loading ? (
        <>
          {result.summary ? (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(124,58,237,0.1)', borderRadius: 6, border: '1px solid rgba(124,58,237,0.25)' }}>
              <Text style={{ color: '#c4b5fd', fontSize: 12 }}>🤖 {result.summary}</Text>
            </div>
          ) : null}
          {result.baseline ? (
            <Table
              dataSource={[result.baseline, ...scenarioRows]}
              columns={columns}
              rowKey="scenarioKey"
              size="small"
              pagination={false}
              rowClassName={(row) => row.scenarioKey === result.recommendedScenario ? 'whatif-recommended-row' : ''}
              style={{ background: 'transparent' }}
            />
          ) : null}
        </>
      ) : null}

      {!loading && !result && !error ? (
        <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
          选择款号 → 设置参数 → 点“开始推演”，AI 将对比多个调度方案
        </div>
      ) : null}

      <style>{`
        .whatif-recommended-row td { background: rgba(251,191,36,0.06) !important; }

        /* ── 文字颜色（borderless 变体已无边框，CSS只需管颜色）── */
        .whatif-dark-panel .ant-select-selection-placeholder { color: #6b7a90 !important; }

        .whatif-dark-panel .ant-select-selection-item { color: #e2e8f0 !important; }

        .whatif-dark-panel .ant-select-selection-search-input,
        .whatif-dark-panel input.ant-select-selection-search-input {
          color: #e2e8f0 !important;
          -webkit-text-fill-color: #e2e8f0 !important;
        }

        /* 多选 tag */
        .whatif-dark-panel .ant-select-multiple .ant-select-selection-item {
          background: rgba(29, 79, 99, 0.42) !important;
          border: 1px solid rgba(78, 145, 173, 0.45) !important;
          color: #e2e8f0 !important;
        }

        .whatif-dark-panel .ant-select-arrow,
        .whatif-dark-panel .ant-select-clear { color: #6b7a90 !important; }

        /* InputNumber 文字 */
        .whatif-dark-panel .ant-input-number-input {
          color: #e2e8f0 !important;
          -webkit-text-fill-color: #e2e8f0 !important;
        }

        /* ── 下拉 popup 深色主题 ── */
        .whatif-select-popup .ant-select-item { color: #cbd5e1 !important; background: transparent !important; }
        .whatif-select-popup .ant-select-item-option-active:not(.ant-select-item-option-disabled) { background: #334155 !important; }
        .whatif-select-popup .ant-select-item-option-selected:not(.ant-select-item-option-disabled) { background: rgba(37, 99, 235, 0.22) !important; color: #93c5fd !important; }
      `}</style>
    </div>
  );
};

export default WhatIfSimPanel;
