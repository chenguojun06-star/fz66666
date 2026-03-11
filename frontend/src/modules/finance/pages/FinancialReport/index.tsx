import React, { useCallback, useState } from 'react';
import {
  App, Button, Card, Col, DatePicker, Descriptions, Row,
  Segmented, Space, Spin, Statistic, Table, Typography,
} from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import {
  financialReportApi,
  type ProfitReportData,
  type BalanceSheetData,
  type CashFlowData,
} from '@/services/finance/financialReportApi';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const fmtMoney = (v?: number) => `¥ ${(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

const FinancialReportPage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('profit');
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);
  const [profitData, setProfitData] = useState<ProfitReportData | null>(null);
  const [balanceData, setBalanceData] = useState<BalanceSheetData | null>(null);
  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);

  const fetchReport = useCallback(async (tab?: string) => {
    const t = tab || activeTab;
    setLoading(true);
    try {
      if (t === 'profit') {
        const res = await financialReportApi.profitReport(dateRange[0], dateRange[1]);
        if (res.code === 200) setProfitData(res.data);
      } else if (t === 'balance') {
        const res = await financialReportApi.balanceSheet(dateRange[0], dateRange[1]);
        if (res.code === 200) setBalanceData(res.data);
      } else {
        const res = await financialReportApi.cashFlow(dateRange[0], dateRange[1]);
        if (res.code === 200) setCashFlowData(res.data);
      }
    } catch (err: any) {
      message.error(`报表加载失败: ${err?.message || '请检查网络'}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateRange, message]);

  const handleRangeChange = (_: unknown, ds: [string, string]) => setDateRange(ds);

  const renderProfit = () => {
    if (!profitData) return <Text type="secondary">请选择日期后点击查询</Text>;
    const d = profitData;
    const items = [
      { label: '销售收入（订单结算）', value: d.revenue },
      { label: '电商销售收入', value: d.ecRevenue },
      { label: '总收入', value: d.totalRevenue },
      { label: '材料成本', value: d.materialCost },
      { label: '人工成本', value: d.laborCost },
      { label: '费用报销', value: d.expenseCost },
      { label: '总成本', value: d.totalCost },
      { label: '毛利润', value: d.grossProfit },
    ];
    return (
      <>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Statistic title="总收入" value={d.totalRevenue || 0} precision={2} prefix="¥" /></Col>
          <Col span={6}><Statistic title="总成本" value={d.totalCost || 0} precision={2} prefix="¥" /></Col>
          <Col span={6}><Statistic title="毛利润" value={d.grossProfit || 0} precision={2} prefix="¥" valueStyle={{ color: (d.grossProfit || 0) >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
          <Col span={6}><Statistic title="毛利率" value={d.grossProfitRate || 0} precision={2} suffix="%" valueStyle={{ color: (d.grossProfitRate || 0) >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
        </Row>
        <Table
          dataSource={items.map((it, i) => ({ key: i, ...it }))}
          columns={[
            { title: '项目', dataIndex: 'label', width: 200 },
            { title: '金额', dataIndex: 'value', width: 200, render: fmtMoney },
          ]}
          pagination={false}
          size="small"
          bordered
        />
      </>
    );
  };

  const renderBalance = () => {
    if (!balanceData) return <Text type="secondary">请选择日期后点击查询</Text>;
    const d = balanceData;
    return (
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="货币资金">{fmtMoney(d.cashAndBank)}</Descriptions.Item>
        <Descriptions.Item label="应收账款">{fmtMoney(d.accountsReceivable)}</Descriptions.Item>
        <Descriptions.Item label="存货">{fmtMoney(d.inventory)}</Descriptions.Item>
        <Descriptions.Item label="总资产">{fmtMoney(d.totalAssets)}</Descriptions.Item>
        <Descriptions.Item label="应付账款">{fmtMoney(d.accountsPayable)}</Descriptions.Item>
        <Descriptions.Item label="总负债">{fmtMoney(d.totalLiabilities)}</Descriptions.Item>
        <Descriptions.Item label="所有者权益">{fmtMoney(d.equity)}</Descriptions.Item>
      </Descriptions>
    );
  };

  const renderCashFlow = () => {
    if (!cashFlowData) return <Text type="secondary">请选择日期后点击查询</Text>;
    const d = cashFlowData;
    const items = [
      { label: '经营活动流入', value: d.operatingInflow },
      { label: '经营活动流出', value: d.operatingOutflow },
      { label: '经营活动净现金流', value: d.operatingNet },
      { label: '投资活动净现金流', value: d.investingNet },
      { label: '筹资活动净现金流', value: d.financingNet },
      { label: '现金净增加额', value: d.netCashFlow },
    ];
    return (
      <>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}><Statistic title="经营净现金流" value={d.operatingNet || 0} precision={2} prefix="¥" /></Col>
          <Col span={8}><Statistic title="投资净现金流" value={d.investingNet || 0} precision={2} prefix="¥" /></Col>
          <Col span={8}><Statistic title="现金净增加额" value={d.netCashFlow || 0} precision={2} prefix="¥" valueStyle={{ color: (d.netCashFlow || 0) >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
        </Row>
        <Table
          dataSource={items.map((it, i) => ({ key: i, ...it }))}
          columns={[
            { title: '项目', dataIndex: 'label', width: 200 },
            { title: '金额', dataIndex: 'value', width: 200, render: fmtMoney },
          ]}
          pagination={false}
          size="small"
          bordered
        />
      </>
    );
  };

  return (
    <Layout>
      <Card
        title="财务报表"
        extra={
          <Space>
            <RangePicker
              defaultValue={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
              onChange={handleRangeChange as any}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchReport()} loading={loading}>
              查询
            </Button>
          </Space>
        }
      >
        <Segmented
          value={activeTab}
          onChange={(v) => { setActiveTab(v as string); fetchReport(v as string); }}
          options={[
            { label: '利润表', value: 'profit' },
            { label: '资产负债表', value: 'balance' },
            { label: '现金流量表', value: 'cashFlow' },
          ]}
          style={{ marginBottom: 16 }}
        />

        <Spin spinning={loading}>
          {activeTab === 'profit' && renderProfit()}
          {activeTab === 'balance' && renderBalance()}
          {activeTab === 'cashFlow' && renderCashFlow()}
        </Spin>
      </Card>
    </Layout>
  );
};

export default FinancialReportPage;
