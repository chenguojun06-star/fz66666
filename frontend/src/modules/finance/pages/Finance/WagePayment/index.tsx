import React, { useCallback, useMemo, useState } from 'react';
import { readPageSize } from '@/utils/pageSizeStore';
import { formatMoney } from '@/utils/format';
import dayjs from 'dayjs';
import { useSync } from '@/utils/syncManager';
import AccountManagementModal from './components/AccountManagementModal';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  SearchOutlined,
  PayCircleOutlined,
  AccountBookOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_MAP,
  OWNER_TYPE_OPTIONS,
  BIZ_TYPE_OPTIONS,
  BIZ_TYPE_MAP,
  wagePaymentApi,
} from '@/services/finance/wagePaymentApi';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { usePaymentColumns, methodIconMap, accountTypeIconMap } from './hooks/usePaymentColumns';
import { usePaymentData } from './hooks/usePaymentData';
import { usePayModal } from './hooks/usePayModal';
import { useAccountModal } from './hooks/useAccountModal';
import { useProofModal } from './hooks/useProofModal';
import { useWagePayment } from './useWagePayment';

const { RangePicker } = DatePicker;

export const exportToExcelFile = async (data: any[], columns: any[], filename: string) => {
    const { exportToExcel } = await import('@/utils/excelExport');
    const formattedData = data.map(item => {
        const row: any = {};
        columns.forEach((col: any) => {
            row[col.title] = item[col.dataIndex] || '';
        });
        return row;
    });
    const cols = columns.map((col: any) => ({ header: col.title, key: col.title }));
    await exportToExcel(formattedData, cols, `${filename}_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`);
};

