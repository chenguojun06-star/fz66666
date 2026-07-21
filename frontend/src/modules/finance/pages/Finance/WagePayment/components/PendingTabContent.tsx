import React from 'react';
import { Button, Card, Empty, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import { readPageSize } from '@/utils/pageSizeStore';
import ResizableTable from '@/components/common/ResizableTable';
import { BIZ_TYPE_OPTIONS } from '@/services/finance/wagePaymentApi';
import { exportToExcelFile } from '../helpers';

const { RangePicker } = DatePicker;

interface PendingTabContentProps {
  payableColumns: any[];
  statusFilteredPayables: any[];
  payablesLoading: boolean;
  payables: any[];
  payableBizType: string;
  setPayableBizType: (v: string) => void;
  payableDateRange: [string, string];
  setPayableDateRange: (v: [string, string]) => void;
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
              value={payableDateRange[0] && payableDateRange[1] ? [dayjs(payableDateRange[0], 'YYYY-MM-DD'), dayjs(payableDateRange[1], 'YYYY-MM-DD')] : null}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setPayableDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                } else {
                  setPayableDateRange(['', '']);
                }
                setSelectedPayableKeys([]);
              }}
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
