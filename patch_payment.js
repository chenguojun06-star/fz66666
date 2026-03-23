const fs = require('fs');
const path = './frontend/src/modules/finance/pages/Finance/WagePayment/index.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Month to DateRange
content = content.replace(
    "const [payableYearMonth, setPayableYearMonth] = useState<string>('');",
    "const [payableDateRange, setPayableDateRange] = useState<[string, string]>(['', '']);"
);

content = content.replace(
    "const res = await getPendingPayables({ bizType: payableBizType, yearMonth: payableYearMonth });",
    "const res = await getPendingPayables({ bizType: payableBizType, startDate: payableDateRange[0], endDate: payableDateRange[1] });"
);

content = content.replace(
    "[payableBizType, payableYearMonth]);",
    "[payableBizType, payableDateRange]);"
);

// 2. Add DownloadOutlined
if (!content.includes('DownloadOutlined')) {
    content = content.replace(
        "HistoryOutlined } from '@ant-design/icons';",
        "HistoryOutlined, DownloadOutlined } from '@ant-design/icons';"
    );
}

// 3. Add export excel utility import
if (!content.includes('exportToExcel')) {
    content = content.replace(
        "import { usePaymentColumns, methodIconMap, accountTypeIconMap } from './hooks/usePaymentColumns';",
        "import { usePaymentColumns, methodIconMap, accountTypeIconMap } from './hooks/usePaymentColumns';\nimport { exportToExcel } from '@/utils/exportExcel';"
    );
}

// 4. Replace DatePicker with RangePicker and add Export Button
const oldDatePicker = `<span style={{ color: '#666', marginLeft: 8 }}>月份：</span>
                        <DatePicker
                          picker="month"
                          size="small"
                          placeholder="选择月份"
                          allowClear
                          value={payableYearMonth ? dayjs(payableYearMonth, 'YYYY-MM') : null}
                          onChange={(d) => {
                            setPayableYearMonth(d ? d.format('YYYY-MM') : '');
                            setSelectedPayableKeys([]);
                          }}
                        />`;
const newRangePicker = `<span style={{ color: '#666', marginLeft: 8 }}>时间范围：</span>
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
                        <Button 
                          size="small" 
                          icon={<DownloadOutlined />} 
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            if (payables.length === 0) {
                              message.warning('当前没有数据可导出');
                              return;
                            }
                            exportToExcel(payables, [
                                { title: '业务类型', dataIndex: 'bizType' },
                                { title: '单据编号', dataIndex: 'bizNo' },
                                { title: '收款方', dataIndex: 'receiverName' },
                                { title: '应付金额', dataIndex: 'payableAmount' },
                                { title: '已付金额', dataIndex: 'paidAmount' },
                                { title: '描述', dataIndex: 'description' },
                                { title: '创建时间', dataIndex: 'createTime' }
                            ], '待付款明细');
                          }}
                        >
                          导出Excel
                        </Button>`;
content = content.replace(oldDatePicker, newRangePicker);

// 5. Redesign Stats Layout
const oldStats = `<div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                      <Statistic title="待付款总额" value={pendingStats.totalAmount} precision={2} prefix="¥" styles={{ content: { fontSize: 18, color: '#cf1322' } }} />
                      <Statistic title="工厂对账" value={pendingStats.reconCount} suffix="笔" styles={{ content: { fontSize: 18 } }} />
                      <Statistic title="费用报销" value={pendingStats.reimbCount} suffix="笔" styles={{ content: { fontSize: 18 } }} />
                      <Statistic title="员工工资" value={pendingStats.payrollCount} suffix="笔" styles={{ content: { fontSize: 18 } }} />
                    </div>`;

const newStats = `<div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: 20, 
                      padding: '16px 24px', 
                      background: '#f9f9f9', 
                      borderRadius: '8px',
                      border: '1px solid #f0f0f0'
                    }}>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid #e8e8e8' }}>
                        <div style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 4 }}>待付款总额</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#cf1322' }}>¥ {Number(pendingStats.totalAmount || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid #e8e8e8' }}>
                        <div style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 4 }}>工厂对账</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#333' }}>{pendingStats.reconCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: '#8c8c8c'}}>笔</span></div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid #e8e8e8' }}>
                        <div style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 4 }}>费用报销</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#333' }}>{pendingStats.reimbCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: '#8c8c8c'}}>笔</span></div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 4 }}>员工工资</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#333' }}>{pendingStats.payrollCount || 0} <span style={{fontSize: 14, fontWeight: 'normal', color: '#8c8c8c'}}>笔</span></div>
                      </div>
                    </div>`;
content = content.replace(oldStats, newStats);

fs.writeFileSync(path, content);
console.log('Done');
