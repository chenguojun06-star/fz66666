import React from 'react';
import { Button, Card, DatePicker, Dropdown, Form, Input, Space, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  MoreOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { FactorySummaryStats } from '../useFactorySummaryData';

const { RangePicker } = DatePicker;

// 快捷预设（与 RangePicker 配合，用户也可自定义日期）
const DATE_PRESETS = [
  { label: '今天', value: [dayjs(), dayjs()] as [Dayjs, Dayjs] },
  { label: '本周', value: [dayjs().startOf('week'), dayjs().endOf('week')] as [Dayjs, Dayjs] },
  { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] as [Dayjs, Dayjs] },
  { label: '本季度', value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] as [Dayjs, Dayjs] },
  { label: '本年', value: [dayjs().startOf('year'), dayjs().endOf('year')] as [Dayjs, Dayjs] },
];

interface Props {
  form: FormInstance;
  loading: boolean;
  dataCount: number;
  stats: FactorySummaryStats;
  selectedRowKeysCount: number;
  statusTab: string;
  batchApproveLoading: boolean;
  exportLoading: boolean;
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
  statusTab,
  batchApproveLoading,
  exportLoading,
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
      <Form.Item name="dateRange">
        <RangePicker
          allowClear
          presets={DATE_PRESETS}
          placeholder={['开始日期', '结束日期']}
          style={{ width: 260 }}
        />
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
