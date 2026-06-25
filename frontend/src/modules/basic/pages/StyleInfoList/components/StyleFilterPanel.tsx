import React, { useState, useEffect, useRef } from 'react';
import { Input, Select, Space } from 'antd';
import { StyleQueryParams } from '@/types/style';

const DEBOUNCE_MS = 300;

interface StyleFilterPanelProps {
  queryParams: Partial<StyleQueryParams>;
  onQueryChange: (params: Partial<StyleQueryParams>) => void;
  onSearch: () => void;
  loading?: boolean;
  extra?: React.ReactNode;
}

/**
 * 款式信息筛选面板
 * 包含款号、款名搜索（300ms 防抖）
 * 注：以图搜款已集成到 Cmd+K 全局搜索，此处不再重复
 */
const StyleFilterPanel: React.FC<StyleFilterPanelProps> = ({
  queryParams,
  onQueryChange,
  onSearch,
  loading: _loading = false,
  extra
}) => {
  const [localStyleNo, setLocalStyleNo] = useState(queryParams.styleNo || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestParamsRef = useRef(queryParams);

  useEffect(() => {
    latestParamsRef.current = queryParams;
  }, [queryParams]);

  useEffect(() => {
    const ext = queryParams.styleNo || '';
    if (ext !== localStyleNo) setLocalStyleNo(ext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams.styleNo]);

  const flushStyleNo = (value: string) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    onQueryChange({ ...latestParamsRef.current, styleNo: value || undefined });
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const progressNodeOptions = [
    { label: '全部', value: '' },
    { label: '未开始', value: '未开始' },
    { label: '纸样开发中', value: '纸样开发中' },
    { label: '纸样完成', value: '纸样完成' },
    { label: '样衣制作中', value: '样衣制作中' },
    { label: '样衣完成', value: '样衣完成' },
    { label: '开发样报废', value: '开发样报废' },
  ];

  return (
    <div className="filter-card mb-sm" style={{ background: 'var(--color-bg-container)', padding: 12, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
        {/* 左侧：搜索条件 */}
        <Space className="style-filter-inline" size={12} wrap>
          <Input
            value={localStyleNo}
            onChange={(e) => {
              const value = e.target.value;
              setLocalStyleNo(value);
              if (!value) {
                flushStyleNo('');
                onSearch();
                return;
              }
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                onQueryChange({ ...latestParamsRef.current, styleNo: value || undefined });
                onSearch();
              }, DEBOUNCE_MS);
            }}
            onPressEnter={() => {
              flushStyleNo(localStyleNo);
              onSearch();
            }}
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
          {/* 以图搜款已集成到 Cmd+K 全局搜索，此处不再重复 */}
        </Space>

        {/* 右侧：额外的操作按钮（如新建、切换视图） */}
        {extra && <Space wrap>{extra}</Space>}
      </div>

    </div>
  );
};

export default StyleFilterPanel;
