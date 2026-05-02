import React from 'react';
import { readPageSize } from '@/utils/pageSizeStore';
import dayjs from 'dayjs';
import AccountManagementModal from './components/AccountManagementModal';
import BillSummaryTab from './components/BillSummaryTab';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Image,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  DollarOutlined,
  SearchOutlined,
  UploadOutlined,
  PayCircleOutlined,
  AccountBookOutlined,
  DownloadOutlined,
  LineChartOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_MAP,
  OWNER_TYPE_OPTIONS,
  BIZ_TYPE_OPTIONS,
  BIZ_TYPE_MAP,
} from '@/services/finance/wagePaymentApi';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import PaymentDashboardTab from './components/PaymentDashboardTab';
import WageFeedbackTab from './components/WageFeedbackTab';
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

  const [amountDetailOpen, setAmountDetailOpen] = React.useState(false);
  const [amountDetailTarget, setAmountDetailTarget] = React.useState<any>(null);

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

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <>
        {data.showSmartErrorNotice && data.smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
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
        <Card className="page-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>
                <PayCircleOutlined style={{ marginRight: 8 }} />
                收付款中心
              </h2>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                集中管理账单汇总、待收付款、员工工资、工厂对账的收付款操作
              </span>
            </div>
            <Button type="primary" icon={<DollarOutlined />} onClick={() => pay.openPayModal()}>
              手动发起支付
            </Button>
          </div>
        </Card>

        {/* Tab 切换 */}
        <Card className="page-card">
          <Tabs
            activeKey={data.activeTab}
            onChange={data.setActiveTab}
            items={[
              {
                key: 'bills',
                label: (
                  <span>
                    <AccountBookOutlined /> 账单汇总
                  </span>
                ),
                children: <BillSummaryTab />,
              },
              {
                key: 'pending',
                label: (
                  <span>
                    <AccountBookOutlined /> 待收付款 {data.pendingStats.total > 0 && <Tag color="red">{data.pendingStats.total}</Tag>}
                  </span>
                ),
                children: (
                  <>
                    {/* 统计行 */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 20,
                      padding: '16px 24px',
                      background: 'var(--color-bg-container)',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border-light)'
                    }}>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>待收付款总额</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#cf1322' }}>¥ {Number(data.pendingStats.totalAmount || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>工厂对账</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>{data.pendingStats.reconCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: 'var(--color-text-tertiary)'}}>笔</span></div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>费用报销</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>{data.pendingStats.reimbCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: 'var(--color-text-tertiary)'}}>笔</span></div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>员工工资</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>{data.pendingStats.payrollCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: 'var(--color-text-tertiary)'}}>笔</span></div>
                      </div>
                    </div>

                    {/* 过滤 */}
                    <div style={{ marginBottom: 16 }}>
                      <Space wrap>
                        <span style={{ color: 'var(--color-text-secondary)' }}>业务类型：</span>
                        {BIZ_TYPE_OPTIONS.map(opt => (
                          <Button
                            key={opt.value}
                            type={data.payableBizType === opt.value ? 'primary' : 'default'}
                            size="small"
                            onClick={() => { data.setPayableBizType(opt.value); data.setSelectedPayableKeys([]); }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                        <span style={{ color: 'var(--color-text-secondary)', marginLeft: 8 }}>时间：</span>
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
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          style={{ marginLeft: 8 }}
                          onClick={() => {
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
                                { title: '描述', dataIndex: 'description' },
                                { title: '创建时间', dataIndex: 'createTime' }
                            ], '待收付款明细');
                          }}
                        >
                          导出Excel
                        </Button>
                        {data.selectedPayableKeys.length > 0 && (
                          <>
                            <span style={{ color: '#1677ff', marginLeft: 8 }}>
                              已选 {data.selectedPayableKeys.length} 笔
                              （¥{data.filteredPayables.filter(p => data.selectedPayableKeys.includes(`${p.bizType}-${p.bizId}`)).reduce((s, p) => s + Number(p.amount ?? 0), 0).toFixed(2)}）
                            </span>
                            <Button
                              type="primary"
                              size="small"
                              loading={data.batchPaySubmitting}
                              onClick={data.handleBatchPay}
                            >
                              批量付款
                            </Button>
                            <Button size="small" onClick={() => data.setSelectedPayableKeys([])}>
                              清空选择
                            </Button>
                          </>
                        )}
                      </Space>
                    </div>

                    {/* 待收付款表格 */}
                    <ResizableTable
                      columns={payableColumns}
                      dataSource={data.filteredPayables}
                      rowKey={(r) => `${r.bizType}-${r.bizId}`}
                      loading={data.payablesLoading}
                      scroll={{ x: 1200 }}
                      pagination={{ defaultPageSize: readPageSize(20), showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                      rowSelection={{
                        selectedRowKeys: data.selectedPayableKeys,
                        onChange: (keys) => data.setSelectedPayableKeys(keys),
                        selections: [
                          {
                            key: 'select-all-month',
                            text: data.payableDateRange[0] ? `全选 ${data.payableDateRange[0]} 月` : '全选当前月份',
                            onSelect: () => data.setSelectedPayableKeys(data.filteredPayables.map(p => `${p.bizType}-${p.bizId}`)),
                          },
                        ],
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
                    {/* 统计行 */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 20,
                      padding: '16px 24px',
                      background: 'var(--color-bg-container)',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border-light)'
                    }}>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>支付总额</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--color-text-primary)' }}>¥ {Number(data.paymentStats.totalAmount || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>已付金额</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#389e0d' }}>¥ {Number(data.paymentStats.successAmount || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>总笔数</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>{data.paymentStats.total || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: 'var(--color-text-tertiary)'}}>笔</span></div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 4 }}>成功</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#389e0d' }}>{data.paymentStats.successCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: 'var(--color-text-tertiary)'}}>笔</span></div>
                      </div>
                    </div>

                    {/* 过滤器 */}
                    <Form form={data.filterForm} layout="inline" onFinish={data.fetchPayments} style={{ marginBottom: 16 }}>
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
                        <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
                      </Form.Item>
                      <Form.Item>
                        <Button
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
                          导出Excel
                        </Button>
                      </Form.Item>
                    </Form>

                    {/* 收支记录表格 */}
                    <ResizableTable
                      columns={paymentColumns}
                      dataSource={data.payments}
                      rowKey="id"
                      loading={data.paymentsLoading}
                      scroll={{ x: 1400 }}
                      pagination={{ defaultPageSize: readPageSize(20), showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                    />
                  </>
                ),
              },
              {
                key: 'dashboard',
                label: (
                  <span>
                    <LineChartOutlined /> 数据看板
                  </span>
                ),
                children: <PaymentDashboardTab />,
              },
              {
                key: 'feedback',
                label: (
                  <span>
                    <MessageOutlined /> 工资结算反馈
                  </span>
                ),
                children: <WageFeedbackTab />,
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
              <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="业务类型">
                    <Tag color={BIZ_TYPE_MAP[pay.currentPayable.bizType]?.color}>
                      {BIZ_TYPE_MAP[pay.currentPayable.bizType]?.text}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="单据编号">{pay.currentPayable.bizNo}</Descriptions.Item>
                  <Descriptions.Item label="收款方">{pay.currentPayable.payeeName}</Descriptions.Item>
                  <Descriptions.Item label="应付金额">
                    <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(pay.currentPayable.amount).toFixed(2)}</span>
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
                            <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8, fontSize: 12 }}>[{p.label}]{p.phone ? ` ${p.phone}` : ''}</span>
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
                        border: `2px solid ${pay.selectedMethod === opt.value ? 'var(--primary-color, #1677ff)' : 'var(--color-border-antd)'}`,
                        borderRadius: 8,
                        padding: '16px 12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        background: pay.selectedMethod === opt.value ? 'rgba(22,119,255,0.04)' : 'var(--color-bg-base)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{methodIconMap[opt.value]}</div>
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
                      size="small"
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
                            <span style={{ color: '#ff4d4f' }}>该账户未上传收款二维码</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#faad14' }}>
                      收款方暂无{pay.selectedMethod === 'BANK' ? '银行卡' : pay.selectedMethod === 'WECHAT' ? '微信' : '支付宝'}账户，
                      <a onClick={() => {
                        const pt = pay.payForm.getFieldValue('payeeType');
                        const pi = pay.payForm.getFieldValue('payeeId');
                        const pn = pay.payForm.getFieldValue('payeeName');
                        if (pt && pi) acct.openAccountModal(pt, pi, pn || '');
                      }}>点击添加</a>
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
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="支付单号">{detailRecord.paymentNo}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  {(() => {
                    const s = PAYMENT_STATUS_MAP[detailRecord.status];
                    return s ? <Tag color={s.color}>{s.text}</Tag> : detailRecord.status;
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
                  <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(detailRecord.amount).toFixed(2)}</span>
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
              <Upload
                accept="image/*"
                listType="picture-card"
                maxCount={1}
                fileList={proof.proofFileList}
                onRemove={() => { proof.proofForm.setFieldsValue({ proofUrl: undefined }); proof.setProofFileList([]); return true; }}
                beforeUpload={(file) => { void proof.uploadProofImage(file as File); return Upload.LIST_IGNORE; }}
              >
                {proof.proofFileList.length === 0 && (
                  <div><UploadOutlined /><div style={{ marginTop: 8 }}>上传凭证</div></div>
                )}
              </Upload>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="选填" />
              </Form.Item>
            </Form>
          </div>
        </SmallModal>
      <RejectReasonModal
        open={!!data.pendingRejectPayable}
        title="驳回待收付款"
        description={data.pendingRejectPayable ? `确定驳回 ${data.pendingRejectPayable.payeeName} 的待收付款项？${BIZ_TYPE_MAP[data.pendingRejectPayable.bizType]?.text ? `\n${BIZ_TYPE_MAP[data.pendingRejectPayable.bizType].text} · ¥${Number(data.pendingRejectPayable.amount).toFixed(2)}` : ''}` : undefined}
        onOk={data.handleRejectPayableConfirm}
        onCancel={() => data.setPendingRejectPayable(null)}
        loading={data.rejectPayableLoading}
      />

      <ResizableModal
        title="账单明细"
        open={amountDetailOpen}
        onCancel={() => { setAmountDetailOpen(false); setAmountDetailTarget(null); }}
        footer={null}
        width={600}
      >
        {amountDetailTarget && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="业务类型">
              {BIZ_TYPE_MAP[amountDetailTarget.bizType]?.text || amountDetailTarget.bizType}
            </Descriptions.Item>
            <Descriptions.Item label="单据编号">{amountDetailTarget.bizNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="收款方">{amountDetailTarget.payeeName}</Descriptions.Item>
            <Descriptions.Item label="收款方类型">
              {amountDetailTarget.payeeType === 'WORKER' ? '员工' : '工厂/供应商'}
            </Descriptions.Item>
            <Descriptions.Item label="应付金额">
              <span style={{ fontWeight: 600, color: '#cf1322' }}>¥{Number(amountDetailTarget.amount).toFixed(2)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="已付金额">
              <span style={{ color: '#389e0d' }}>¥{Number(amountDetailTarget.paidAmount || 0).toFixed(2)}</span>
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
