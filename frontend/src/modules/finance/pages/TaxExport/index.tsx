import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Button, Radio, DatePicker, Space, Tag, Typography, message, Divider, Alert,
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, CheckCircleOutlined, LockOutlined, RocketOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { paths } from '@/routeConfig';
import { appStoreService } from '@/services/system/appStore';
import api from '@/utils/api';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

type ExportFormat = 'STANDARD' | 'KINGDEE' | 'UFIDA';

const FORMAT_OPTIONS = [
  { label: '通用标准格式', value: 'STANDARD' as ExportFormat, desc: '基础 Excel，适合所有财务软件手工导入' },
  { label: '金蝶 KIS 格式', value: 'KINGDEE' as ExportFormat, desc: '金蝶KIS凭证导入格式，直接粘贴无需调整' },
  { label: '用友 T3 格式', value: 'UFIDA' as ExportFormat, desc: '用友T3凭证导入格式，直接粘贴无需调整' },
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
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    appStoreService.getMyApps().then(apps => {
      const active = apps.some(a => a.appCode === 'FINANCE_TAX' && !a.isExpired);
      setSubscribed(active);
    }).catch(() => { }).finally(() => setChecking(false));
  }, []);

  const handleExport = async (type: string) => {
    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      const url = `/api/finance/tax-export/${type}?startDate=${startDate}&endDate=${endDate}&format=${format}`;

      // 直接触发浏览器下载
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
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

  const selectedFormatInfo = FORMAT_OPTIONS.find(f => f.value === format);

  if (checking) {
    return <Layout><div style={{ textAlign: 'center', padding: '80px 0' }}><span>加载中…</span></div></Layout>;
  }

  if (!subscribed) {
    return (
      <Layout>
        <div style={{ padding: '24px', maxWidth: 900 }}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            borderRadius: 12, padding: '40px', marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <LockOutlined style={{ fontSize: 24, color: '#fff' }} />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>财税导出 — 付费模块 · ¥499/月</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.9)', margin: '0 0 20px', fontSize: 14 }}>
              一键导出金蝶/用友格式财务凭证，告别手工录入。工资结算 + 物料对账，完整的财务数据闭环。
            </p>
            <button
              onClick={() => navigate(paths.appStore)}
              style={{
                background: '#fff', color: '#d97706', border: 'none', borderRadius: 8,
                padding: '10px 28px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              <RocketOutlined style={{ marginRight: 6 }} />前往应用商店开通
            </button>
          </div>
          <div style={{ color: '#888', fontSize: 13 }}>开通后即可使用工资结算汇总、物料对账单导出功能，支持金蝶 KIS / 用友 T3 格式。</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <Title level={4} style={{ marginBottom: 4 }}>财税对接导出</Title>
        <Text type="secondary">一键导出财务数据，无缝对接金蝶、用友等主流财务软件</Text>

        <Alert
          style={{ marginTop: 16, marginBottom: 24 }}
          type="info"
          showIcon
          message="如何使用"
          description="① 选择导出格式（推荐直接选您正在使用的财务软件）→ ② 选择日期范围 → ③ 点击导出按钮，自动下载 Excel 文件"
        />

        {/* 格式选择 */}
        <Card title="第一步：选择导出格式" style={{ marginBottom: 16 }}>
          <Radio.Group
            value={format}
            onChange={e => setFormat(e.target.value)}
            style={{ width: '100%' }}
          >
            <Row gutter={[12, 12]}>
              {FORMAT_OPTIONS.map(opt => (
                <Col span={8} key={opt.value}>
                  <div
                    onClick={() => setFormat(opt.value)}
                    style={{
                      border: `2px solid ${format === opt.value ? '#1890ff' : '#d9d9d9'}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: format === opt.value ? '#e6f7ff' : '#fff',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Radio value={opt.value}>
                      <Text strong>{opt.label}</Text>
                    </Radio>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0 24px', fontSize: 12 }}>
                      {opt.desc}
                    </Paragraph>
                  </div>
                </Col>
              ))}
            </Row>
          </Radio.Group>
          {selectedFormatInfo && (
            <div style={{ marginTop: 12 }}>
              <Tag color="blue" icon={<CheckCircleOutlined />}>
                已选：{selectedFormatInfo.label}
              </Tag>
            </div>
          )}
        </Card>

        {/* 日期范围 */}
        <Card title="第二步：选择日期范围" style={{ marginBottom: 16 }}>
          <Space>
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

        {/* 导出类型 */}
        <Card title="第三步：选择导出内容">
          <Row gutter={[16, 16]}>
            {EXPORT_TYPES.map(type => (
              <Col span={12} key={type.key}>
                <Card
                  size="small"
                  style={{ border: `1px solid ${type.color}20`, background: `${type.color}08` }}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <FileExcelOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              导出文件为 .xlsx 格式 · 金蝶/用友格式支持直接在凭证录入界面粘贴导入 · 如遇问题请联系客服
            </Text>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default TaxExport;
