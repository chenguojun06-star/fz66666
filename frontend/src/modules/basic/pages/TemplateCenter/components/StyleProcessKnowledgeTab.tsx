import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Button, Tag, Space, Tooltip, Statistic, Row, Col, Card, Alert, Select, Collapse } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SearchOutlined, RiseOutlined, FallOutlined, MinusOutlined, WarningOutlined } from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { intelligenceApi, ProcessKnowledgeItem, ProcessKnowledgeResponse, ProcessKnowledgeStyleRecord, ProcessKnowledgeGroup } from '@/services/intelligence/intelligenceApi';
import { formatMoney } from '@/utils/format';

const RecentStylesTable: React.FC<{ records: ProcessKnowledgeStyleRecord[] }> = ({ records }) => {
  const cols: ColumnsType<ProcessKnowledgeStyleRecord> = [
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    {
      title: '单价（元）',
      dataIndex: 'price',
      width: 120,
      render: (v, r) => {
        if (v == null) return '-';
        if (r.abnormal) {
          return (
            <Tooltip title={r.abnormalType === 'HIGH' ? '价格偏高（偏离均价30%以上）' : '价格偏低（偏离均价30%以上）'}>
              <span style={{ color: r.abnormalType === 'HIGH' ? 'var(--color-error)' : 'var(--color-warning)', fontWeight: 600 }}>
                <WarningOutlined style={{ marginRight: 4 }} />
                {formatMoney(v)}
              </span>
            </Tooltip>
          );
        }
        return formatMoney(v);
      },
    },
    { title: '扫码时间', dataIndex: 'createTime', width: 140, render: (v) => v || '-' },
  ];
  return (
    <ResizableTable

      columns={cols}
      dataSource={records}
      rowKey={(r) => r.styleNo + r.createTime}
      pagination={false}
      emptyDescription="暂无工序数据"
      style={{ margin: '0 24px' }}
    />
  );
};

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

const STAGE_COLOR: Record<string, string> = {
  裁剪: 'orange',
  车缝: 'blue',
  尾部: 'purple',
  入库: 'green',
  采购: 'cyan',
};

interface ProcessStats {
  totalProcessTypes: number;
  totalStyles: number;
  totalRecords: number;
}

