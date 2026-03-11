import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Table,
  Tag,
  Space,
  Statistic,
  Card,
  Row,
  Col,
  Select,
  message,
  Spin,
  Tooltip,
  Alert,
  Collapse,
} from 'antd';
import {
  StarOutlined,
  RobotOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { historyList, topStyles, aiSuggestion } from '@/services/selection/selectionApi';

interface StyleHistory {
  styleNo: string;
  styleName: string;
  category: string;
  orderCount: number;
  totalOrderQty: number;
  totalWarehousedQty: number;
  avgQualifiedRate: number;
  avgProfitRate: number;
  maxProfitRate: number;
  totalRevenue: number;
  firstOrderTime: string;
  lastOrderTime: string;
  repeatOrderCount: number;
  highPotential: boolean;
  customers: string[];
}

const CATEGORY_OPTIONS = ['上装', '下装', '外套', '连衣裙', '针织', '配件'];
const SEASON_OPTIONS = ['春夏', '秋冬', 'SS', 'AW'];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function HistoricalAnalysis() {
  const [data, setData] = useState<StyleHistory[]>([]);
  const [topData, setTopData] = useState<StyleHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [season, setSeason] = useState<string | undefined>();
  const [year, setYear] = useState<number | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, topRes] = await Promise.all([
        historyList({ category, season, year }),
        topStyles(10),
      ]);
      setData(listRes?.data ?? []);
      setTopData(topRes?.data ?? []);
    } catch {
      message.error('加载历史数据失败');
    } finally {
      setLoading(false);
    }
  }, [category, season, year]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAiSuggestion = async () => {
    setAiLoading(true);
    setAiText('');
    try {
      const res = await aiSuggestion({ year: CURRENT_YEAR, season: season ?? '全年' });
      setAiText(res?.data ?? '');
    } catch {
      message.error('AI 分析失败');
    } finally {
      setAiLoading(false);
    }
  };

  const columns: ColumnsType<StyleHistory> = [
    {
      title: '款式号',
      dataIndex: 'styleNo',
      width: 140,
      render: (v, r) => (
        <Space>
          {v}
          {r.highPotential && <Tag color="gold" icon={<StarOutlined />}>高潜力</Tag>}
        </Space>
      ),
    },
    { title: '款式名称', dataIndex: 'styleName', width: 140 },
    { title: '品类', dataIndex: 'category', width: 80 },
    { title: '订单次数', dataIndex: 'orderCount', width: 90, sorter: (a, b) => a.orderCount - b.orderCount },
    {
      title: '总订单量',
      dataIndex: 'totalOrderQty',
      width: 100,
      sorter: (a, b) => a.totalOrderQty - b.totalOrderQty,
    },
    {
      title: '已入库量',
      dataIndex: 'totalWarehousedQty',
      width: 100,
      sorter: (a, b) => a.totalWarehousedQty - b.totalWarehousedQty,
    },
    {
      title: '平均合格率',
      dataIndex: 'avgQualifiedRate',
      width: 110,
      render: (v) => v ? `${(v * 100).toFixed(1)}%` : '-',
      sorter: (a, b) => (a.avgQualifiedRate ?? 0) - (b.avgQualifiedRate ?? 0),
    },
    {
      title: '平均利润率',
      dataIndex: 'avgProfitRate',
      width: 110,
      render: (v) => {
        if (!v) return '-';
        const pct = (v * 100).toFixed(1);
        return <Tag color={parseFloat(pct) >= 30 ? 'success' : parseFloat(pct) >= 15 ? 'processing' : 'default'}>{pct}%</Tag>;
      },
      sorter: (a, b) => (a.avgProfitRate ?? 0) - (b.avgProfitRate ?? 0),
    },
    {
      title: '总收入',
      dataIndex: 'totalRevenue',
      width: 110,
      render: (v) => v ? `¥${v.toLocaleString()}` : '-',
      sorter: (a, b) => (a.totalRevenue ?? 0) - (b.totalRevenue ?? 0),
    },
    {
      title: '复购次数',
      dataIndex: 'repeatOrderCount',
      width: 90,
      render: (v) => v > 0 ? <Tag color="blue">{v}</Tag> : '0',
      sorter: (a, b) => a.repeatOrderCount - b.repeatOrderCount,
    },
    {
      title: '主要客户',
      dataIndex: 'customers',
      width: 160,
      render: (v: string[]) => v?.length ? (
        <Tooltip title={v.join(', ')}>
          <span>{v.slice(0, 2).join(', ')}{v.length > 2 ? '…' : ''}</span>
        </Tooltip>
      ) : '-',
    },
    { title: '最近下单', dataIndex: 'lastOrderTime', width: 110, render: (v) => v?.slice(0, 10) },
  ];

  const highPotentialCount = data.filter(d => d.highPotential).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>历史款式分析</h2>
        <Space>
          <Select
            placeholder="品类"
            allowClear
            style={{ width: 100 }}
            options={CATEGORY_OPTIONS.map(c => ({ label: c, value: c }))}
            onChange={setCategory}
          />
          <Select
            placeholder="季节"
            allowClear
            style={{ width: 100 }}
            options={SEASON_OPTIONS.map(s => ({ label: s, value: s }))}
            onChange={setSeason}
          />
          <Select
            placeholder="年份"
            allowClear
            style={{ width: 100 }}
            options={YEAR_OPTIONS.map(y => ({ label: y, value: y }))}
            onChange={setYear}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<RobotOutlined />} loading={aiLoading} onClick={handleAiSuggestion}>AI选品建议</Button>
        </Space>
      </div>

      {/* 顶部统计卡 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={5}>
          <Card size="small">
            <Statistic title="分析款式数" value={data.length} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="高潜力款" value={highPotentialCount} valueStyle={{ color: '#faad14' }} suffix={`/ ${data.length}`} />
          </Card>
        </Col>
        <Col span={7}>
          <Card size="small" title="Top 10 畅销款" style={{ cursor: 'default' }} styles={{ header: { fontSize: 13 } }}>
            <div style={{ height: 48, overflow: 'hidden' }}>
              {topData.slice(0, 3).map(t => (
                <Tag key={t.styleNo} color="blue" style={{ marginBottom: 4 }}>{t.styleNo}</Tag>
              ))}
              {topData.length > 3 && <Tag color="default">+{topData.length - 3}</Tag>}
            </div>
          </Card>
        </Col>
      </Row>

      {/* AI 分析结论 */}
      {aiLoading && <Spin tip="AI 分析中，请稍候…" style={{ display: 'block', marginBottom: 16 }} />}
      {aiText && (
        <Collapse
          style={{ marginBottom: 16 }}
          defaultActiveKey={['ai']}
          items={[{
            key: 'ai',
            label: <Space><RobotOutlined />AI 选品趋势建议</Space>,
            children: <Alert type="info" message={<pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{aiText}</pre>} />,
          }]}
        />
      )}

      <Table<StyleHistory>
        columns={columns}
        dataSource={data}
        rowKey="styleNo"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="small"
        rowClassName={(r) => r.highPotential ? 'ant-table-row-selected' : ''}
      />
    </div>
  );
}
