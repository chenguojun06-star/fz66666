import React from 'react';
import { Button, Card, Input, Select, Space } from 'antd';
import { StyleQueryParams } from '@/types/style';

interface StyleFilterPanelProps {
  queryParams: Partial<StyleQueryParams>;
  onQueryChange: (params: Partial<StyleQueryParams>) => void;
  onSearch: () => void;
  loading?: boolean;
  extra?: React.ReactNode;
}

/**
 * 款式信息筛选面板
 * 包含款号、款名搜索
 */
const StyleFilterPanel: React.FC<StyleFilterPanelProps> = ({
  queryParams,
  onQueryChange,
  onSearch,
  loading = false,
  extra
}) => {
  const progressNodeOptions = [
    { label: '全部', value: '' },
    { label: '未开始', value: '未开始' },
    { label: '纸样开发中', value: '纸样开发中' },
    { label: '纸样完成', value: '纸样完成' },
    { label: '样衣制作中', value: '样衣制作中' },
    { label: '样衣完成', value: '样衣完成' },
  ];

  return (
    <Card size="small" className="filter-card mb-sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
        {/* 左侧：搜索条件 */}
        <Space className="style-filter-inline" size={12} wrap>
          <Input
            value={queryParams.styleNo || ''}
            onChange={(e) => {
              const value = e.target.value;
              onQueryChange({ ...queryParams, styleNo: value });
              if (!value) onSearch(); // 清空时自动刷新
            }}
            onPressEnter={onSearch}
            placeholder="搜索款号/款名"
            allowClear
            style={{ width: 220 }}
          />
          <Select
            value={queryParams.progressNode || ''}
            onChange={(value) => {
              onQueryChange({ ...queryParams, progressNode: value || undefined });
              onSearch(); // 选择后自动刷新
            }}
            options={progressNodeOptions}
            className="style-filter-status"
            placeholder="进度节点"
            allowClear
            style={{ width: 140 }}
          />
        </Space>

        {/* 右侧：额外的操作按钮（如新建、切换视图） */}
        {extra && <Space wrap>{extra}</Space>}
      </div>
    </Card>
  );
};

export default StyleFilterPanel;
