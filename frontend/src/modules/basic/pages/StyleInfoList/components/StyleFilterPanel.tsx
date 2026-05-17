import React from 'react';
import { Card, Input, Select, Space } from 'antd';
import { StyleQueryParams } from '@/types/style';
import { useDictOptions } from '@/hooks/useDictOptions';

const PROGRESS_STAGE_FALLBACK = [
  { label: '采购', value: '采购' },
  { label: '裁剪', value: '裁剪' },
  { label: '二次工艺', value: '二次工艺' },
  { label: '车缝', value: '车缝' },
  { label: '尾部', value: '尾部' },
  { label: '入库', value: '入库' },
];

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
  loading: _loading = false,
  extra
}) => {
  const { options: progressStageDictOptions } = useDictOptions('progress_stage', PROGRESS_STAGE_FALLBACK);
  const progressNodeOptions = [
    { label: '全部', value: '' },
    ...progressStageDictOptions,
  ];

  return (
    <Card className="filter-card mb-sm">
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
