import React from 'react';
import { Button, Card, Empty, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { DatePicker, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/plugin/quarterOfYear'; // 启用 quarter 类型（main.tsx 已 extend）
import { readPageSize } from '@/utils/pageSizeStore';
import ResizableTable from '@/components/common/ResizableTable';
import { BIZ_TYPE_OPTIONS } from '@/services/finance/wagePaymentApi';
import { exportToExcelFile } from '../helpers';

const { RangePicker } = DatePicker;

// 快捷预设（与 RangePicker 配合，用户也可自定义日期范围）
const DATE_PRESETS = [
  { label: '今天', value: [dayjs(), dayjs()] as [Dayjs, Dayjs] },
  { label: '本周', value: [dayjs().startOf('week'), dayjs().endOf('week')] as [Dayjs, Dayjs] },
  { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] as [Dayjs, Dayjs] },
  { label: '本季度', value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] as [Dayjs, Dayjs] },
  { label: '近7天', value: [dayjs().subtract(7, 'day'), dayjs()] as [Dayjs, Dayjs] },
  { label: '近30天', value: [dayjs().subtract(30, 'day'), dayjs()] as [Dayjs, Dayjs] },
  { label: '本年', value: [dayjs().startOf('year'), dayjs().endOf('year')] as [Dayjs, Dayjs] },
];

interface PendingTabContentProps {
  payableColumns: any[];
  statusFilteredPayables: any[];
  payablesLoading: boolean;
  payables: any[];
  payableBizType: string;
  setPayableBizType: (v: string) => void;
  payableDateRange: [Dayjs, Dayjs] | null;
  setPayableDateRange: (v: [Dayjs, Dayjs] | null) => void;
  selectedPayableKeys: React.Key[];
  setSelectedPayableKeys: (keys: React.Key[]) => void;
  batchPaySubmitting: boolean;
  handleBatchPay: () => void;
  handleClearSelectedPayableKeys: () => void;
}

const PendingTabContent: React.FC<PendingTabContentProps> = ({
  payableColumns,
  statusFilteredPayables,
  payablesLoading,
  payables,
  payableBizType,
  setPayableBizType,
  payableDateRange,
  setPayableDateRange,
  selectedPayableKeys,
  setSelectedPayableKeys,
  batchPaySubmitting,
  handleBatchPay,
  handleClearSelectedPayableKeys,
}) => {
  return (
    <>
      {/* 快捷筛选区 */}
      <Card className="filter-card mb-sm" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space size={8} wrap>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              共 {statusFilteredPayables.length} 笔
            </span>
            {BIZ_TYPE_OPTIONS.filter(o => o.value).map(opt => (
              <Button
                key={opt.value}
                size="small"
                ghost={payableBizType !== opt.value}
                type={payableBizType === opt.value ? 'primary' : 'default'}
                onClick={() => { setPayableBizType(opt.value); setSelectedPayableKeys([]); }}
              >
                {opt.label}
              </Button>
            ))}
            <RangePicker
              size="small"
              allowClear
              presets={DATE_PRESETS}
              value={payableDateRange}
              onChange={(dates) => {
                setPayableDateRange(dates as [Dayjs, Dayjs] | null);
                setSelectedPayableKeys([]);
              }}
              placeholder={['开始日期', '结束日期']}
              style={{ width: 260 }}
            />
            {selectedPayableKeys.length > 0 && (
              <span style={{ color: 'var(--color-primary)' }}>
                已选 {selectedPayableKeys.length} 笔
              </span>
            )}
          </Space>
          <Space size={8}>
            {selectedPayableKeys.length > 0 && (
              <>
                <Button type="primary" ghost size="small" loading={batchPaySubmitting} onClick={handleBatchPay}>
                  批量付款
                </Button>
                <Button size="small" onClick={handleClearSelectedPayableKeys}>清空</Button>
              </>
            )}
            <Button size="small" ghost icon={<DownloadOutlined />} onClick={() => {
              if (payables.length === 0) {
                message.warning('当前没有数据可导出');
                return;
              }
              exportToExcelFile(payables, [
                { title: '业务类型', dataIndex: 'bizType' },
                { title: '单据编号', dataIndex: 'bizNo' },
                { title: '收款方', dataIndex: 'receiverName' },
                { title: '应付金额', dataIndex: 'amount' },
                { title: '已付金额', dataIndex: 'paidAmount' },
                { title: '创建时间', dataIndex: 'createTime' }
              ], '待收付款明细');
            }}>
              导出
            </Button>
          </Space>
        </div>
      </Card>

      {/* 待收付款表格 */}
      <ResizableTable
        columns={payableColumns}
        dataSource={statusFilteredPayables}
        rowKey={(r: any) => `${r.bizType}-${r.bizId}`}
        loading={payablesLoading}
        scroll={{ x: 1200 }}
        pagination={{ defaultPageSize: readPageSize(20), showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        rowSelection={{
          selectedRowKeys: selectedPayableKeys,
          onChange: (keys) => setSelectedPayableKeys(keys),
        }}
      />
    </>
  );
};

export default PendingTabContent;
