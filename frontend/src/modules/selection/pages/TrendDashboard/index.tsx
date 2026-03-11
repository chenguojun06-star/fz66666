import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Tooltip,
  Alert,
  Spin,
  Typography,
} from 'antd';
import { PlusOutlined, ReloadOutlined, FireOutlined, RobotOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { trendLatest, trendAddManual, aiSuggestion } from '@/services/selection/selectionApi';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_SEASON = (() => {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 8) return '春夏';
  return '秋冬';
})();

interface Trend {
  id: number;
  keyword: string;
  trendType: string;
  dataSource: string;
  heatScore: number;
  period: string;
  aiSummary: string;
  aiSuggestion: string;
  snapshotDate: string;
}

const TYPE_OPTIONS = [
  { label: '颜色趋势', value: 'COLOR' },
  { label: '廓形趋势', value: 'SILHOUETTE' },
  { label: '面料趋势', value: 'FABRIC' },
  { label: '品类趋势', value: 'CATEGORY' },
  { label: '关键词', value: 'KEYWORD' },
];

const SOURCE_OPTIONS = [
  { label: '内部数据', value: 'INTERNAL' },
  { label: '百度指数', value: 'BAIDU' },
  { label: 'Google Trends', value: 'GOOGLE' },
  { label: '微博热搜', value: 'WEIBO' },
  { label: '手动录入', value: 'MANUAL' },
];

const TYPE_COLORS: Record<string, string> = {
  COLOR: 'magenta',
  SILHOUETTE: 'purple',
  FABRIC: 'cyan',
  CATEGORY: 'blue',
  KEYWORD: 'green',
};

