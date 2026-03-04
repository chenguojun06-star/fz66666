import React, { useCallback, useEffect, useState } from 'react';
import { Table, Input, Tag, Space, Tooltip, Statistic, Row, Col, Card, Alert } from 'antd';
import { SearchOutlined, RiseOutlined, FallOutlined, MinusOutlined, RobotOutlined } from '@ant-design/icons';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { intelligenceApi, ProcessKnowledgeItem, ProcessKnowledgeStyleRecord } from '@/services/production/productionApi';

// ───────────────────────────────────── 子表（展开明细）──────────────────────
const RecentStylesTable: React.FC<{ records: ProcessKnowledgeStyleRecord[] }> = ({ records }) => {
  const cols: ColumnsType<ProcessKnowledgeStyleRecord> = [
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    {
      title: '单价（元）',
      dataIndex: 'price',
      width: 100,
      render: (v) => (v != null ? `¥${Number(v).toFixed(2)}` : '-'),
    },
    { title: '机器类型', dataIndex: 'machineType', width: 100, render: (v) => v || '-' },
    {
      title: '标准工时',
      dataIndex: 'standardTime',
      width: 100,
      render: (v) => (v != null ? `${v} 秒` : '-'),
    },
    { title: '录入时间', dataIndex: 'createTime', width: 140, render: (v) => v || '-' },
  ];
  return (
    <Table
      size="small"
      columns={cols}
      dataSource={records}
      rowKey={(r) => r.styleNo + r.createTime}
      pagination={false}
      style={{ margin: '0 24px' }}
    />
  );
};

// ─────────────────────────────────────── 工序趋势标签 ──────────────────────
const TrendTag: React.FC<{ trend?: string }> = ({ trend }) => {
  if (!trend) return <span>-</span>;
  if (trend === 'UP')
    return (
      <Tag icon={<RiseOutlined />} color="volcano">
        上涨
      </Tag>
    );
  if (trend === 'DOWN')
    return (
      <Tag icon={<FallOutlined />} color="cyan">
        下降
      </Tag>
    );
  return (
    <Tag icon={<MinusOutlined />} color="default">
      平稳
    </Tag>
  );
};

// ─────────────────────────────────────── 阶段标签颜色 ──────────────────────
const STAGE_COLOR: Record<string, string> = {
  裁剪: 'orange',
  车缝: 'blue',
  尾部: 'purple',
  入库: 'green',
  采购: 'cyan',
};

// ─────────────────────────────────── 主组件 ────────────────────────────────
interface ProcessStats {
  totalProcessTypes: number;
  totalStyles: number;
  totalRecords: number;
}

