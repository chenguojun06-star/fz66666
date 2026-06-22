import React, { useState } from 'react';
import { Card, Row, Col, Button, DatePicker, Space, Tag, Typography, Alert, Select } from 'antd';
import { DownloadOutlined, FileExcelOutlined, RocketOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { message } from '@/utils/antdStatic';
import api from '@/utils/api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const EXPORT_TYPES = [
  { key: 'wage', title: '工资结算导出', desc: '导出员工工资结算数据，包含应发、实发、扣款等', color: '#1677ff', icon: '💰' },
  { key: 'material', title: '物料对账导出', desc: '导出物料采购对账数据，包含供应商、金额、税率等', color: '#52c41a', icon: '📦' },
];

const ExportTab: React.FC = () => {
  const [format] = useState<string>('STANDARD');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleExport = async (type: string) => {
    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      const result = await api.get(`/api/finance/tax-export/${type}`, {
        params: { startDate, endDate, format },
        responseType: 'blob',
      });
      const blob = new Blob([result.data]);
      const disposition = result.headers['content-disposition'] || '';
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1].replace(/"/g, '')) : `export_${type}_${startDate}.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      message.success(`${filename} 下载成功`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '导出失败，请稍后重试');
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert type="info" showIcon icon={<FileExcelOutlined />} style={{ marginBottom: 0 }}
        title="数据导出功能"
        description="导出工资结算、物料对账等财务数据，支持金蝶/用友标准格式。" />
      <Card title="选择日期范围" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}>
        <Space wrap>
          <RangePicker value={dateRange} onChange={val => val && setDateRange(val as [Dayjs, Dayjs])}
            format="YYYY-MM-DD" allowClear={false}
            presets={[
              { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: '本季度', value: [dayjs().subtract(dayjs().month() % 3, 'month').startOf('month'), dayjs()] },
            ]} />
          <Text type="secondary">{dateRange[0].format('YYYY-MM-DD')} — {dateRange[1].format('YYYY-MM-DD')}</Text>
        </Space>
      </Card>
      <Card title="选择导出内容" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}>
        <Row gutter={[16, 16]}>
          {EXPORT_TYPES.map(type => (
            <Col xs={24} md={12} key={type.key}>
              <Card style={{ border: `1px solid ${type.color}30`, background: `${type.color}06`, borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{type.icon}</div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 15, color: type.color }}>{type.title}</Text>
                    <div style={{ margin: '4px 0 12px', color: 'var(--color-text-secondary)', fontSize: 14 }}>{type.desc}</div>
                    <Button type="primary" ghost icon={<DownloadOutlined />} loading={loading[type.key]}
                      onClick={() => handleExport(type.key)} style={{ borderColor: type.color, color: type.color }}>
                      导出 Excel
                    </Button>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </Space>
  );
};

export default ExportTab;