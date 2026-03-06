import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Button, DatePicker, Space, Tag, Typography, message, Divider, Alert, Modal,
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, CheckCircleOutlined, LockOutlined, RocketOutlined, UnlockOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { paths } from '@/routeConfig';
import { appStoreService } from '@/services/system/appStore';
import { useAuth } from '@/utils/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

type ExportFormat = 'STANDARD' | 'KINGDEE' | 'UFIDA';

const FORMAT_OPTIONS = [
  { label: '通用标准格式', value: 'STANDARD' as ExportFormat, desc: '基础 Excel，适合所有财务软件手工导入', free: true },
  { label: '金蝶 KIS 格式', value: 'KINGDEE' as ExportFormat, desc: '金蝶KIS凭证导入格式，直接粘贴无需调整', free: false },
  { label: '用友 T3 格式', value: 'UFIDA' as ExportFormat, desc: '用友T3凭证导入格式，直接粘贴无需调整', free: false },
];

const EXPORT_TYPES = [
  {
    key: 'payroll',
    title: '工资结算汇总',
    desc: '导出指定周期内所有结算单数据，含结算金额、操作工姓名、工序明细',
    icon: '💰',
    color: '#52c41a',
  },
  {
    key: 'material',
    title: '物料对账单',
    desc: '导出面辅料采购、出入库、对账数据，与供应商对账一目了然',
    icon: '📦',
    color: '#1890ff',
  },
];

