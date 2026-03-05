/**
 * 我的账单 Tab — 租户用户查看自己的套餐概览、账单记录、申请发票
 * + 我的应用订阅（App Store 开通记录 + 续费到期提醒）
 * 独立组件，在 Profile（个人中心）页面中作为 Tab 使用
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Button, Form, Input, Modal,
  Descriptions, Progress, Empty, Typography, App, Alert, Space, Tooltip,
} from 'antd';
import {
  FileTextOutlined, BellOutlined, AppstoreOutlined, SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import tenantService from '@/services/tenantService';
import { appStoreService } from '@/services/system/appStore';
import type { MyAppInfo } from '@/services/system/appStore';

const { Text } = Typography;

// ========== 常量配置 ==========
const PLAN_LABELS: Record<string, string> = {
  TRIAL: '免费试用', BASIC: '基础版', PRO: '专业版', ENTERPRISE: '企业版',
};

const INVOICE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  NOT_REQUIRED: { label: '无需开票', color: 'default' },
  PENDING: { label: '待开票', color: 'processing' },
  ISSUED: { label: '已开票', color: 'success' },
  MAILED: { label: '已寄出', color: 'success' },
};

const BILL_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待付款', color: 'warning' },
  PAID: { label: '已支付', color: 'success' },
  OVERDUE: { label: '逾期', color: 'error' },
  WAIVED: { label: '已减免', color: 'default' },
};

const SUB_TYPE_LABELS: Record<string, string> = {
  TRIAL: '免费试用', MONTHLY: '月付', YEARLY: '年付', PERPETUAL: '买断', FREE: '免费',
};

const SUB_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '使用中', color: 'success' },
  EXPIRED: { label: '已过期', color: 'error' },
  SUSPENDED: { label: '已暂停', color: 'default' },
  TRIAL: { label: '试用中', color: 'processing' },
};

/** 计算距到期天数（返回 null 表示永久有效） */
function daysUntilExpiry(endTime?: string): number | null {
  if (!endTime) return null;
  return dayjs(endTime).diff(dayjs(), 'day');
}

/** 到期天数对应颜色 */
function expiryColor(days: number | null): string {
  if (days === null) return 'success';
  if (days < 0) return 'error';
  if (days <= 7) return 'error';
  if (days <= 14) return 'orange';
  if (days <= 30) return 'gold';
  return 'success';
}

