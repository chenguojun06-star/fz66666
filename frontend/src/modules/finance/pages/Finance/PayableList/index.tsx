import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Input, Row, Select, Space, Statistic } from 'antd';
import {
  CheckCircleOutlined, DollarOutlined, ExclamationCircleOutlined,
  PlusOutlined, WarningOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { Payable } from '@/services/finance/payableApi';
import { toMoneyLocale } from '@/utils/format';
import { confirmDelete } from '@/utils/confirm';
import CreatePayableModal from './components/CreatePayableModal';
import MarkPaidModal from './components/MarkPaidModal';
import PayableDetailModal from './components/PayableDetailModal';
import { STATUS_OPTIONS } from './helpers';
import { buildColumns } from './columns';
import { usePayableListData } from './usePayableListData';

const PayableList: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Payable | null>(null);

  const {
    records,
    total,
    loading,
    stats,
    statusFilter,
    keyword,
    pagination,
    detailOpen,
    detailPayableId,
    setStatusFilter,
    setKeyword,
    setPagination,
    fetchList,
    fetchStats,
    openPayableDetail,
    closePayableDetail,
  } = usePayableListData();

  const handleDelete = (record: Payable) => {
    confirmDelete(`应付单「${record.payableNo}」`, async () => {
      fetchList(pagination.current);
      fetchStats();
    });
  };

  const handleMarkPaid = (record: Payable) => {
    setActiveRecord(record);
    setPaidOpen(true);
  };

  const columns = useMemo(
    () => buildColumns({
      openPayableDetail,
      handleDelete,
      onMarkPaid: handleMarkPaid,
    }),
    [openPayableDetail],
  );

  const totalAmount = records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const refreshAfterMutation = () => {
    fetchList(pagination.current);
    fetchStats();
  };

  return (
    <>
      <div style={{ padding: 24 }}>
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="待付款合计"
                value={Number(stats.pendingAmount)}
                precision={2}
                prefix={<DollarOutlined />}
                styles={{ content: { color: 'var(--color-primary)' } }}
                formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已付款金额"
                value={Number(stats.paidAmount)}
                precision={2}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: 'var(--color-success)' } }}
                formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="逾期笔数"
                value={stats.overdueCount}
                prefix={<ExclamationCircleOutlined />}
                styles={{ content: { color: 'var(--color-warning)' } }}
                suffix="笔"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="合计金额"
                value={totalAmount}
                precision={2}
                prefix={<DollarOutlined />}
                styles={{ content: { color: 'var(--color-text-primary)' } }}
                formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
              />
            </Card>
          </Col>
        </Row>

        {stats.overdueCount > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            title={`有 ${stats.overdueCount} 笔应付款已逾期，共 ¥${toMoneyLocale(Number(stats.overdueAmount))}，请及时处理。`}
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Space>
                <Select
                  value={statusFilter}
                  onChange={v => {
                    setStatusFilter(v);
                    setPagination(p => ({ ...p, current: 1 }));
                    fetchList(1, v, keyword);
                  }}
                  style={{ width: 140 }}
                  options={STATUS_OPTIONS}
                />
                <Input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onPressEnter={() => fetchList(1, statusFilter, keyword)}
                  placeholder="单号/供应商/订单"
                  style={{ width: 220 }}
                  allowClear
                />
                <Button onClick={() => fetchList(1, statusFilter, keyword)}>
                  查询
                </Button>
              </Space>
            </Col>
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建应付单
              </Button>
            </Col>
          </Row>
        </Card>

        <Card styles={{ body: { padding: 0 } }}>
          <ResizableTable
            rowKey="id"
            columns={columns}
            dataSource={records}
            loading={loading}
            stickyHeader
            scroll={{ x: 1400 }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              showTotal: t => `共 ${t} 条`,
            }}
            onChange={p => {
              const page = (p as any).current ?? 1;
              setPagination({ current: page, pageSize: (p as any).pageSize ?? 20 });
              fetchList(page, statusFilter, keyword);
            }}
            showExport={true}
            exportFilename="应付账款.xlsx"
            emptyDescription="暂无应付账款记录"
            emptyActionText="去创建应付单"
            onEmptyAction={() => setCreateOpen(true)}
          />
        </Card>

        <CreatePayableModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={refreshAfterMutation}
        />

        <MarkPaidModal
          open={paidOpen}
          record={activeRecord}
          onClose={() => { setPaidOpen(false); setActiveRecord(null); }}
          onSuccess={refreshAfterMutation}
        />
        <PayableDetailModal
          open={detailOpen}
          payableId={detailPayableId}
          onClose={closePayableDetail}
        />
      </div>
    </>
  );
};

export default PayableList;
