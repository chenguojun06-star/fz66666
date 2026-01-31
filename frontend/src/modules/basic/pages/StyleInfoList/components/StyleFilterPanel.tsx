import React from 'react';
import { Button, Card, Input, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { StyleQueryParams } from '@/types/style';

interface StyleFilterPanelProps {
  queryParams: Partial<StyleQueryParams>;
  onQueryChange: (params: Partial<StyleQueryParams>) => void;
  onSearch: () => void;
  loading?: boolean;
}

/**
 * 款式信息筛选面板
 * 包含款号、款名搜索
 */
const StyleFilterPanel: React.FC<StyleFilterPanelProps> = ({
  queryParams,
  onQueryChange,
  onSearch,
  loading = false
}) => {
  const handleStyleNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onQueryChange({ ...queryParams, styleNo: e.target.value });
  };

  const handleStyleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onQueryChange({ ...queryParams, styleName: e.target.value });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <Card size="small" className="filter-card mb-sm">
      <Space wrap>
        <Input
          placeholder="搜索款号"
          prefix={<SearchOutlined />}
          style={{ width: 180 }}
          allowClear
          value={queryParams.styleNo}
          onChange={handleStyleNoChange}
          onPressEnter={handleKeyPress}
          disabled={loading}
        />
        <Input
          placeholder="搜索款名"
          style={{ width: 220 }}
          allowClear
          value={queryParams.styleName}
          onChange={handleStyleNameChange}
          onPressEnter={handleKeyPress}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={onSearch}
          loading={loading}
        >
          查询
        </Button>
      </Space>
    </Card>
  );
};

export default StyleFilterPanel;