const StyleProcessKnowledgeTab: React.FC = () => {
  const [items, setItems] = useState<ProcessKnowledgeItem[]>([]);
  const [stats, setStats] = useState<ProcessStats>({ totalProcessTypes: 0, totalStyles: 0, totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (kw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await intelligenceApi.getProcessKnowledge(kw || undefined);
      const data = (res as unknown as { data: { code: number; data: { items: ProcessKnowledgeItem[]; totalProcessTypes: number; totalStyles: number; totalRecords: number } } }).data;
      if (data.code === 200 && data.data) {
        setItems(data.data.items || []);
        setStats({
          totalProcessTypes: data.data.totalProcessTypes,
          totalStyles: data.data.totalStyles,
          totalRecords: data.data.totalRecords,
        });
      }
    } catch {
      setError('加载工序知识库失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = useCallback((value: string) => {
    setKeyword(value);
    void fetchData(value);
  }, [fetchData]);

  // ─── 主表列定义 ──────────────────────────────────────────────────────────
  const columns: ColumnsType<ProcessKnowledgeItem> = [
    {
      title: '工序名称',
      dataIndex: 'processName',
      width: 140,
      fixed: 'left',
      render: (v) => <strong>{v}</strong>,
    },
    {
      title: '节点',
      dataIndex: 'progressStage',
      width: 80,
      render: (v) =>
        v ? (
          <Tag color={STAGE_COLOR[v] || 'default'} style={{ fontSize: 11 }}>
            {v}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: '机器类型',
      dataIndex: 'machineType',
      width: 90,
      render: (v) => v || '-',
    },
    {
      title: '用款数',
      dataIndex: 'usageCount',
      width: 80,
      sorter: (a, b) => a.usageCount - b.usageCount,
      render: (v) => (
        <Tag color="processing" style={{ minWidth: 36, textAlign: 'center' }}>
          {v} 款
        </Tag>
      ),
    },
    {
      title: '价格区间（元）',
      key: 'priceRange',
      width: 150,
      render: (_, r) =>
        r.minPrice != null && r.maxPrice != null ? (
          <Space size={4}>
            <span style={{ color: '#52c41a' }}>¥{r.minPrice.toFixed(2)}</span>
            <span style={{ color: '#999' }}>~</span>
            <span style={{ color: '#f5222d' }}>¥{r.maxPrice.toFixed(2)}</span>
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: '历史均价',
      dataIndex: 'avgPrice',
      width: 100,
      sorter: (a, b) => (a.avgPrice ?? 0) - (b.avgPrice ?? 0),
      render: (v) => (v != null ? `¥${Number(v).toFixed(2)}` : '-'),
    },
    {
      title: (
        <Tooltip title="AI 加权建议价（最近 3 条权重 ×2）">
          <Space size={4}>
            <RobotOutlined />
            AI建议价
          </Space>
        </Tooltip>
      ),
      dataIndex: 'suggestedPrice',
      width: 110,
      render: (v) =>
        v != null ? (
          <span style={{ color: '#1677ff', fontWeight: 600 }}>¥{Number(v).toFixed(2)}</span>
        ) : (
          '-'
        ),
    },
    {
      title: '均工时',
      dataIndex: 'avgStandardTime',
      width: 80,
      render: (v) => (v != null ? `${v}s` : '-'),
    },
    {
      title: '价格趋势',
      dataIndex: 'priceTrend',
      width: 90,
      render: (v) => <TrendTag trend={v} />,
    },
    {
      title: '最近使用',
      dataIndex: 'lastUsedTime',
      width: 120,
      render: (v) => v || '-',
    },
  ];

  // ─── 展开配置 ─────────────────────────────────────────────────────────────
  const expandable: NonNullable<TableProps<ProcessKnowledgeItem>['expandable']> = {
    expandedRowRender: (record) =>
      record.recentStyles && record.recentStyles.length > 0 ? (
        <RecentStylesTable records={record.recentStyles} />
      ) : (
        <div style={{ padding: '8px 24px', color: '#999' }}>暂无历史款式明细</div>
      ),
    rowExpandable: (record) => (record.recentStyles?.length ?? 0) > 0,
  };

  return (
    <div style={{ padding: '12px 0' }}>
      {/* 顶部统计条 */}
      <Card size="small" style={{ marginBottom: 12, background: 'var(--card-bg, #f8f9fa)' }}>
        <Row gutter={32}>
          <Col>
            <Statistic title="工序种类" value={stats.totalProcessTypes} suffix="种" />
          </Col>
          <Col>
            <Statistic title="涉及款式" value={stats.totalStyles} suffix="款" />
          </Col>
          <Col>
            <Statistic title="历史记录" value={stats.totalRecords} suffix="条" />
          </Col>
          <Col flex="1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Input.Search
              placeholder="搜索工序名称…"
              allowClear
              prefix={<SearchOutlined />}
              style={{ width: 240 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={handleSearch}
            />
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert type="warning" message={error} style={{ marginBottom: 12 }} showIcon />
      )}

      {/* 主表 */}
      <Table<ProcessKnowledgeItem>
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        rowKey="processName"
        expandable={expandable}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 种工序` }}
        footer={() => (
          <span style={{ color: '#999', fontSize: 12 }}>
            💡 数据实时聚合自所有款式工序表，点击行左侧展开查看最近 5 款历史记录。AI 建议价 = 最近 3 条权重 ×2 的加权均价。
          </span>
        )}
      />
    </div>
  );
};

export default StyleProcessKnowledgeTab;
