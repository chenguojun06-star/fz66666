import React from 'react';
import { Button } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  AppstoreOutlined,
  RadarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { StyleViewMode } from '../hooks/useStyleViewMode';

interface StyleFilterBarExtraProps {
  loading: boolean;
  dateSortAsc: boolean;
  setDateSortAsc: React.Dispatch<React.SetStateAction<boolean>>;
  viewMode: StyleViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<StyleViewMode>>;
  setQueryParams: React.Dispatch<React.SetStateAction<any>>;
  onRefresh: () => void;
  onNavigateNew: () => void;
  onNavigateFieldConfig: () => void;
}

const StyleFilterBarExtra: React.FC<StyleFilterBarExtraProps> = ({
  loading,
  dateSortAsc,
  setDateSortAsc,
  viewMode,
  setViewMode,
  setQueryParams,
  onRefresh,
  onNavigateNew,
  onNavigateFieldConfig,
}) => {
  return (
    <>
      <Button onClick={onRefresh} loading={loading}>
        刷新
      </Button>
      <Button
        icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        onClick={() => setDateSortAsc((v) => !v)}
        title={dateSortAsc ? '按时间升序' : '按时间降序'}
      />
      <Button
        icon={viewMode === 'smart' ? <AppstoreOutlined /> : <RadarChartOutlined />}
        onClick={() => {
          const next = viewMode === 'smart' ? 'card' : 'smart';
          setViewMode(next);
          setQueryParams((prev: any) => ({ ...prev, page: 1 }));
        }}
      >
        {viewMode === 'smart' ? '卡片视图' : '智能视图'}
      </Button>
      <Button type="primary" onClick={onNavigateNew}>
        新建
      </Button>
      <Button
        type="link"
        size="small"
        icon={<SettingOutlined />}
        onClick={onNavigateFieldConfig}
        title="配置本页显示哪些字段、字段顺序、字段标签"
      >
        字段配置
      </Button>
    </>
  );
};

export default StyleFilterBarExtra;
