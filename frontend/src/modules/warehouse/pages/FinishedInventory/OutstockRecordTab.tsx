import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Space, Select, App, Modal, InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import StandardPagination from '@/components/common/StandardPagination';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { useTablePagination } from '@/hooks';
import api from '@/utils/api';
import dayjs from 'dayjs';
import { useOutstockShare } from './useOutstockShare';
import { printOutstockRecord } from './outstockPrintHelper';
import ShareLinkModal from './ShareLinkModal';

interface OutstockRecord {
  id: number;
  outstockNo: string;
  productionOrderNo?: string;
  styleNo?: string;
  styleName?: string;
  skuCode?: string;
  color?: string;
  size?: string;
  quantity: number;
  costPrice?: number;
  salesPrice?: number;
  trackingNo?: string;
  expressCompany?: string;
  outstockType?: string;
  createdByName?: string;
  createTime?: string;
  remark?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: string;
  settlementTime?: string;
}

const outstockTypeMap: Record<string, { label: string; color: string }> = {
  normal: { label: '普通出库', color: 'blue' },
  qrcode: { label: '扫码出库', color: 'green' },
  batch: { label: '批量出库', color: 'purple' },
};

const OutstockRecordTab: React.FC = () => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<OutstockRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [outstockTypeFilter, setOutstockTypeFilter] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('');
  const pagination = useTablePagination(20);
  const [total, setTotal] = useState(0);

  // 确认收款弹窗
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentRecord, setPaymentRecord] = useState<OutstockRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // 分享
  const { shareModalOpen, shareUrl, shareLoading, handleShare, handleCopyShareUrl, setShareModalOpen } = useOutstockShare(message);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post('/warehouse/finished-inventory/outstock-records', {
        page: pagination.pagination.current,
        pageSize: pagination.pagination.pageSize,
        keyword: searchText || undefined,
        outstockType: outstockTypeFilter || undefined,
        paymentStatus: paymentStatusFilter || undefined,
      });
      const data = res.data || res;
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch {
      message.error('加载出库记录失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pagination.current, pagination.pagination.pageSize, searchText, outstockTypeFilter, paymentStatusFilter, message]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleConfirmPayment = async () => {
    if (!paymentRecord || !paymentAmount || paymentAmount <= 0) {
      message.warning('请输入有效的收款金额');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await api.post('/warehouse/finished-inventory/confirm-payment', {
        id: paymentRecord.id,
        paidAmount: paymentAmount,
      });
      message.success('收款确认成功');
      setPaymentModalVisible(false);
      setPaymentRecord(null);
      setPaymentAmount(null);
      loadRecords();
    } catch {
      message.error('收款确认失败');
    } finally {
      setPaymentSubmitting(false);
    }
  };



  const paymentStatusMap: Record<string, { label: string; color: string }> = {
    unpaid: { label: '未收款', color: 'orange' },
    partial: { label: '部分收款', color: 'blue' },
    paid: { label: '已收款', color: 'green' },
  };

  const columns: ColumnsType<OutstockRecord> = [
    {
      title: '出库单号',
      dataIndex: 'outstockNo',
      width: 160,
      fixed: 'left',
      render: (text) => (
        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{text}</span>
      ),
    },
    {
      title: '款号 / 款名',
      width: 180,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.styleNo || '-'}</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)' }}>
            {record.styleName || ''}
          </div>
        </div>
      ),
    },
    {
      title: 'SKU编码',
      dataIndex: 'skuCode',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 90,
      render: (text) => text ? <Tag color="blue">{text}</Tag> : '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      width: 80,
      render: (text) => text ? <Tag color="green">{text}</Tag> : '-',
    },
    {
      title: '出库数量',
      dataIndex: 'quantity',
      width: 100,
      align: 'center',
      render: (val) => (
        <strong style={{ color: 'var(--primary-color)', fontSize: 'var(--font-size-md)' }}>
          {val ?? 0}
        </strong>
      ),
    },
    {
      title: '单价',
      width: 130,
      render: (_, record) => {
        const cost = Number(record.costPrice) || 0;
        const sale = Number(record.salesPrice) || 0;
        const profit = sale - cost;
        return (
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            <div>单价: <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{sale.toFixed(2)}</span></div>
            <div>成本: <span style={{ color: 'var(--neutral-text-secondary)' }}>¥{cost.toFixed(2)}</span></div>
            {sale > 0 && (
              <div>
                毛利: <span style={{ color: profit >= 0 ? 'var(--color-success)' : '#cf1322', fontWeight: 600 }}>
                  ¥{profit.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '客户名称',
      dataIndex: 'customerName',
      width: 120,
      render: (text) => text || <span style={{ color: 'var(--neutral-text-disabled)' }}>未填写</span>,
    },
    {
      title: '联系电话',
      dataIndex: 'customerPhone',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '出库金额',
      dataIndex: 'totalAmount',
      width: 110,
      align: 'right',
      render: (val) => val != null ? (
        <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{Number(val).toFixed(2)}</span>
      ) : '-',
    },
    {
      title: '已收金额',
      dataIndex: 'paidAmount',
      width: 110,
      align: 'right',
      render: (val) => val != null ? (
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>¥{Number(val).toFixed(2)}</span>
      ) : '-',
    },
    {
      title: '收款状态',
      dataIndex: 'paymentStatus',
      width: 100,
      align: 'center',
      render: (text) => {
        const info = paymentStatusMap[text] || { label: text || '-', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '物流信息',
      width: 180,
      render: (_, record) => {
        if (!record.trackingNo && !record.expressCompany) {
          return <span style={{ color: 'var(--neutral-text-disabled)' }}>未填写</span>;
        }
        return (
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            {record.expressCompany && <div>快递: <Tag>{record.expressCompany}</Tag></div>}
            {record.trackingNo && <div>单号: <span style={{ color: 'var(--primary-color)' }}>{record.trackingNo}</span></div>}
          </div>
        );
      },
    },
    {
      title: '出库类型',
      dataIndex: 'outstockType',
      width: 100,
      align: 'center',
      render: (text) => {
        const info = outstockTypeMap[text] || { label: text || '普通出库', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '关联订单',
      dataIndex: 'productionOrderNo',
      width: 140,
      render: (text) => text || '-',
    },
    {
      title: '操作人',
      dataIndex: 'createdByName',
      width: 90,
    },
    {
      title: '结算时间',
      dataIndex: 'settlementTime',
      width: 160,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '出库时间',
      dataIndex: 'createTime',
      width: 160,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record) => {
        const actions: RowAction[] = [];
        if (record.paymentStatus !== 'paid') {
          actions.push({
            key: 'confirmPayment',
            label: '确认收款',
            primary: true,
            onClick: () => {
              setPaymentRecord(record);
              setPaymentAmount(null);
              setPaymentModalVisible(true);
            },
          });
        }
        actions.push({
          key: 'share',
          label: '分享',
          onClick: () => handleShare(record),
        });
        actions.push({
          key: 'print',
          label: '打印',
          onClick: () => printOutstockRecord(record),
        });
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <Card
      styles={{ body: { padding: '16px 20px' } }}
      style={{ border: 'none', boxShadow: 'none' }}
    >
      <StandardToolbar
        left={
          <Space>
            <StandardSearchBar
              searchValue={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder="搜索出库单号 / 款号 / 客户名称"
            />
            <Select
              allowClear
              placeholder="出库类型"
              style={{ width: 130 }}
              value={outstockTypeFilter || undefined}
              onChange={(v) => { setOutstockTypeFilter(v ?? ''); pagination.onChange(1, pagination.pagination.pageSize); }}
            >
              <Select.Option value="normal">普通出库</Select.Option>
              <Select.Option value="qrcode">扫码出库</Select.Option>
              <Select.Option value="batch">批量出库</Select.Option>
            </Select>
            <Select
              allowClear
              placeholder="收款状态"
              style={{ width: 130 }}
              value={paymentStatusFilter || undefined}
              onChange={(v) => { setPaymentStatusFilter(v ?? ''); pagination.onChange(1, pagination.pagination.pageSize); }}
            >
              <Select.Option value="unpaid">未收款</Select.Option>
              <Select.Option value="partial">部分收款</Select.Option>
              <Select.Option value="paid">已收款</Select.Option>
            </Select>
          </Space>
        }
      />
      <ResizableTable
        storageKey="finished-inventory-outstock-records"
        columns={columns}
        dataSource={records}
        loading={loading}
        rowKey="id"
        stickyHeader
        scroll={{ x: 2400 }}
        pagination={false}
      />
      <StandardPagination
        current={pagination.pagination.current}
        pageSize={pagination.pagination.pageSize}
        total={total}
        wrapperStyle={{ paddingTop: 12 }}
        onChange={pagination.onChange}
      />

      {/* 确认收款弹窗 */}
      <Modal
        title="确认收款"
        open={paymentModalVisible}
        onCancel={() => { setPaymentModalVisible(false); setPaymentRecord(null); setPaymentAmount(null); }}
        onOk={handleConfirmPayment}
        confirmLoading={paymentSubmitting}
        okText="确认收款"
        width={480}
      >
        {paymentRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f6f8fa', padding: '12px 16px', borderRadius: 8 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--neutral-text-secondary)' }}>出库单号：</span>
                <strong>{paymentRecord.outstockNo}</strong>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--neutral-text-secondary)' }}>客户名称：</span>
                <strong>{paymentRecord.customerName || '-'}</strong>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--neutral-text-secondary)' }}>出库金额：</span>
                <span style={{ color: '#cf1322', fontWeight: 600, fontSize: 16 }}>
                  ¥{Number(paymentRecord.totalAmount || 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--neutral-text-secondary)' }}>已收金额：</span>
                <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 16 }}>
                  ¥{Number(paymentRecord.paidAmount || 0).toFixed(2)}
                </span>
              </div>
            </div>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>本次收款金额（元）</div>
              <InputNumber
                style={{ width: '100%' }}
                min={0.01}
                max={Number(paymentRecord.totalAmount || 0) - Number(paymentRecord.paidAmount || 0)}
                precision={2}
                placeholder="请输入本次收到的金额"
                value={paymentAmount}
                onChange={(v) => setPaymentAmount(v)}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--neutral-text-disabled)' }}>
                待收金额：¥{(Number(paymentRecord.totalAmount || 0) - Number(paymentRecord.paidAmount || 0)).toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 分享链接弹窗 */}
      <ShareLinkModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
        shareLoading={shareLoading}
        onCopy={handleCopyShareUrl}
      />
    </Card>
  );
};

export default OutstockRecordTab;
