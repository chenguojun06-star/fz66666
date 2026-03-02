import React, { useState, useCallback } from 'react';
import {
  Button, Table, Tag, Alert, Spin, Statistic, Row, Col, Typography, Space, Tooltip,
} from 'antd';
import {
  WarningOutlined, CheckCircleOutlined, ReloadOutlined, ShoppingCartOutlined,
  PhoneOutlined, UserOutlined, RobotOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { MaterialShortageItem } from '@/services/production/productionApi';

const { Text } = Typography;

const riskTagColor: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'gold' };
const riskTagLabel: Record<string, string> = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' };

const columns = [
  {
    title: '物料编码',
    dataIndex: 'materialCode',
    key: 'materialCode',
    width: 120,
    render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
  },
  {
    title: '物料名称',
    dataIndex: 'materialName',
    key: 'materialName',
    width: 140,
    render: (v: string, r: MaterialShortageItem) => (
      <span>
        {v || r.materialCode}
        {r.spec ? <Text type="secondary" style={{ marginLeft: 4, fontSize: 11 }}>({r.spec})</Text> : null}
      </span>
    ),
  },
  {
    title: '现有库存',
    dataIndex: 'currentStock',
    key: 'currentStock',
    width: 90,
    align: 'right' as const,
    render: (v: number, r: MaterialShortageItem) => `${v} ${r.unit || ''}`,
  },
  {
    title: '需求量',
    dataIndex: 'demandQuantity',
    key: 'demandQuantity',
    width: 90,
    align: 'right' as const,
    render: (v: number, r: MaterialShortageItem) => (
      <Text strong>{v} {r.unit || ''}</Text>
    ),
  },
  {
    title: '缺口',
    dataIndex: 'shortageQuantity',
    key: 'shortageQuantity',
    width: 90,
    align: 'right' as const,
    render: (v: number, r: MaterialShortageItem) => (
      <Text type="danger" strong>{v} {r.unit || ''}</Text>
    ),
    sorter: (a: MaterialShortageItem, b: MaterialShortageItem) =>
      a.shortageQuantity - b.shortageQuantity,
    defaultSortOrder: 'descend' as const,
  },
  {
    title: '风险',
    dataIndex: 'riskLevel',
    key: 'riskLevel',
    width: 80,
    render: (v: string) => (
      <Tag color={riskTagColor[v] ?? 'default'}>{riskTagLabel[v] ?? v}</Tag>
    ),
    filters: [
      { text: '高风险', value: 'HIGH' },
      { text: '中风险', value: 'MEDIUM' },
      { text: '低风险', value: 'LOW' },
    ],
    onFilter: (value: unknown, record: MaterialShortageItem) => record.riskLevel === value,
  },
  {
    title: '供应商',
    key: 'supplier',
    width: 200,
    render: (_: unknown, r: MaterialShortageItem) => {
      if (!r.supplierName) return <Text type="secondary">—</Text>;
      return (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.6 }}>
          <span><ShoppingCartOutlined style={{ marginRight: 4, color: '#888' }} />{r.supplierName}</span>
          {r.supplierContact && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <UserOutlined style={{ marginRight: 4 }} />{r.supplierContact}
            </Text>
          )}
          {r.supplierPhone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <PhoneOutlined style={{ marginRight: 4 }} />{r.supplierPhone}
            </Text>
          )}
        </Space>
      );
    },
  },
];

const MaterialShortagePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    shortageItems: MaterialShortageItem[];
    sufficientCount: number;
    coveredOrderCount: number;
    summary: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getMaterialShortage() as any;
      const d = res?.data ?? null;
      if (d) {
        setData(d);
      } else {
        setError('接口返回数据为空');
      }
    } catch (e: any) {
      setError(e?.message ?? '查询失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const highCount = data?.shortageItems.filter(i => i.riskLevel === 'HIGH').length ?? 0;
  const mediumCount = data?.shortageItems.filter(i => i.riskLevel === 'MEDIUM').length ?? 0;

  const handleAiAdvice = async () => {
    if (!data) return;
    setAiLoading(true);
    setAiAdvice('');
    setAiError('');
    try {
      const question = `当前面料缺口分析：高风险${highCount}种、中风险${mediumCount}种、单总计${data.shortageItems.length}种缺货物料，已覆盖${data.coveredOrderCount}张在产订单。${
        data.shortageItems.slice(0, 3).map(i => `${i.materialName || i.materialCode}缺${i.shortageQuantity}${i.unit || ''}`).join('、')
      }等。请给出补货优先级排序和应对策略。`;
      const res = await intelligenceApi.aiAdvisorChat(question) as any;
      const answer = res?.data?.answer || res?.answer || '';
      answer ? setAiAdvice(answer) : setAiError('未收到 AI 回复，请稍后重试');
    } catch (e: any) {
      setAiError(e?.message || 'AI 请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px 0' }}>
      {/* 操作栏 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={fetchData}
          loading={loading}
        >
          {data ? '刷新预测' : '开始预测'}
        </Button>
        {data && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            已覆盖 {data.coveredOrderCount} 张在产订单
          </Text>
        )}
      </div>

      {/* 统计卡 */}
      {data && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <div style={{ background: '#fff5f5', borderRadius: 8, padding: '12px 16px', border: '1px solid #ffd6d6' }}>
              <Statistic
                title="高风险缺货"
                value={highCount}
                suffix="种"
                valueStyle={{ color: '#cf1322', fontWeight: 700 }}
                prefix={<WarningOutlined />}
              />
            </div>
          </Col>
          <Col span={6}>
            <div style={{ background: '#fffbe6', borderRadius: 8, padding: '12px 16px', border: '1px solid #ffe58f' }}>
              <Statistic
                title="中风险缺货"
                value={mediumCount}
                suffix="种"
                valueStyle={{ color: '#d48806' }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div style={{ background: '#f6ffed', borderRadius: 8, padding: '12px 16px', border: '1px solid #b7eb8f' }}>
              <Statistic
                title="库存充足物料"
                value={data.sufficientCount}
                suffix="种"
                valueStyle={{ color: '#389e0d' }}
                prefix={<CheckCircleOutlined />}
              />
            </div>
          </Col>
          <Col span={6}>
            <div style={{ background: '#f0f5ff', borderRadius: 8, padding: '12px 16px', border: '1px solid #adc6ff' }}>
              <Statistic
                title="缺货物料合计"
                value={data.shortageItems.length}
                suffix="种"
                valueStyle={{ color: '#2f54eb' }}
              />
            </div>
          </Col>
        </Row>
      )}

      {/* 汇总提示 */}
      {data?.summary && (
        <Alert
          message={data.summary}
          type={highCount > 0 ? 'warning' : data.shortageItems.length > 0 ? 'info' : 'success'}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {error && (
        <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* 缺货表格 */}
      {data && (
        <Spin spinning={loading}>
          {data.shortageItems.length === 0 ? (
            <Alert
              message="库存充足，当前无缺货风险"
              description="所有在产订单的物料需求均已被库存覆盖。"
              type="success"
              showIcon
            />
          ) : (
            <Table<MaterialShortageItem>
              dataSource={data.shortageItems}
              columns={columns}
              rowKey={r => r.materialCode + '|' + r.spec}
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: true }}
              rowClassName={r => r.riskLevel === 'HIGH' ? 'shortage-row-high' : ''}
              scroll={{ x: 900 }}
            />
          )}
        </Spin>
      )}

      {!data && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <WarningOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
          <div>点击「开始预测」，系统将自动分析在产订单的面料缺口并评估风险</div>
        </div>
      )}

      {/* AI 补货建议 */}
      {data && (
        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Button icon={<RobotOutlined />} loading={aiLoading} onClick={handleAiAdvice} type="primary" ghost size="small">
            AI 补货建议
          </Button>
          {aiError && <Alert type="error" message={aiError} showIcon style={{ marginTop: 10 }} />}
          {aiAdvice && !aiError && (
            <Alert type="info" message="AI 补货策略建议"
              description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{aiAdvice}</pre>}
              showIcon icon={<RobotOutlined />} style={{ marginTop: 10 }} />
          )}
        </div>
      )}

      <style>{`
        .shortage-row-high td { background: #fff9f9 !important; }
      `}</style>
    </div>
  );
};

export default MaterialShortagePanel;
