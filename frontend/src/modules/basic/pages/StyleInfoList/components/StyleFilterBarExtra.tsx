import React from 'react';
import { Button, Segmented } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
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
  openColumnSettings: () => void;
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
  openColumnSettings,
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
      <Segmented
        value={viewMode}
        onChange={(v) => {
          setViewMode(v as StyleViewMode);
          setQueryParams((prev: any) => ({ ...prev, page: 1 }));
        }}
        options={[
          { value: 'list', icon: <UnorderedListOutlined />, title: '表格视图' },
          { value: 'card', icon: <AppstoreOutlined />, title: '卡片视图' },
          { value: 'smart', icon: <RadarChartOutlined />, title: '智能视图' },
        ]}
      />
      <Button icon={<SettingOutlined />} onClick={openColumnSettings}>
        列设置
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