// ========== 组件 ==========
const MyBillingTab: React.FC = () => {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [myApps, setMyApps] = useState<MyAppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceInfoModalVisible, setInvoiceInfoModalVisible] = useState(false);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [invoiceForm] = Form.useForm();
  const [invoiceInfoForm] = Form.useForm();

  /** 30天内即将到期（含已过期）的应用，用于顶部提醒 */
  const expiringApps = useMemo(() =>
    (Array.isArray(myApps) ? myApps : []).filter(app => {
      if (!app.endTime) return false;          // 永久有效，无需提醒
      const days = daysUntilExpiry(app.endTime);
      return days !== null && days <= 30;
    }),
    [myApps],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, billsRes, appsRes]: any[] = await Promise.all([
        tenantService.getMyBilling(),
        tenantService.listMyBills({ page: 1, pageSize: 50 }),
        appStoreService.getMyApps().catch(() => []),   // 失败不影响主账单
      ]);
      setOverview(overviewRes?.data || overviewRes);
      const billData = billsRes?.data || billsRes;
      setBills(Array.isArray(billData) ? billData : (billData?.records || []));
      const appsData = Array.isArray(appsRes) ? appsRes : (appsRes?.records || appsRes?.data || []);
      setMyApps(appsData);
    } catch {
      message.error('加载账单数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---------- 申请开票 ----------
  const handleRequestInvoice = (record: any) => {
    setCurrentBill(record);
    const defaults = overview?.invoiceDefaults || {};
    invoiceForm.setFieldsValue({
      invoiceTitle: record.invoiceTitle || defaults.invoiceTitle || '',
      invoiceTaxNo: record.invoiceTaxNo || defaults.invoiceTaxNo || '',
      invoiceBankName: record.invoiceBankName || defaults.invoiceBankName || '',
      invoiceBankAccount: record.invoiceBankAccount || defaults.invoiceBankAccount || '',
      invoiceAddress: record.invoiceAddress || defaults.invoiceAddress || '',
      invoicePhone: record.invoicePhone || defaults.invoicePhone || '',
    });
    setInvoiceModalVisible(true);
  };

  const handleSubmitInvoice = async () => {
    try {
      const values = await invoiceForm.validateFields();
      await tenantService.requestInvoice(currentBill.id, values);
      message.success('发票申请已提交');
      setInvoiceModalVisible(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '申请失败');
    }
  };

  // ---------- 默认开票信息 ----------
  const handleOpenInvoiceInfo = () => {
    const defaults = overview?.invoiceDefaults || {};
    invoiceInfoForm.setFieldsValue(defaults);
    setInvoiceInfoModalVisible(true);
  };

  const handleSaveInvoiceInfo = async () => {
    try {
      const values = await invoiceInfoForm.validateFields();
      await tenantService.updateMyInvoiceInfo(values);
      message.success('开票信息已保存');
      setInvoiceInfoModalVisible(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '保存失败');
    }
  };

  // ---------- 表格列定义（月账单） ----------
  const billColumns = [
    { title: '账单编号', dataIndex: 'billingNo', width: 160 },
    { title: '账期', dataIndex: 'billingMonth', width: 100 },
    { title: '套餐', dataIndex: 'planType', width: 90,
      render: (v: string) => PLAN_LABELS[v] || v },
    { title: '金额(¥)', dataIndex: 'totalAmount', width: 100,
      render: (v: number) => (
        <Text strong style={{ color: 'var(--color-primary)' }}>
          ¥{v?.toFixed(2) || '0.00'}
        </Text>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const cfg = BILL_STATUS_CONFIG[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '发票', dataIndex: 'invoiceStatus', width: 90,
      render: (v: string) => {
        const cfg = INVOICE_STATUS_CONFIG[v] || { label: v || '—', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '发票号', dataIndex: 'invoiceNo', width: 140,
      render: (v: string) => v || '—' },
    { title: '操作', key: 'actions', width: 120,
      render: (_: any, record: any) => {
        const canRequest = (record.status === 'PAID' || record.status === 'PENDING')
          && (!record.invoiceStatus || record.invoiceStatus === 'NOT_REQUIRED');
        return canRequest ? (
          <Button type="link" size="small" icon={<FileTextOutlined />}
            onClick={() => handleRequestInvoice(record)}>
            申请开票
          </Button>
        ) : null;
      },
    },
  ];
  // ---------- 表格列定义（App 订阅） ----------
  const appColumns = [
    {
      title: '应用名称', dataIndex: 'appName', width: 140,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '订阅类型', dataIndex: 'subscriptionType', width: 90,
      render: (v: string) => <Tag color="blue">{SUB_TYPE_LABELS[v] || v}</Tag>,
    },
    {
      title: '开始时间', dataIndex: 'startTime', width: 120,
      render: (v: string) => v ? v.slice(0, 10) : '—',
    },
    {
      title: '到期时间', dataIndex: 'endTime', width: 120,
      render: (v: string) => {
        if (!v) return <Tag color="success">永久有效</Tag>;
        const days = daysUntilExpiry(v);
        const color = expiryColor(days);
        if (days !== null && days < 0) return <Tag color="error">已过期</Tag>;
        return (
          <Tooltip title={`${days} 天后到期`}>
            <Tag color={color}>{v.slice(0, 10)}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '剩余天数', key: 'daysLeft', width: 90,
      render: (_: any, record: MyAppInfo) => {
        if (!record.endTime) return <Tag color="success">永久</Tag>;
        const days = daysUntilExpiry(record.endTime);
        if (days === null) return <Tag color="success">永久</Tag>;
        if (days < 0) return <Tag color="error">已过期</Tag>;
        const color = expiryColor(days);
        return <Tag color={color}>{days} 天</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string, record: MyAppInfo) => {
        const key = record.isExpired ? 'EXPIRED' : (v || 'ACTIVE');
        const cfg = SUB_STATUS_CONFIG[key] || { label: key, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
  ];
  // ---------- 渲染 ----------
  return (
    <div>
      {/* ===== 续费到期提醒（30天内到期） ===== */}
      {expiringApps.length > 0 && (
        <Alert
          type={expiringApps.some(a => daysUntilExpiry(a.endTime) !== null && daysUntilExpiry(a.endTime)! <= 7) ? 'error' : 'warning'}
          icon={<BellOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <Space size={4} wrap>
              <Text strong>续费提醒：</Text>
              {expiringApps.map(app => {
                const days = daysUntilExpiry(app.endTime);
                const expired = days !== null && days < 0;
                return (
                  <Tag key={app.subscriptionId} color={expired ? 'error' : expiryColor(days)}>
                    {app.appName}
                    {expired ? ' 已过期' : `（${days}天后到期）`}
                  </Tag>
                );
              })}
            </Space>
          }
          description="请及时续费，过期后相关功能将暂停使用，数据保留30天。"
          closable
        />
      )}
      {/* 套餐概览卡片 */}
      {overview && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="当前套餐"
                value={PLAN_LABELS[overview.planType] || overview.planType}
                valueStyle={{ color: 'var(--color-primary)', fontSize: 20 }}
              />
              <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                {overview.paidStatus === 'TRIAL' ? '免费试用中' : `¥${overview.monthlyFee}/月`}
                {overview.expireTime && <span> · 到期: {overview.expireTime?.slice(0, 10)}</span>}
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="存储使用"
                value={`${overview.storageUsedMb || 0}MB`}
                suffix={`/ ${overview.storageQuotaMb}MB`}
              />
              <Progress
                percent={overview.storageUsedPercent || 0}
                size="small"
                status={overview.storageUsedPercent > 80 ? 'exception' : 'normal'}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="用户数"
                value={overview.currentUsers || 0}
                suffix={`/ ${overview.maxUsers || '∞'}`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="租户编码" value={overview.tenantCode || '—'} valueStyle={{ fontSize: 18 }} />
              <div style={{ marginTop: 8 }}>
                <Button type="link" size="small" onClick={handleOpenInvoiceInfo}>
                  维护开票信息
                </Button>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* ===== 我的应用订阅 ===== */}
      {myApps.length > 0 && (
        <Card
          title={<Space><AppstoreOutlined />我的应用订阅</Space>}
          size="small"
          style={{ marginBottom: 24 }}
          extra={
            <Button
              type="link"
              size="small"
              icon={<SyncOutlined />}
              onClick={fetchData}
              loading={loading}
            >
              刷新
            </Button>
          }
        >
          <Table
            rowKey="subscriptionId"
            dataSource={myApps}
            columns={appColumns}
            loading={loading}
            pagination={myApps.length > 10 ? { pageSize: 10, size: 'small' } : false}
            size="small"
            locale={{ emptyText: <Empty description="暂无已开通应用" /> }}
          />
        </Card>
      )}

      {/* ===== 账单记录（平台订阅月账单） ===== */}
      <Card
        title={<Space><AppstoreOutlined />账单记录</Space>}
        size="small"
        extra={<Button type="link" onClick={handleOpenInvoiceInfo}>开票信息设置</Button>}
      >
        <Table
          rowKey="id"
          dataSource={bills}
          columns={billColumns}
          loading={loading}
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description="暂无账单记录" /> }}
        />
      </Card>

      {/* 申请开票弹窗 */}
      <Modal
        title="申请发票"
        open={invoiceModalVisible}
        onOk={handleSubmitInvoice}
        onCancel={() => setInvoiceModalVisible(false)}
        okText="提交申请"
        width={520}
      >
        {currentBill && (
          <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="账单编号">{currentBill.billingNo}</Descriptions.Item>
            <Descriptions.Item label="金额">¥{currentBill.totalAmount?.toFixed(2)}</Descriptions.Item>
          </Descriptions>
        )}
        <Form form={invoiceForm} layout="vertical">
          <Form.Item name="invoiceTitle" label="发票抬头" rules={[{ required: true, message: '请输入发票抬头' }]}>
            <Input placeholder="公司全称" />
          </Form.Item>
          <Form.Item name="invoiceTaxNo" label="纳税人识别号" rules={[{ required: true, message: '请输入纳税人识别号' }]}>
            <Input placeholder="统一社会信用代码" />
          </Form.Item>
          <Form.Item name="invoiceBankName" label="开户银行">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="invoiceBankAccount" label="银行账号">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="invoiceAddress" label="注册地址">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="invoicePhone" label="注册电话">
            <Input placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 维护默认开票信息弹窗 */}
      <Modal
        title="默认开票信息"
        open={invoiceInfoModalVisible}
        onOk={handleSaveInvoiceInfo}
        onCancel={() => setInvoiceInfoModalVisible(false)}
        okText="保存"
        width={520}
      >
        <div style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
          设置后，每次申请发票时会自动填充以下信息
        </div>
        <Form form={invoiceInfoForm} layout="vertical">
          <Form.Item name="invoiceTitle" label="发票抬头">
            <Input placeholder="公司全称" />
          </Form.Item>
          <Form.Item name="invoiceTaxNo" label="纳税人识别号">
            <Input placeholder="统一社会信用代码" />
          </Form.Item>
          <Form.Item name="invoiceBankName" label="开户银行">
            <Input placeholder="开户银行名称" />
          </Form.Item>
          <Form.Item name="invoiceBankAccount" label="银行账号">
            <Input placeholder="对公账号" />
          </Form.Item>
          <Form.Item name="invoiceAddress" label="注册地址">
            <Input placeholder="营业执照注册地址" />
          </Form.Item>
          <Form.Item name="invoicePhone" label="注册电话">
            <Input placeholder="公司电话" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MyBillingTab;
