import React, { useMemo } from 'react';
import { Alert, Button, Card, Col, Input, Row, Select, Space, Statistic } from 'antd';
import {
  CheckCircleOutlined, DollarOutlined, ExclamationCircleOutlined,
  PlusOutlined, WarningOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import CreateReceivableModal from './components/CreateReceivableModal';
import MarkReceivedModal from './components/MarkReceivedModal';
import ReceivableDetailModal from './components/ReceivableDetailModal';
import { toMoneyLocale, formatMoney } from '@/utils/format';
import { useReceivableData } from './hooks/useReceivableData';
import { buildColumns } from './columns';
import { STATUS_FILTER_OPTIONS, SOURCE_BIZ_TYPE_OPTIONS } from './helpers';

const ReceivableList: React.FC = () => {
  const {
    records,
    total,
    loading,
    stats,
    statusFilter,
    keyword,
    sourceBizType,
    sourceBizNo,
    setStatusFilter,
    setKeyword,
    setSourceBizType,
    setSourceBizNo,
    pagination,
    setPagination,
    createOpen,
    setCreateOpen,
    receiveOpen,
    activeRecord,
    detailOpen,
    detailReceivableId,
    fetchList,
    refreshCurrent,
    goToMaterialPickup,
    openReceivableDetail,
    closeReceivableDetail,
    openReceiveModal,
    closeReceiveModal,
    handleDelete,
  } = useReceivableData();

  const columns = useMemo(
    () => buildColumns({
      openReceivableDetail,
      goToMaterialPickup,
      handleDelete,
      openReceiveModal,
    }),
    [openReceivableDetail, goToMaterialPickup, handleDelete, openReceiveModal],
  );

  return (
    <>
      <div style={{ padding: 24 }}>
        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="待收款合计"
                value={Number(stats.totalPending)}
                precision={2}
                prefix={<DollarOutlined />}
                styles={{ content: { color: 'var(--color-primary)' } }}
                formatter={v => formatMoney(Number(v))}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="逾期未收合计"
                value={Number(stats.totalOverdue)}
                precision={2}
                prefix={<WarningOutlined />}
                styles={{ content: { color: 'var(--color-danger)' } }}
                formatter={v => formatMoney(Number(v))}
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
                title="本月新增应收"
                value={stats.newThisMonth}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: 'var(--color-success)' } }}
                suffix="笔"
              />
            </Card>
          </Col>
        </Row>

        {/* 逾期提示 */}
        {stats.overdueCount > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            title={`有 ${stats.overdueCount} 笔应收款已逾期未收，共 ¥${toMoneyLocale(Number(stats.totalOverdue))}，请及时催款。`}
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        {/* 过滤栏 */}
        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Space>
                <Select
                  value={statusFilter}
                  onChange={v => {
                    setStatusFilter(v);
                    setPagination(p => ({ ...p, current: 1 }));
                    fetchList(1, v, keyword, sourceBizType, sourceBizNo);
                  }}
                  style={{ width: 140 }}
                  options={STATUS_FILTER_OPTIONS}
                />
                <Select
                  value={sourceBizType}
                  onChange={v => {
                    setSourceBizType(v);
                    setPagination(p => ({ ...p, current: 1 }));
                    fetchList(1, statusFilter, keyword, v, sourceBizNo);
                  }}
                  style={{ width: 160 }}
                  options={SOURCE_BIZ_TYPE_OPTIONS}
                />
                <Input
                  value={sourceBizNo}
                  onChange={e => setSourceBizNo(e.target.value)}
                  onPressEnter={() => fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo)}
                  placeholder="来源单号"
                  style={{ width: 180 }}
                  allowClear
                />
                <Input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onPressEnter={() => fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo)}
                  placeholder="单号/客户/订单"
                  style={{ width: 220 }}
                  allowClear
                />
                <Button onClick={() => fetchList(1, statusFilter, keyword, sourceBizType, sourceBizNo)}>
                  查询
                </Button>
              </Space>
            </Col>
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建应收单
              </Button>
            </Col>
          </Row>
        </Card>

        {/* 表格 */}
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
              fetchList(page, statusFilter, keyword, sourceBizType, sourceBizNo);
            }}

          />
        </Card>

        {/* 新建弹窗 */}
        <CreateReceivableModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={refreshCurrent}
        />

        {/* 登记到账弹窗 */}
        <MarkReceivedModal
          open={receiveOpen}
          record={activeRecord}
          onClose={closeReceiveModal}
          onSuccess={refreshCurrent}
        />
        <ReceivableDetailModal
          open={detailOpen}
          receivableId={detailReceivableId}
          onClose={closeReceivableDetail}
        />
      </div>
    </>
  );
};

export default ReceivableList;
