import React from 'react';
import { Button, Card, Dropdown, Form, Input, Radio, Space, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  MoreOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { FactorySummaryStats } from '../useFactorySummaryData';

interface Props {
  form: FormInstance;
  loading: boolean;
  dataCount: number;
  stats: FactorySummaryStats;
  selectedRowKeysCount: number;
  presetValue: string;
  statusTab: string;
  batchApproveLoading: boolean;
  exportLoading: boolean;
  onPresetChange: (e: any) => void;
  onClearPreset: () => void;
  onStatusTabChange: (key: string) => void;
  onSubmitSearch: () => void;
  onResetSearch: () => void;
  onBatchApprove: () => void;
  onPrintStatement: () => void;
  onExport: () => void;
  onRefresh: () => void;
}

const FilterToolbar: React.FC<Props> = ({
  form,
  loading,
  dataCount,
  stats,
  selectedRowKeysCount,
  presetValue,
  statusTab,
  batchApproveLoading,
  exportLoading,
  onPresetChange,
  onClearPreset,
  onStatusTabChange,
  onSubmitSearch,
  onResetSearch,
  onBatchApprove,
  onPrintStatement,
  onExport,
  onRefresh,
}) => {
  const searchFields = (
    <Form form={form} layout="inline" onFinish={onSubmitSearch}>
      <Form.Item name="factoryName">
        <Input placeholder="工厂名称" allowClear style={{ width: 160 }} />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>查询</Button>
          <Button onClick={() => { form.resetFields(); onResetSearch(); }} disabled={loading}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );

  return (
    <Card className="filter-card mb-sm" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
      <div style={{ marginBottom: 8 }}>
        <Space size={12} wrap>
          <Radio.Group value={presetValue} onChange={onPresetChange} optionType="button" buttonStyle="solid" size="small">
            <Radio.Button value="today">今天</Radio.Button>
            <Radio.Button value="week">本周</Radio.Button>
            <Radio.Button value="month">本月</Radio.Button>
            <Radio.Button value="year">本年</Radio.Button>
          </Radio.Group>
          <Button size="small" onClick={onClearPreset}>清除日期</Button>
        </Space>
      </div>
      <Tabs
        activeKey={statusTab}
        onChange={onStatusTabChange}
        size="small"
        items={[
          { key: '', label: `全部 (${dataCount})` },
          { key: 'pending', label: `待推送 (${stats.pendingCount})` },
          { key: 'approved', label: `已推送 (${stats.approvedCount})` },
        ]}
        style={{ marginBottom: 0 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <Space size={8} wrap>
          {searchFields}
        </Space>
        <Space size={8}>
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {selectedRowKeysCount > 0 ? `已选 ${selectedRowKeysCount} 个` : `共 ${dataCount} 个工厂`}
          </span>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<CheckCircleOutlined />}
            disabled={selectedRowKeysCount === 0}
            onClick={onBatchApprove}
            loading={batchApproveLoading}
          >
            批量终审推送 ({selectedRowKeysCount})
          </Button>
          <Button
            size="small"
            ghost
            icon={<PrinterOutlined />}
            disabled={selectedRowKeysCount === 0}
            onClick={onPrintStatement}
          >
            打印对账单
          </Button>
          <Button
            size="small"
            ghost
            icon={<DownloadOutlined />}
            onClick={onExport}
            disabled={dataCount === 0}
            loading={exportLoading}
          >
            导出汇总
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'refresh', label: '刷新', icon: <ReloadOutlined />, onClick: onRefresh },
              ],
            }}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      </div>
    </Card>
  );
};

export default FilterToolbar;
