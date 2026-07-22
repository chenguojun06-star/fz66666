import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Button, Tag, Space, Statistic, Row, Col, Card, Alert, Select, Collapse } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SearchOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { intelligenceApi, ProcessKnowledgeItem, ProcessKnowledgeResponse, ProcessKnowledgeGroup } from '@/services/intelligence/intelligenceApi';
import RecentStylesTable from './RecentStylesTable';
import { buildColumns } from './columns';
import { STAGE_COLOR } from './constants';
import type { ProcessStats, StyleProcessKnowledgeTabProps } from './types';

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

  const columns = buildColumns();

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

export { StyleProcessKnowledgeTab };
export type { StyleProcessKnowledgeTabProps };
export default StyleProcessKnowledgeTab;
