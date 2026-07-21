import React from 'react';
import { Button, Card, DatePicker, Empty, Form, Input, Select, Tabs, message } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { readPageSize } from '@/utils/pageSizeStore';
import ResizableTable from '@/components/common/ResizableTable';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_MAP,
  BIZ_TYPE_OPTIONS,
} from '@/services/finance/wagePaymentApi';
import { exportToExcelFile } from '../helpers';

const { RangePicker } = DatePicker;

interface RecordsTabContentProps {
  paymentColumns: any[];
  statusFilteredPayments: any[];
  paymentsLoading: boolean;
  payments: any[];
  paymentStatusTab: string;
  setPaymentStatusTab: (v: string) => void;
  filterValuesRef: React.MutableRefObject<Record<string, any>>;
  fetchPayments: (formValues?: Record<string, any>) => void;
}

const RecordsTabContent: React.FC<RecordsTabContentProps> = ({
  paymentColumns,
  statusFilteredPayments,
  paymentsLoading,
  payments,
  paymentStatusTab,
  setPaymentStatusTab,
  filterValuesRef,
  fetchPayments,
}) => {
  return (
    <>
      {/* 快捷日期筛选 + 状态 Tab */}
      <Card className="filter-card mb-sm" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
        <Tabs
          activeKey={paymentStatusTab}
          onChange={setPaymentStatusTab}
          size="small"
          items={[
            { key: '', label: `全部 (${payments.length})` },
            { key: 'pending', label: `处理中 (${payments.filter((p: any) => p.status === 'pending' || p.status === 'processing').length})` },
            { key: 'success', label: `已成功 (${payments.filter((p: any) => p.status === 'success').length})` },
            { key: 'failed', label: `失败/取消 (${payments.filter((p: any) => p.status === 'rejected' || p.status === 'failed' || p.status === 'cancelled').length})` },
          ]}
          style={{ marginBottom: 0 }}
        />
        <div style={{ marginTop: 8 }}>
          <Form layout="inline" onFinish={(values) => { filterValuesRef.current = values; fetchPayments(values); }}>
            <Form.Item name="payeeName">
              <Input placeholder="收款方姓名" allowClear prefix={<SearchOutlined />} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="bizType">
              <Select placeholder="业务类型" allowClear style={{ width: 130 }}>
                {BIZ_TYPE_OPTIONS.filter(o => o.value).map(o => (
                  <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="status">
              <Select placeholder="状态" allowClear style={{ width: 120 }}>
                {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (
                  <Select.Option key={k} value={k}>{v.text}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="paymentMethod">
              <Select placeholder="支付方式" allowClear style={{ width: 130 }}>
                {PAYMENT_METHOD_OPTIONS.map(o => (
                  <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="dateRange">
              <RangePicker style={{ width: 240 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" ghost htmlType="submit" icon={<SearchOutlined />}>查询</Button>
            </Form.Item>
            <Form.Item>
              <Button
                ghost
                icon={<DownloadOutlined />}
                onClick={() => {
                  if (payments.length === 0) {
                    message.warning('当前没有数据可导出');
                    return;
                  }
                  exportToExcelFile(payments, [
                    { title: '支付单号', dataIndex: 'paymentNo' },
                    { title: '业务类型', dataIndex: 'bizType' },
                    { title: '收款方', dataIndex: 'payeeName' },
                    { title: '支付方式', dataIndex: 'paymentMethod' },
                    { title: '金额', dataIndex: 'amount' },
                    { title: '状态', dataIndex: 'status' },
                    { title: '业务单号', dataIndex: 'bizNo' },
                    { title: '操作人', dataIndex: 'operatorName' },
                    { title: '创建时间', dataIndex: 'createTime' }
                  ], '收支记录明细');
                }}
              >
                导出
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>

      {/* 收支记录表格 */}
      <ResizableTable
        columns={paymentColumns}
        dataSource={statusFilteredPayments}
        rowKey={(r: any) => r.id || r.paymentNo}
        loading={paymentsLoading}
        scroll={{ x: 1400 }}
        pagination={{ defaultPageSize: readPageSize(20), showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </>
  );
};

export default RecordsTabContent;