export interface StyleProcessKnowledgeTabProps {
  keyword: string;
  onKeywordChange: (kw: string) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number, size: number) => void;
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
  const [groupedItems, setGroupedItems] = useState<ProcessKnowledgeGroup[]>([]);
  const [stats, setStats] = useState<ProcessStats>({ totalProcessTypes: 0, totalStyles: 0, totalRecords: 0 });
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [difficultyOptions, setDifficultyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [inputDraft, setInputDraft] = useState(keyword);
  const [error, setError] = useState<string | null>(null);

  const keywordRef = useRef(keyword);
  useEffect(() => { keywordRef.current = keyword; }, [keyword]);

  const categoryRef = useRef(selectedCategory);
  useEffect(() => { categoryRef.current = selectedCategory; }, [selectedCategory]);

  const difficultyRef = useRef(selectedDifficulty);
  useEffect(() => { difficultyRef.current = selectedDifficulty; }, [selectedDifficulty]);

  const fetchData = useCallback(async (kw?: string, cat?: string, diff?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await intelligenceApi.getProcessKnowledge(
        (kw ?? keywordRef.current) || undefined,
        (cat ?? categoryRef.current) || undefined,
        (diff ?? difficultyRef.current) || undefined,
      );
      const result = res as unknown as { code: number; data: ProcessKnowledgeResponse };
      if (result.code === 200 && result.data) {
        setItems(result.data.items || []);
        setGroupedItems(result.data.groupedItems || []);
        setStats({
          totalProcessTypes: result.data.totalProcessTypes,
          totalStyles: result.data.totalStyles,
          totalRecords: result.data.totalRecords,
        });
        if (result.data.categoryOptions) {
          setCategoryOptions(result.data.categoryOptions);
        }
        if (result.data.difficultyOptions) {
          setDifficultyOptions(result.data.difficultyOptions);
        }
      }
    } catch {
      setError('加载工序库失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(keyword || undefined, selectedCategory || undefined, selectedDifficulty || undefined);
  }, [fetchData, keyword, selectedCategory, selectedDifficulty]);

  const handleSearch = useCallback(() => {
    const kw = inputDraft.trim();
    onKeywordChange(kw);
    onPageChange(1, pageSize);
    void fetchData(kw || undefined, selectedCategory || undefined, selectedDifficulty || undefined);
  }, [inputDraft, onKeywordChange, onPageChange, pageSize, fetchData, selectedCategory, selectedDifficulty]);

  const handleClear = useCallback(() => {
    setInputDraft('');
    onKeywordChange('');
    onPageChange(1, pageSize);
    void fetchData(undefined, selectedCategory || undefined, selectedDifficulty || undefined);
  }, [onKeywordChange, onPageChange, pageSize, fetchData, selectedCategory, selectedDifficulty]);

  const handleCategoryChange = useCallback((val: string) => {
    setSelectedCategory(val || '');
    onPageChange(1, pageSize);
  }, [onPageChange, pageSize]);

  const handleDifficultyChange = useCallback((val: string) => {
    setSelectedDifficulty(val || '');
    onPageChange(1, pageSize);
  }, [onPageChange, pageSize]);

  const columns: ColumnsType<ProcessKnowledgeItem> = [
    {
      title: '工序名称',
      dataIndex: 'processName',
      width: 140,
      fixed: 'left',
      render: (v, r) => (
        <Space>
          <strong>{v}</strong>
          {r.abnormalCount && r.abnormalCount > 0 ? (
            <Tooltip title={`${r.abnormalCount} 条异常价格记录（偏离均价±30%）`}>
              <Tag color="warning" style={{ marginLeft: 0 }}>
                <WarningOutlined /> {r.abnormalCount}
              </Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: '节点',
      dataIndex: 'progressStage',
      width: 80,
      render: (v) =>
        v ? (
          <Tag color={STAGE_COLOR[v] || 'default'} style={{ fontSize: 14 }}>
            {v}
          </Tag>
        ) : (
          '-'
        ),
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
            <span style={{ color: 'var(--color-success)' }}>{formatMoney(r.minPrice)}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>~</span>
            <span style={{ color: 'var(--color-error)' }}>{formatMoney(r.maxPrice)}</span>
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
      render: (v) => (v != null ? formatMoney(v) : '-'),
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
          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{formatMoney(v)}</span>
        ) : (
          '-'
        ),
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

  const expandable: NonNullable<TableProps<ProcessKnowledgeItem>['expandable']> = {
    expandedRowRender: (record) =>
      record.recentStyles && record.recentStyles.length > 0 ? (
        <RecentStylesTable records={record.recentStyles} />
      ) : (
        <div style={{ padding: '8px 24px', color: 'var(--color-text-tertiary)' }}>暂无历史款式明细</div>
      ),
    rowExpandable: (record) => (record.recentStyles?.length ?? 0) > 0,
  };

  const rowSelection: TableRowSelection<ProcessKnowledgeItem> = {
    selectedRowKeys: selectedKeys,
    onChange: (keys) => onSelectionChange(keys),
    preserveSelectedRowKeys: true,
  };

  const hasFilter = selectedCategory || selectedDifficulty;

  const renderGroupTable = (groupItems: ProcessKnowledgeItem[]) => (
    <ResizableTable<ProcessKnowledgeItem>
      size="middle"
      columns={columns}
      dataSource={groupItems}
      rowKey="processName"
      expandable={expandable}
      rowSelection={rowSelection}
      pagination={false}
      emptyDescription="暂无工序数据"
      scroll={{ x: 1000 }}
    />
  );

  return (
    <div style={{ padding: '12px 0' }}>
      <Card style={{ marginBottom: 12, background: 'var(--card-bg, #f8f9fa)' }}>
        <Row gutter={32} align="middle">
          <Col>
            <Statistic title="工序种类" value={stats.totalProcessTypes} suffix="种" />
          </Col>
          <Col>
            <Statistic title="涉及款式" value={stats.totalStyles} suffix="款" />
          </Col>
          <Col>
            <Statistic title="历史记录" value={stats.totalRecords} suffix="条" />
          </Col>
          <Col flex="1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <Select
              placeholder="选择品类"
              allowClear
              style={{ width: 150 }}
              value={selectedCategory || undefined}
              onChange={handleCategoryChange}
              options={categoryOptions.map(c => ({ label: c, value: c }))}
            />
            <Select
              placeholder="选择难度"
              allowClear
              style={{ width: 140 }}
              value={selectedDifficulty || undefined}
              onChange={handleDifficultyChange}
              options={difficultyOptions.map(d => ({ label: d.label, value: d.value }))}
            />
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
            {hasFilter && (
              <Button
                onClick={() => {
                  setSelectedCategory('');
                  setSelectedDifficulty('');
                  setInputDraft('');
                  onKeywordChange('');
                  onPageChange(1, pageSize);
                }}
              >
                重置筛选
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert type="warning" title={error} style={{ marginBottom: 12 }} showIcon />
      )}

      {hasFilter && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <Space>
              <span>当前筛选：</span>
              {selectedCategory && <Tag color="blue">品类：{selectedCategory}</Tag>}
              {selectedDifficulty && <Tag color="purple">难度：{difficultyOptions.find(d => d.value === selectedDifficulty)?.label || selectedDifficulty}</Tag>}
            </Space>
          }
        />
      )}

      {groupedItems && groupedItems.length > 0 ? (
        <Collapse
          defaultActiveKey={groupedItems.map((_, i) => String(i))}
          style={{ background: 'transparent' }}
          items={groupedItems.map((group, index) => ({
            key: String(index),
            label: (
              <Space>
                <Tag color={STAGE_COLOR[group.parentNode] || 'default'} style={{ fontSize: 14, fontWeight: 600 }}>
                  {group.parentNode}
                </Tag>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  {group.items.length} 道工序
                </span>
              </Space>
            ),
            children: renderGroupTable(group.items),
          }))}
        />
      ) : (
        <ResizableTable<ProcessKnowledgeItem>
          size="middle"
          loading={loading}
          emptyDescription="暂无工序数据"
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
             <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
               数据实时聚合自本厂扫码历史记录，点击行左侧展开查看最近 5 款历史记录。异常价格 = 偏离均价±30%的记录，可作为定价复核参考。
             </span>
          )}
        />
      )}
    </div>
  );
};

export default StyleProcessKnowledgeTab;
