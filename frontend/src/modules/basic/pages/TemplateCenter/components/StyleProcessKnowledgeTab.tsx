import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Button, Tag, Space, Tooltip, Statistic, Row, Col, Card, Alert } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SearchOutlined, RiseOutlined, FallOutlined, MinusOutlined } from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { intelligenceApi, ProcessKnowledgeItem, ProcessKnowledgeResponse, ProcessKnowledgeStyleRecord } from '@/services/production/productionApi';

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
    <ResizableTable
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

export interface StyleProcessKnowledgeTabProps {
  /** 父层持久化关键字（Tab 切换不丢失） */
  keyword: string;
  onKeywordChange: (kw: string) => void;
  /** 父层持久化页码 */
  currentPage: number;
  /** 父层持久化每页条数 */
  pageSize: number;
  onPageChange: (page: number, size: number) => void;
  /** 父层持久化已选行 */
  selectedKeys: React.Key[];
  onSelectionChange: (keys: React.Key[]) => void;
}

const StyleProcessKnowledgeTab: React.FC<StyleProcessKnowledgeTabProps> = ({
  keyword,
  onKeywordChange,
  currentPage,
  pageSize,
  onPageChange,
  selectedKeys,
  onSelectionChange,
}) => {
  const [items, setItems] = useState<ProcessKnowledgeItem[]>([]);
  const [stats, setStats] = useState<ProcessStats>({ totalProcessTypes: 0, totalStyles: 0, totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  /** 搜索框草稿值（Enter/点击搜索才真正触发请求） */
  const [inputDraft, setInputDraft] = useState(keyword);
  const [error, setError] = useState<string | null>(null);

  // 保证 fetchData 内能读到最新关键字，但不把 keyword 加入依赖
  const keywordRef = useRef(keyword);
  useEffect(() => { keywordRef.current = keyword; }, [keyword]);

  const fetchData = useCallback(async (kw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await intelligenceApi.getProcessKnowledge((kw ?? keywordRef.current) || undefined);
      // api.get() 经 axios 拦截器后直接返回 { code, data }，无需再取 .data
      const result = res as unknown as { code: number; data: ProcessKnowledgeResponse };
      if (result.code === 200 && result.data) {
        setItems(result.data.items || []);
        setStats({
          totalProcessTypes: result.data.totalProcessTypes,
          totalStyles: result.data.totalStyles,
          totalRecords: result.data.totalRecords,
        });
      }
    } catch {
      setError('加载工序智能库失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(keyword || undefined);
  }, [fetchData]); // 仅首次挂载执行；带入父层持久关键字

  /** 触发搜索：关键字同步到父层，页码归 1 */
  const handleSearch = useCallback(() => {
    const kw = inputDraft.trim();
    onKeywordChange(kw);
    onPageChange(1, pageSize);
    void fetchData(kw || undefined);
  }, [inputDraft, onKeywordChange, onPageChange, pageSize, fetchData]);

  /** 清空搜索 */
  const handleClear = useCallback(() => {
    setInputDraft('');
    onKeywordChange('');
    onPageChange(1, pageSize);
    void fetchData(undefined);
  }, [onKeywordChange, onPageChange, pageSize, fetchData]);

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
            <XiaoyunCloudAvatar size={18} active />
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

  // ─── 行选择配置 ───────────────────────────────────────────────────────────
  const rowSelection: TableRowSelection<ProcessKnowledgeItem> = {
    selectedRowKeys: selectedKeys,
    onChange: (keys) => onSelectionChange(keys),
    preserveSelectedRowKeys: true,
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
          <Col flex="1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {/* 标准 Input 组件，与模板列表 Tab 保持一致 */}
            <Input
              placeholder="搜索工序名称"
              allowClear
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              value={inputDraft}
              onChange={(e) => {
                setInputDraft(e.target.value);
                if (!e.target.value) handleClear();
              }}
              onPressEnter={handleSearch}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert type="warning" title={error} style={{ marginBottom: 12 }} showIcon />
      )}

      {/* 主表 — 受控分页 + 行选择 */}
      <ResizableTable<ProcessKnowledgeItem>
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        rowKey="processName"
        expandable={expandable}
        rowSelection={rowSelection}
        stickyHeader
        scroll={{ x: 1000 }}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (t) => `共 ${t} 种工序`,
          onChange: (page, size) => onPageChange(page, size),
        }}
        footer={() => (
          <span style={{ color: '#999', fontSize: 12 }}>
            💡 数据实时聚合自所有款式工序表，点击行左侧展开查看最近 5 款历史记录。AI 建议价 = 最近 3 条权重 ×2 的加权均价，这里作为工序智能库持续为开发、生产与财务联动提供基线。
          </span>
        )}
      />
    </div>
  );
};

export default StyleProcessKnowledgeTab;

