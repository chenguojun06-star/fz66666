import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Space, Select, App, Button, Modal } from 'antd';
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
  outstockQuantity: number;
  costPrice?: number;
  salesPrice?: number;
  trackingNo?: string;
  expressCompany?: string;
  outstockType?: string;
  creatorName?: string;
  createTime?: string;
  remark?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: string;
  settlementTime?: string;
  approvalStatus?: string;
  approveByName?: string;
  approveTime?: string;
}

const outstockTypeMap: Record<string, { label: string; color: string }> = {
  normal: { label: '普通出库', color: 'blue' },
  qrcode: { label: '扫码出库', color: 'green' },
  batch: { label: '批量出库', color: 'purple' },
  shipment: { label: '物流出库', color: 'cyan' },
};

const OutstockRecordTab: React.FC = () => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<OutstockRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [outstockTypeFilter, setOutstockTypeFilter] = useState<string>('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string>('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [approving, setApproving] = useState(false);
  const pagination = useTablePagination(20);
  const [total, setTotal] = useState(0);

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
        approvalStatus: approvalStatusFilter || undefined,
      });
      const data = res.data || res;
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch {
      message.error('加载出库记录失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pagination.current, pagination.pagination.pageSize, searchText, outstockTypeFilter, approvalStatusFilter, message]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleApprove = (id: number) => {
    Modal.confirm({
      title: '确认审核',
      content: '审核后账单将推送至汇总，确认审核该出库记录？',
      onOk: async () => {
        setApproving(true);
        try {
          await api.post('/warehouse/finished-inventory/outstock/approve', { id: String(id) });
          message.success('审核成功，账单已推送至汇总');
          loadRecords();
        } catch {
          message.error('审核失败');
        } finally {
          setApproving(false);
        }
      },
    });
  };

  const handleBatchApprove = () => {
    if (!selectedRowKeys.length) return;
    Modal.confirm({
      title: '确认批量审核',
      content: `审核后账单将推送至汇总，确认批量审核选中的 ${selectedRowKeys.length} 条出库记录？`,
      onOk: async () => {
        setApproving(true);
        try {
          await api.post('/warehouse/finished-inventory/outstock/batch-approve', {
            ids: selectedRowKeys.map(String),
          });
          message.success(`批量审核成功，共 ${selectedRowKeys.length} 条，账单已推送至汇总`);
          setSelectedRowKeys([]);
          loadRecords();
        } catch {
          message.error('批量审核失败');
        } finally {
          setApproving(false);
        }
      },
    });
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
      dataIndex: 'outstockQuantity',
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
      dataIndex: 'salesPrice',
      width: 100,
      align: 'center' as const,
      render: (val: number) => {
        const sale = Number(val) || 0;
        return <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{sale.toFixed(2)}</span>;
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
        const map: Record<string, { label: string; color: string }> = {
          unpaid: { label: '未收款', color: 'orange' },
          partial: { label: '部分收款', color: 'blue' },
          paid: { label: '已收款', color: 'green' },
        };
        const info = map[text] || { label: text || '-', color: 'default' };
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
      dataIndex: 'creatorName',
      width: 90,
    },
    {
      title: '结算时间',
      dataIndex: 'settlementTime',
      width: 160,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '审核状态',
      dataIndex: 'approvalStatus',
      width: 100,
      align: 'center',
      render: (text) => text === 'approved'
        ? <Tag color="green">已审核</Tag>
        : <Tag color="orange">待审核</Tag>,
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
        if (record.approvalStatus !== 'approved') {
          actions.push({
            key: 'approve',
            label: '审核',
            primary: true,
            onClick: () => handleApprove(record.id),
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
              <Select.Option value="shipment">物流出库</Select.Option>
            </Select>
            <Select
              allowClear
              placeholder="审核状态"
              style={{ width: 120 }}
              value={approvalStatusFilter || undefined}
              onChange={(v) => { setApprovalStatusFilter(v ?? ''); pagination.onChange(1, pagination.pagination.pageSize); }}
            >
              <Select.Option value="pending">待审核</Select.Option>
              <Select.Option value="approved">已审核</Select.Option>
            </Select>
            {selectedRowKeys.length > 0 && (
              <Button type="primary" loading={approving} onClick={handleBatchApprove}>
                批量审核（{selectedRowKeys.length}）
              </Button>
            )}
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
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
          getCheckboxProps: (record) => ({
            disabled: record.approvalStatus === 'approved',
          }),
        }}
      />
      <StandardPagination
        current={pagination.pagination.current}
        pageSize={pagination.pagination.pageSize}
        total={total}
        wrapperStyle={{ paddingTop: 12 }}
        onChange={pagination.onChange}
      />

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