// ============================================================
// 主组件 — 收付款中心
// ============================================================
const PaymentCenterPage: React.FC = () => {
  const { message: msg } = App.useApp();

  // ---- 数据与业务逻辑 ----
  const data = usePaymentData({ msg });
  const pay = usePayModal({ msg, fetchPayables: data.fetchPayables, fetchPayments: data.fetchPayments, reportSmartError: data.reportSmartError });
  const acct = useAccountModal({ msg, reportSmartError: data.reportSmartError, showSmartErrorNotice: data.showSmartErrorNotice, setSmartError: data.setSmartError });
  const proof = useProofModal({ msg, reportSmartError: data.reportSmartError, showSmartErrorNotice: data.showSmartErrorNotice, setSmartError: data.setSmartError, fetchPayments: data.fetchPayments, fetchPayables: data.fetchPayables });

  const { detailOpen, setDetailOpen, detailRecord, setDetailRecord } = useWagePayment();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleOpenPayModal = useCallback(() => pay.openPayModal(), [pay.openPayModal]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleClearSelectedPayableKeys = useCallback(() => data.setSelectedPayableKeys([]), [data.setSelectedPayableKeys]);

  // ---- 数据同步（45秒轮询，与 MaterialReconciliation 一致） ----
  useSync(
    'wage-payment-list',
    async () => {
      try {
        if (data.activeTab === 'pending') {
          const res: any = await wagePaymentApi.listPendingPayables(data.payableBizType || undefined);
          return { records: res?.data ?? res ?? [], tab: 'pending' };
        } else {
          const res: any = await wagePaymentApi.listPayments(data.filterValuesRef.current);
          return { records: res?.data ?? res ?? [], tab: 'records' };
        }
      } catch { return null; }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        if (newData.tab === 'pending') {
          void data.fetchPayables();
        } else {
          void data.fetchPayments();
        }
      }
    },
    { interval: 45000, enabled: !data.payablesLoading && !data.paymentsLoading && !pay.payModalOpen && !acct.accountModalOpen, pauseOnHidden: true },
  );

  const [amountDetailOpen, setAmountDetailOpen] = React.useState(false);
  const [amountDetailTarget, setAmountDetailTarget] = React.useState<any>(null);
  const [paymentStatusTab, setPaymentStatusTab] = useState<string>('');

  // ==================== 统计卡片 ====================
  // 待收付款 (payables) 统计
  const pendingStats = useMemo(() => {
    const total = data.payables.length;
    const totalAmount = data.payables.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const reconCount = data.payables.filter((p: any) => p.bizType === 'RECONCILIATION').length;
    const reimbCount = data.payables.filter((p: any) => p.bizType === 'REIMBURSEMENT').length;
    const payrollCount = data.payables.filter((p: any) => p.bizType === 'PAYROLL' || p.bizType === 'PAYROLL_SETTLEMENT').length;
    return { total, totalAmount, reconCount, reimbCount, payrollCount };
  }, [data.payables]);

  // 收支记录 (payments) 统计
  const paymentStats = useMemo(() => {
    const total = data.payments.length;
    const pendingCount = data.payments.filter((p: any) => p.status === 'pending' || p.status === 'processing').length;
    const successCount = data.payments.filter((p: any) => p.status === 'success').length;
    const rejectedCount = data.payments.filter((p: any) => p.status === 'rejected' || p.status === 'failed' || p.status === 'cancelled').length;
    const totalAmount = data.payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const successAmount = data.payments.filter((p: any) => p.status === 'success').reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    return { total, pendingCount, successCount, rejectedCount, totalAmount, successAmount };
  }, [data.payments]);

  // ---- 表格列定义 ----
  const { payableColumns, paymentColumns } = usePaymentColumns({
    openPayModal: pay.openPayModal,
    handleRejectPayable: data.handleRejectPayable,
    openAccountModal: acct.openAccountModal,
    setDetailRecord,
    setDetailOpen,
    openProofModal: proof.openProofModal,
    handleCancel: data.handleCancel,
    fetchPayments: data.fetchPayments,
    msg,
    onAmountClick: (record) => { setAmountDetailTarget(record); setAmountDetailOpen(true); },
  });

  // Tab 切换后的过滤数据
  const statusFilteredPayables = useMemo(() => data.filteredPayables, [data.filteredPayables]);

  const statusFilteredPayments = useMemo(() => {
    if (!paymentStatusTab) return data.payments;
    if (paymentStatusTab === 'pending') return data.payments.filter((p: any) => p.status === 'pending' || p.status === 'processing');
    if (paymentStatusTab === 'success') return data.payments.filter((p: any) => p.status === 'success');
    if (paymentStatusTab === 'failed') return data.payments.filter((p: any) => p.status === 'rejected' || p.status === 'failed' || p.status === 'cancelled');
    return data.payments;
  }, [data.payments, paymentStatusTab]);

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <>
        {data.showSmartErrorNotice && data.smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={data.smartError}
              onFix={() => {
                if (data.activeTab === 'pending') {
                  void data.fetchPayables();
                } else {
                  void data.fetchPayments();
                }
              }}
            />
          </Card>
        ) : null}

        {/* 页头 */}
        <Card className="page-card" size="small" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                <PayCircleOutlined style={{ marginRight: 8 }} />
                收付款中心
              </h2>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                集中管理账单汇总、待收付款、员工工资、工厂对账的收付款操作
              </span>
            </div>
            <Button type="primary" ghost icon={<DollarOutlined />} onClick={handleOpenPayModal}>
              手动发起支付
            </Button>
          </div>
        </Card>

        {/* ===== 统计卡片（顶部统一） ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待处理</span>}
              value={data.activeTab === 'pending' ? pendingStats.total : paymentStats.pendingCount}
              suffix="笔"
              valueStyle={{ color: 'var(--color-warning)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已完成</span>}
              value={data.activeTab === 'pending' ? (pendingStats.total - data.selectedPayableKeys.length) : paymentStats.successCount}
              suffix="笔"
              valueStyle={{ color: 'var(--color-primary)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已处理金额</span>}
              value={data.activeTab === 'pending' ? 0 : paymentStats.successAmount}
              precision={2}
              prefix="¥"
              valueStyle={{ color: 'var(--color-success)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
          <Card
            size="small"
            style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <Statistic
              title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额</span>}
              value={data.activeTab === 'pending' ? pendingStats.totalAmount : paymentStats.totalAmount}
              precision={2}
              prefix="¥"
              valueStyle={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 500 }}
            />
          </Card>
        </div>

        {/* Tab 切换 */}
        <Card className="page-card" style={{ border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
          <Tabs
            activeKey={data.activeTab}
            onChange={data.setActiveTab}
            destroyOnHidden={false}
            size="small"
            items={[
              {
                key: 'pending',
                label: (
                  <span>
                    <AccountBookOutlined /> 待处理 {pendingStats.total > 0 && <Tag color="red">{pendingStats.total}</Tag>}
                  </span>
                ),
                children: (
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
                              ghost={data.payableBizType !== opt.value}
                              type={data.payableBizType === opt.value ? 'primary' : 'default'}
                              onClick={() => { data.setPayableBizType(opt.value); data.setSelectedPayableKeys([]); }}
                            >
                              {opt.label}
                            </Button>
                          ))}
                          <RangePicker
                            size="small"
                            allowClear
                            value={data.payableDateRange[0] && data.payableDateRange[1] ? [dayjs(data.payableDateRange[0], 'YYYY-MM-DD'), dayjs(data.payableDateRange[1], 'YYYY-MM-DD')] : null}
                            onChange={(dates) => {
                              if (dates && dates[0] && dates[1]) {
                                data.setPayableDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                              } else {
                                data.setPayableDateRange(['', '']);
                              }
                              data.setSelectedPayableKeys([]);
                            }}
                          />
                          {data.selectedPayableKeys.length > 0 && (
                            <span style={{ color: 'var(--color-primary)' }}>
                              已选 {data.selectedPayableKeys.length} 笔
                            </span>
                          )}
                        </Space>
                        <Space size={8}>
                          {data.selectedPayableKeys.length > 0 && (
                            <>
                              <Button type="primary" ghost size="small" loading={data.batchPaySubmitting} onClick={data.handleBatchPay}>
                                批量付款
                              </Button>
                              <Button size="small" onClick={handleClearSelectedPayableKeys}>清空</Button>
                            </>
                          )}
                          <Button size="small" ghost icon={<DownloadOutlined />} onClick={() => {
                            if (data.payables.length === 0) {
                              message.warning('当前没有数据可导出');
                              return;
                            }
                            exportToExcelFile(data.payables, [
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
                      loading={data.payablesLoading}
                      scroll={{ x: 1200 }}
                      pagination={{ defaultPageSize: readPageSize(20), showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                      locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                      rowSelection={{
                        selectedRowKeys: data.selectedPayableKeys,
                        onChange: (keys) => data.setSelectedPayableKeys(keys),
                      }}
                    />
                  </>
                ),
              },
              {
                key: 'records',
                label: (
                  <span>
                    <CheckCircleOutlined /> 收支记录
                  </span>
                ),
                children: (
                  <>
                    {/* 快捷日期筛选 + 状态 Tab */}
                    <Card className="filter-card mb-sm" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
                      <Tabs
                        activeKey={paymentStatusTab}
                        onChange={setPaymentStatusTab}
                        size="small"
                        items={[
                          { key: '', label: `全部 (${data.payments.length})` },
                          { key: 'pending', label: `处理中 (${data.payments.filter((p: any) => p.status === 'pending' || p.status === 'processing').length})` },
                          { key: 'success', label: `已成功 (${data.payments.filter((p: any) => p.status === 'success').length})` },
                          { key: 'failed', label: `失败/取消 (${data.payments.filter((p: any) => p.status === 'rejected' || p.status === 'failed' || p.status === 'cancelled').length})` },
                        ]}
                        style={{ marginBottom: 0 }}
                      />
                      <div style={{ marginTop: 8 }}>
                        <Form layout="inline" onFinish={(values) => { data.filterValuesRef.current = values; data.fetchPayments(values); }}>
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
                                if (data.payments.length === 0) {
                                  message.warning('当前没有数据可导出');
                                  return;
                                }
                                exportToExcelFile(data.payments, [
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
                      loading={data.paymentsLoading}
                      scroll={{ x: 1400 }}
                      pagination={{ defaultPageSize: readPageSize(20), showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                      locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    />
                  </>
                ),
              },
            ]}
          />
        </Card>

        {/* ========================== 发起支付弹窗 ========================== */}
        <ResizableModal
          open={pay.payModalOpen}
          title={pay.currentPayable
            ? `付款 — ${BIZ_TYPE_MAP[pay.currentPayable.bizType]?.text ?? ''} · ${pay.currentPayable.bizNo}`
            : '手动发起支付'
          }
          onCancel={() => pay.setPayModalOpen(false)}
          width="40vw"
          centered
          footer={
            <Space>
              <Button onClick={() => pay.setPayModalOpen(false)}>取消</Button>
              <Button type="primary" loading={pay.paySubmitting} onClick={pay.handlePaySubmit} icon={<DollarOutlined />}>
                确认支付
              </Button>
            </Space>
          }
        >
          <div style={{ padding: '0 8px' }}>
            {/* 业务信息提示 */}
            {pay.currentPayable && (
              <Card style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Descriptions column={2}>
                  <Descriptions.Item label="业务类型">
                    <Tag color={BIZ_TYPE_MAP[pay.currentPayable.bizType]?.color}>
                      {BIZ_TYPE_MAP[pay.currentPayable.bizType]?.text}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="单据编号">{pay.currentPayable.bizNo}</Descriptions.Item>
                  <Descriptions.Item label="收款方">{pay.currentPayable.payeeName}</Descriptions.Item>
                  <Descriptions.Item label="应付金额">
                    <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(pay.currentPayable.amount)}</span>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            <Form form={pay.payForm} layout="vertical" requiredMark="optional">
              {!pay.currentPayable && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                    <Form.Item label="收款方类型" name="payeeType" rules={[{ required: true, message: '请选择收款方类型' }]}>
                      <Select options={OWNER_TYPE_OPTIONS} onChange={pay.handlePayeeTypeChange} placeholder="选择员工或工厂" />
                    </Form.Item>
                    <Form.Item label="收款方" name="payeeId" rules={[{ required: true, message: '请搜索选择收款方' }]}>
                      <Select
                        showSearch
                        filterOption={false}
                        onSearch={pay.handlePayeeSearch}
                        onChange={pay.handlePayeeSelect}
                        loading={pay.payeeSearching}
                        placeholder="输入姓名/工厂名搜索"
                        notFoundContent={pay.payeeSearching ? '搜索中...' : '无匹配结果'}
                      >
                        {pay.payeeOptions.map(p => (
                          <Select.Option key={p.id} value={p.id}>
                            <span>{p.name}</span>
                            <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8, fontSize: 14 }}>[{p.label}]{p.phone ? ` ${p.phone}` : ''}</span>
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>
                  <Form.Item name="payeeName" hidden><Input /></Form.Item>
                  <Form.Item label="业务类型" name="bizType">
                    <Select allowClear placeholder="可选">
                      {BIZ_TYPE_OPTIONS.filter(o => o.value).map(o => (
                        <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </>
              )}

              <Form.Item label="支付金额" name="amount" rules={[{ required: true, message: '请输入支付金额' }]}>
                <InputNumber prefix="¥" min={0.01} precision={2} style={{ width: '100%' }} placeholder="支付金额" />
              </Form.Item>

              <Form.Item name="paymentMethod" hidden><Input /></Form.Item>
              {/* 支付方式选择卡片 */}
              <Form.Item label="选择支付方式" required>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {PAYMENT_METHOD_OPTIONS.map(opt => (
                    <div
                      key={opt.value}
                      onClick={() => pay.handleMethodSelect(opt.value)}
                      style={{
                        border: `2px solid ${pay.selectedMethod === opt.value ? 'var(--primary-color, var(--color-primary))' : 'var(--color-border-antd)'}`,
                        borderRadius: 8,
                        padding: '16px 12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        background: pay.selectedMethod === opt.value ? 'rgba(22,119,255,0.04)' : 'var(--color-bg-base)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 16, marginBottom: 4 }}>{methodIconMap[opt.value]}</div>
                      <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    </div>
                  ))}
                </div>
              </Form.Item>

              {/* 显示选中的收款账户信息 */}
              {pay.selectedMethod && pay.selectedMethod !== 'OFFLINE' && (
                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>
                    收款账户
                    <Button
                      type="link"
                     
                      onClick={() => {
                        const pt = pay.payForm.getFieldValue('payeeType');
                        const pi = pay.payForm.getFieldValue('payeeId');
                        const pn = pay.payForm.getFieldValue('payeeName');
                        if (pt && pi) acct.openAccountModal(pt, pi, pn || '');
                      }}
                    >
                      管理账户
                    </Button>
                  </div>
                  {pay.selectedAccount ? (
                    <div>
                      {pay.selectedAccount.accountType === 'BANK' ? (
                        <Space orientation="vertical" size={2}>
                          <span>{accountTypeIconMap[pay.selectedAccount.accountType]} {pay.selectedAccount.bankName}</span>
                          <span style={{ fontFamily: 'monospace' }}>
                            {pay.selectedAccount.accountNo?.replace(/(\d{4})(?=\d)/g, '$1 ')}
                          </span>
                          <span style={{ color: 'var(--color-text-tertiary)' }}>{pay.selectedAccount.accountName}</span>
                        </Space>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          {pay.selectedAccount.qrCodeUrl ? (
                            <Image src={getFullAuthedFileUrl(pay.selectedAccount.qrCodeUrl)} width={200} alt="收款二维码" />
                          ) : (
                            <span style={{ color: 'var(--color-danger)' }}>该账户未上传收款二维码</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-warning)' }}>
                      收款方暂无{pay.selectedMethod === 'BANK' ? '银行卡' : pay.selectedMethod === 'WECHAT' ? '微信' : '支付宝'}账户，
                      <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 'inherit' }} onClick={() => {
                        const pt = pay.payForm.getFieldValue('payeeType');
                        const pi = pay.payForm.getFieldValue('payeeId');
                        const pn = pay.payForm.getFieldValue('payeeName');
                        if (pt && pi) acct.openAccountModal(pt, pi, pn || '');
                      }}>点击添加</Button>
                    </span>
                  )}
                </div>
              )}

              <Form.Item name="paymentAccountId" hidden><Input /></Form.Item>
              {pay.currentPayable && <Form.Item name="bizType" hidden><Input /></Form.Item>}
              <Form.Item name="bizId" hidden><Input /></Form.Item>
              <Form.Item name="bizNo" hidden><Input /></Form.Item>
              {pay.currentPayable && (
                <>
                  <Form.Item name="payeeType" hidden><Input /></Form.Item>
                  <Form.Item name="payeeId" hidden><Input /></Form.Item>
                  <Form.Item name="payeeName" hidden><Input /></Form.Item>
                </>
              )}

              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="支付备注" />
              </Form.Item>
            </Form>
          </div>
        </ResizableModal>

        {/* ========================== 账户管理弹窗 ========================== */}
        <AccountManagementModal
          open={acct.accountModalOpen}
          ownerName={acct.accountOwnerName}
          ownerType={acct.accountOwnerType}
          accounts={acct.accounts}
          accountsLoading={acct.accountsLoading}
          accountForm={acct.accountForm}
          accountDetailOpen={acct.accountDetailOpen}
          editingAccount={acct.editingAccount}
          qrFileList={acct.qrFileList}
          accountSaving={acct.accountSaving}
          onClose={() => acct.setAccountModalOpen(false)}
          setAccountDetailOpen={acct.setAccountDetailOpen}
          setEditingAccount={acct.setEditingAccount}
          setQrFileList={acct.setQrFileList}
          onEditAccount={acct.handleEditAccount}
          onDeleteAccount={acct.handleDeleteAccount}
          onSaveAccount={acct.handleSaveAccount}
          onUploadQrImage={acct.uploadQrImage}
        />

        {/* ========================== 支付详情弹窗 ========================== */}
        <ResizableModal
          open={detailOpen}
          title="支付详情"
          onCancel={() => setDetailOpen(false)}
          width="40vw"
          centered
          footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        >
          {detailRecord && (
            <div style={{ padding: '0 8px' }}>
              <Descriptions bordered column={2}>
                <Descriptions.Item label="支付单号">{detailRecord.paymentNo}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  {(() => {
                    const s = PAYMENT_STATUS_MAP[detailRecord.status];
                    return s ? <Tag color={s.color}>{s.text}</Tag> : '未知';
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="业务类型">
                  {(() => {
                    const t = BIZ_TYPE_MAP[detailRecord.bizType ?? ''];
                    return t ? <Tag color={t.color}>{t.text}</Tag> : detailRecord.bizType || '-';
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="业务单号">{detailRecord.bizNo || '-'}</Descriptions.Item>
                <Descriptions.Item label="收款方类型">
                  {detailRecord.payeeType === 'WORKER' ? '员工' : '工厂'}
                </Descriptions.Item>
                <Descriptions.Item label="收款方">{detailRecord.payeeName}</Descriptions.Item>
                <Descriptions.Item label="支付方式">
                  <Space>
                    {methodIconMap[detailRecord.paymentMethod]}
                    {PAYMENT_METHOD_OPTIONS.find(o => o.value === detailRecord.paymentMethod)?.label}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="金额">
                  <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(detailRecord.amount)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="操作人">{detailRecord.operatorName}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDateTime(detailRecord.createTime)}</Descriptions.Item>
                {detailRecord.paymentTime && (
                  <Descriptions.Item label="支付时间" span={2}>{formatDateTime(detailRecord.paymentTime)}</Descriptions.Item>
                )}
                {detailRecord.confirmTime && (
                  <Descriptions.Item label="确认收款时间" span={2}>{formatDateTime(detailRecord.confirmTime)}</Descriptions.Item>
                )}
                {detailRecord.paymentRemark && (
                  <Descriptions.Item label="备注" span={2}>{detailRecord.paymentRemark}</Descriptions.Item>
                )}
              </Descriptions>
              {detailRecord.paymentProof && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>支付凭证</div>
                  <Image src={getFullAuthedFileUrl(detailRecord.paymentProof)} width={200} alt="支付凭证" />
                </div>
              )}
            </div>
          )}
        </ResizableModal>

        {/* ========================== 上传凭证弹窗 ========================== */}
        <SmallModal
          open={proof.proofModalOpen}
          title="确认线下支付"
          onCancel={() => proof.setProofModalOpen(false)}
          centered
          footer={
            <Space>
              <Button onClick={() => proof.setProofModalOpen(false)}>取消</Button>
              <Button type="primary" loading={proof.proofSubmitting} onClick={proof.handleConfirmProof}>确认</Button>
            </Space>
          }
        >
          <div style={{ padding: '0 8px' }}>
            <Form form={proof.proofForm} layout="vertical">
              <Form.Item label="上传支付凭证" name="proofUrl">
                <Input placeholder="自动填充" disabled />
              </Form.Item>
              <ImageUploadBox
                value={proof.proofFileList.length > 0 ? (proof.proofFileList[0] as any)?.url || null : null}
                onChange={(url) => {
                  if (!url) {
                    proof.proofForm.setFieldsValue({ proofUrl: undefined });
                    proof.setProofFileList([]);
                  }
                }}
                enableDrop
                size={104}
                label="支付凭证"
                uploadFn={async (file) => { return await proof.uploadProofImage(file); }}
              />
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="选填" />
              </Form.Item>
            </Form>
          </div>
        </SmallModal>
      <RejectReasonModal
        open={!!data.pendingRejectPayable}
        title="驳回待收付款"
        description={data.pendingRejectPayable ? `确定驳回 ${data.pendingRejectPayable.payeeName} 的待收付款项？${BIZ_TYPE_MAP[data.pendingRejectPayable.bizType]?.text ? `\n${BIZ_TYPE_MAP[data.pendingRejectPayable.bizType].text} · ${formatMoney(data.pendingRejectPayable.amount)}` : ''}` : undefined}
        onOk={data.handleRejectPayableConfirm}
        onCancel={() => data.setPendingRejectPayable(null)}
        loading={data.rejectPayableLoading}
      />

      <ResizableModal
        title="账单明细"
        open={amountDetailOpen}
        onCancel={() => { setAmountDetailOpen(false); setAmountDetailTarget(null); }}
        footer={null}
        width="40vw"
      >
        {amountDetailTarget && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="业务类型">
              {BIZ_TYPE_MAP[amountDetailTarget.bizType]?.text || amountDetailTarget.bizType}
            </Descriptions.Item>
            <Descriptions.Item label="单据编号">{amountDetailTarget.bizNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="收款方">{amountDetailTarget.payeeName}</Descriptions.Item>
            <Descriptions.Item label="收款方类型">
              {amountDetailTarget.payeeType === 'WORKER' ? '员工' : '工厂/供应商'}
            </Descriptions.Item>
            <Descriptions.Item label="应付金额">
              <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(amountDetailTarget.amount)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="已付金额">
              <span style={{ color: '#389e0d' }}>{formatMoney(amountDetailTarget.paidAmount || 0)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{amountDetailTarget.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{formatDateTime(amountDetailTarget.createTime)}</Descriptions.Item>
            {amountDetailTarget.bizType === 'RECONCILIATION' && (
              <Descriptions.Item label="关联信息" span={2}>
                此为工厂对账单汇总金额，可在「加工厂汇总」点击总金额查看逐笔订单明细。
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </ResizableModal>
    </>
  );
};

export default PaymentCenterPage;