const TaxExport: React.FC = () => {
  const navigate = useNavigate();
  const [format, setFormat] = useState<ExportFormat>('STANDARD');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs(),
  ]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState<string>('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) { setSubscribed(true); setSubscriptionType('PERMANENT'); setChecking(false); return; }
    appStoreService.getMyApps().then((apps: any) => {
      const list = Array.isArray(apps) ? apps : (apps?.records || apps?.data || []);
      const taxApp = list.find((a: any) => a.appCode === 'FINANCE_TAX' && !a.isExpired);
      setSubscribed(!!taxApp);
      if (taxApp) setSubscriptionType(taxApp.subscriptionType || '');
    }).catch(() => { }).finally(() => setChecking(false));
  }, [isSuperAdmin]);

  const handleFormatClick = (opt: typeof FORMAT_OPTIONS[0]) => {
    if (!opt.free && !subscribed) {
      Modal.confirm({
        title: '专业格式 — 付费功能',
        icon: <LockOutlined style={{ color: '#f59e0b' }} />,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>金蝶/用友专用格式需要开通<strong>财税对接模块</strong>（¥499/月）。</p>
            <p style={{ color: '#888', fontSize: 13 }}>通用标准格式永久免费，适合手工导入任意财务软件。</p>
          </div>
        ),
        okText: '前往开通',
        cancelText: '继续用免费版',
        onOk: () => navigate(paths.appStore),
      });
      return;
    }
    setFormat(opt.value);
  };

  const handleExport = async (type: string) => {
    const selectedOpt = FORMAT_OPTIONS.find(f => f.value === format);
    if (selectedOpt && !selectedOpt.free && !subscribed) {
      message.warning('当前格式需要开通财税对接模块，已自动切换为通用标准格式');
      setFormat('STANDARD');
      return;
    }
    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      const url = `/api/finance/tax-export/${type}?startDate=${startDate}&endDate=${endDate}&format=${format}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` },
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.message || `下载失败 (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1].replace(/"/g, ''))
        : `export_${type}_${startDate}.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      message.success(`${filename} 下载成功`);
    } catch (e: any) {
      message.error(e?.message || '导出失败，请稍后重试');
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  if (checking) {
    return <Layout><div style={{ textAlign: 'center', padding: '80px 0' }}><span>加载中…</span></div></Layout>;
  }

  const selectedFormatInfo = FORMAT_OPTIONS.find(f => f.value === format);

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <Title level={4} style={{ marginBottom: 4 }}>
          <FileExcelOutlined style={{ marginRight: 8, color: '#52c41a' }} />
          财税数据导出
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          将工资结算、物料对账数据导出为 Excel，可直接导入财务软件
        </Text>

        {!subscribed && (
          <Alert
            type="info"
            showIcon
            icon={<UnlockOutlined />}
            style={{ marginBottom: 16 }}
            message="通用标准格式永久免费"
            description={
              <span>
                适合手工导入任意财务软件。如需金蝶/用友专用格式（直接粘贴，无需调整列），可开通
                <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => navigate(paths.appStore)}>
                  财税对接模块（¥499/月）
                </Button>
              </span>
            }
          />
        )}
        {subscribed && (
          <Alert
            type="success"
            showIcon
            icon={subscriptionType === 'FREE' ? <span style={{ fontSize: 16 }}>🎁</span> : <RocketOutlined />}
            style={{ marginBottom: 16 }}
            message={subscriptionType === 'FREE' ? '新开户赠送已激活 · 财税对接模块（1年免费）' : '已开通财税对接模块'}
            description={subscriptionType === 'FREE'
              ? '恭喜！作为新开户福利，金蝶 KIS / 用友 T3 专用格式均已为您解锁，有效期1年。'
              : '金蝶 KIS / 用友 T3 专用格式均已解锁，导出后可直接粘贴导入凭证。'}
          />
        )}

        {/* 格式选择 */}
        <Card title="第一步：选择导出格式" style={{ marginBottom: 16 }}>
          <Row gutter={[12, 12]}>
            {FORMAT_OPTIONS.map(opt => {
              const locked = !opt.free && !subscribed;
              const selected = format === opt.value;
              return (
                <Col span={8} key={opt.value}>
                  <div
                    onClick={() => handleFormatClick(opt)}
                    style={{
                      border: `2px solid ${selected ? '#1890ff' : locked ? '#f0f0f0' : '#d9d9d9'}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      cursor: locked ? 'not-allowed' : 'pointer',
                      background: selected ? '#e6f7ff' : locked ? '#fafafa' : '#fff',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text strong style={{ color: locked ? '#bbb' : undefined }}>{opt.label}</Text>
                      {opt.free
                        ? <Tag color="green" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>免费</Tag>
                        : <Tag color={subscribed ? 'gold' : 'default'} icon={subscribed ? <CheckCircleOutlined /> : <LockOutlined />} style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
                            {subscribed ? '已解锁' : '付费'}
                          </Tag>
                      }
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{opt.desc}</Text>
                    {selected && <CheckCircleOutlined style={{ position: 'absolute', top: 10, right: 10, color: '#1890ff' }} />}
                  </div>
                </Col>
              );
            })}
          </Row>
        </Card>

        {/* 日期范围 */}
        <Card title="第二步：选择日期范围" style={{ marginBottom: 16 }}>
          <Space wrap>
            <RangePicker
              value={dateRange}
              onChange={val => val && setDateRange(val as [Dayjs, Dayjs])}
              format="YYYY-MM-DD"
              allowClear={false}
              presets={[
                { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
                { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                { label: '本季度', value: [dayjs().subtract(dayjs().month() % 3, 'month').startOf('month'), dayjs()] },
                { label: '本年', value: [dayjs().startOf('year'), dayjs()] },
              ]}
            />
            <Text type="secondary">
              {dateRange[0].format('YYYY年MM月DD日')} — {dateRange[1].format('YYYY年MM月DD日')}
            </Text>
          </Space>
        </Card>

        {/* 导出内容 */}
        <Card title={<span>第三步：选择导出内容 <Tag color="blue" style={{ marginLeft: 8 }}>{selectedFormatInfo?.label}</Tag></span>}>
          <Row gutter={[16, 16]}>
            {EXPORT_TYPES.map(type => (
              <Col span={12} key={type.key}>
                <Card
                  size="small"
                  style={{ border: `1px solid ${type.color}30`, background: `${type.color}06` }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ fontSize: 32, lineHeight: 1 }}>{type.icon}</div>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 15, color: type.color }}>{type.title}</Text>
                      <Paragraph type="secondary" style={{ margin: '4px 0 12px', fontSize: 12 }}>
                        {type.desc}
                      </Paragraph>
                      <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        loading={loading[type.key]}
                        onClick={() => handleExport(type.key)}
                        style={{ background: type.color, borderColor: type.color }}
                      >
                        导出 Excel
                      </Button>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Divider style={{ margin: '20px 0 12px' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FileExcelOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              导出文件为 .xlsx 格式 · 金蝶/用友格式支持直接在凭证录入界面粘贴导入
            </Text>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default TaxExport;