export default function TrendDashboard() {
  const [data, setData] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterSource, setFilterSource] = useState<string | undefined>();
  const [days, setDays] = useState(30);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiYear, setAiYear] = useState(CURRENT_YEAR);
  const [aiSeason, setAiSeasonState] = useState(CURRENT_SEASON);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trendLatest({
        ...(filterType ? { trendType: filterType } : {}),
        ...(filterSource ? { dataSource: filterSource } : {}),
        days,
      });
      setData(res?.data ?? []);
    } catch {
      message.error('加载趋势数据失败');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSource, days]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const values = await form.validateFields();
    try {
      await trendAddManual(values);
      message.success('趋势数据录入成功');
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '录入失败');
    }
  };

  const handleAiAnalysis = async () => {
    setAiLoading(true);
    setAiText('');
    try {
      const res = await aiSuggestion({ year: aiYear, season: aiSeason });
      setAiText(res?.data ?? '未收到 AI 分析结果');
    } catch {
      message.error('AI 分析失败，请稍后重试');
    } finally {
      setAiLoading(false);
    }
  };

  const openAiModal = () => {
    setAiText('');
    setAiModalOpen(true);
    handleAiAnalysis();
  };

  // 统计热度分布
  const hotCount = data.filter(d => d.heatScore >= 80).length;
  const riseCount = data.filter(d => d.heatScore >= 60 && d.heatScore < 80).length;

  const columns: ColumnsType<Trend> = [
    {
      title: '关键词',
      dataIndex: 'keyword',
      width: 140,
      render: (v, r) => (
        <Space>
          <strong>{v}</strong>
          {r.heatScore >= 80 && <FireOutlined style={{ color: '#ff4d4f' }} />}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'trendType',
      width: 100,
      render: (v) => <Tag color={TYPE_COLORS[v] ?? 'default'}>{TYPE_OPTIONS.find(o => o.value === v)?.label ?? v}</Tag>,
    },
    {
      title: '来源',
      dataIndex: 'dataSource',
      width: 110,
      render: (v) => SOURCE_OPTIONS.find(o => o.value === v)?.label ?? v,
    },
    {
      title: '热度',
      dataIndex: 'heatScore',
      width: 100,
      sorter: (a, b) => a.heatScore - b.heatScore,
      defaultSortOrder: 'descend',
      render: (v) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: `${v}%`,
                maxWidth: '60px',
                height: 8,
                borderRadius: 4,
                background: v >= 80 ? '#ff4d4f' : v >= 60 ? '#fa8c16' : '#52c41a',
                minWidth: 4,
              }}
            />
            <span style={{ fontSize: 12 }}>{v}</span>
          </div>
        </div>
      ),
    },
    { title: '周期', dataIndex: 'period', width: 90 },
    {
      title: 'AI 摘要',
      dataIndex: 'aiSummary',
      ellipsis: true,
      render: (v) => v ? (
        <Tooltip title={v} overlayStyle={{ maxWidth: 400 }}>
          <span style={{ cursor: 'help' }}>{v}</span>
        </Tooltip>
      ) : '-',
    },
    {
      title: 'AI 建议',
      dataIndex: 'aiSuggestion',
      ellipsis: true,
      width: 200,
      render: (v) => v ? (
        <Tooltip title={v} overlayStyle={{ maxWidth: 400 }}>
          <Tag color="purple" style={{ cursor: 'help', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</Tag>
        </Tooltip>
      ) : '-',
    },
    { title: '日期', dataIndex: 'snapshotDate', width: 110 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>趋势看板</h2>
        <Space>
          <Select
            placeholder="趋势类型"
            allowClear
            style={{ width: 120 }}
            options={TYPE_OPTIONS}
            onChange={setFilterType}
          />
          <Select
            placeholder="数据来源"
            allowClear
            style={{ width: 130 }}
            options={SOURCE_OPTIONS}
            onChange={setFilterSource}
          />
          <Select
            style={{ width: 90 }}
            value={days}
            onChange={setDays}
            options={[
              { label: '近7天', value: 7 },
              { label: '近30天', value: 30 },
              { label: '近90天', value: 90 },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button icon={<RobotOutlined />} onClick={openAiModal} style={{ borderColor: '#722ed1', color: '#722ed1' }}>AI 趋势分析</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>手动录入</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={5}>
          <Card size="small">
            <Statistic title="趋势条目" value={data.length} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="热点词（≥80）" value={hotCount} valueStyle={{ color: '#ff4d4f' }} suffix={<FireOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="上升中（60-79）" value={riseCount} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={9}>
          <Card size="small" title="热门关键词" styles={{ header: { fontSize: 13 } }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {data
                .filter(d => d.heatScore >= 70)
                .sort((a, b) => b.heatScore - a.heatScore)
                .slice(0, 8)
                .map(d => (
                  <Tag key={d.id} color={TYPE_COLORS[d.trendType] ?? 'default'} style={{ fontSize: 12 }}>
                    {d.keyword}
                  </Tag>
                ))}
            </div>
          </Card>
        </Col>
      </Row>

      <Table<Trend>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="small"
      />

      <Modal
        title={<Space><RobotOutlined style={{ color: '#722ed1' }} /><span>AI 趋势分析</span></Space>}
        open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)}
        footer={[
          <Space key="footer">
            <Select
              size="small"
              value={aiYear}
              onChange={setAiYear}
              options={Array.from({ length: 3 }, (_, i) => ({ label: `${CURRENT_YEAR + i - 1}年`, value: CURRENT_YEAR + i - 1 }))}
              style={{ width: 90 }}
            />
            <Select
              size="small"
              value={aiSeason}
              onChange={setAiSeasonState}
              options={[{ label: '春夏', value: '春夏' }, { label: '秋冬', value: '秋冬' }, { label: '全年', value: '全年' }]}
              style={{ width: 80 }}
            />
            <Button onClick={handleAiAnalysis} loading={aiLoading} icon={<RobotOutlined />}>重新分析</Button>
            <Button onClick={() => setAiModalOpen(false)}>关闭</Button>
          </Space>,
        ]}
        width="60vw"
        destroyOnClose
      >
        {aiLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#888' }}>AI 正在分析趋势数据，请稍候…</div>
          </div>
        ) : aiText ? (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <Alert
              type="info"
              message={`${aiYear}年 ${aiSeason} 选品趋势分析`}
              description={
                <Typography.Paragraph
                  style={{ whiteSpace: 'pre-wrap', marginBottom: 0, lineHeight: 1.8 }}
                >
                  {aiText}
                </Typography.Paragraph>
              }
              icon={<RobotOutlined />}
              showIcon
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>点击「重新分析」获取 AI 趋势建议</div>
        )}
      </Modal>

      <Modal
        title="手动录入趋势数据"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => setModalOpen(false)}
        width="40vw"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="keyword" label="关键词" rules={[{ required: true }]}>
            <Input placeholder="如：马甲、Y2K、大地色" />
          </Form.Item>
          <Form.Item name="trendType" label="类型" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="heatScore" label="热度分（0-100）" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="period" label="周期">
            <Input placeholder="如：2026Q1、2026春夏" />
          </Form.Item>
          <Form.Item name="aiSummary" label="摘要">
            <Input.TextArea rows={2} placeholder="趋势描述" />
          </Form.Item>
          <Form.Item name="aiSuggestion" label="建议">
            <Input.TextArea rows={2} placeholder="选品建议" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
