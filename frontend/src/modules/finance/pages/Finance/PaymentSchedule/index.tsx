import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Col, DatePicker, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import {
  ClockCircleOutlined, DollarOutlined, ExclamationCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/plugin/quarterOfYear'; // 启用 quarter 类型（main.tsx 已 extend）
import ResizableTable from '@/components/common/ResizableTable';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import payableApi, { type Payable } from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import type { ApiResult } from '@/utils/api';
import { toMoneyLocale } from '@/utils/format';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待付款', color: 'blue' },
  PARTIAL:  { label: '部分付款', color: 'orange' },
  PAID:     { label: '已全额付款', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

// 快捷预设（与 RangePicker presets 配合，用户也可自定义日期）
const DATE_PRESETS = [
  { label: '未来7天', value: [dayjs(), dayjs().add(7, 'day')] as [Dayjs, Dayjs] },
  { label: '未来14天', value: [dayjs(), dayjs().add(14, 'day')] as [Dayjs, Dayjs] },
  { label: '未来30天', value: [dayjs(), dayjs().add(30, 'day')] as [Dayjs, Dayjs] },
  { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] as [Dayjs, Dayjs] },
  { label: '本季度', value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] as [Dayjs, Dayjs] },
];

const PaymentSchedule: React.FC = () => {
  const [records, setRecords] = useState<Payable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(
    () => [dayjs(), dayjs().add(30, 'day')], // 默认未来30天
  );

  const fetchPayables = useCallback(async () => {
    setLoading(true);
    try {
      const res: ApiResult = await payableApi.list({
        page,
        pageSize,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
      });
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setRecords((data?.records as Payable[]) ?? []);
      setTotal((data?.total as number) ?? 0);
    } catch {
      message.error('加载付款计划失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, dateRange]);

  useEffect(() => {
    fetchPayables();
  }, [fetchPayables]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nowTimestamp = now.getTime();

  // 仅对待付（remaining > 0）的记录做统计
  const stats = useMemo(() => {
    const pendingRecords = records.filter(r => {
      const remaining = Number(r.amount) - Number(r.paidAmount ?? 0);
      return remaining > 0;
    });

    const totalPending = pendingRecords.reduce((sum, r) => sum + (Number(r.amount) - Number(r.paidAmount ?? 0)), 0);

    const calcAmountInDays = (days: number) => {
      const targetDate = new Date(nowTimestamp);
      targetDate.setDate(targetDate.getDate() + days);
      return pendingRecords
        .filter(r => {
          if (!r.dueDate) return false;
          const due = new Date(r.dueDate);
          due.setHours(0, 0, 0, 0);
          return due <= targetDate;
        })
        .reduce((sum, r) => sum + (Number(r.amount) - Number(r.paidAmount ?? 0)), 0);
    };

    return {
      totalPending,
      in7Days: calcAmountInDays(7),
      in14Days: calcAmountInDays(14),
      in30Days: calcAmountInDays(30),
    };
  }, [records, nowTimestamp]);

  const getRemainingDays = (dueDate?: string) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getRemainingDaysColor = (days: number | null) => {
    if (days === null) return undefined;
    if (days <= 3) return 'danger';
    if (days <= 7) return 'warning';
    return undefined;
  };

  const columns: ColumnsType<Payable> = [
    {
      title: '应付单号',
      dataIndex: 'payableNo',
      width: 160,
      render: v => <Text code style={{ fontSize: 14 }}>{v || '-'}</Text>,
    },
    { title: '供应商', dataIndex: 'supplierName', width: 180 },
    {
      title: '应付金额', dataIndex: 'amount', width: 120, align: 'right',
      render: v => <Text strong>¥ {toMoneyLocale(v)}</Text>,
    },
    {
      title: '已付金额', dataIndex: 'paidAmount', width: 120, align: 'right',
      render: v => <Text type="success">¥ {toMoneyLocale(v)}</Text>,
    },
    {
      title: '待付金额', width: 120, align: 'right',
      render: (_, r) => {
        const rem = Number(r.amount) - Number(r.paidAmount ?? 0);
        return <Text type={rem > 0 ? 'warning' : 'secondary'}>¥ {toMoneyLocale(rem)}</Text>;
      },
    },
    {
      title: '到期日', dataIndex: 'dueDate', width: 110,
      render: v => {
        if (!v) return '-';
        const days = getRemainingDays(v);
        const color = getRemainingDaysColor(days);
        return <Text type={color as any}>{v}</Text>;
      },
    },
    {
      title: '剩余天数',
      width: 100,
      align: 'center',
      render: (_, r) => {
        const days = getRemainingDays(r.dueDate);
        if (days === null) return '-';
        const tagColor = days <= 3 ? 'red' : days <= 7 ? 'orange' : 'blue';
        return (
          <Tag color={tagColor} style={{ margin: 0 }}>
            {days} 天
          </Tag>
        );
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: v => {
        const cfg = STATUS_CONFIG[v] ?? { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '操作', width: 120, fixed: 'right',
      render: (_, _record) => {
        const actions: RowAction[] = [
          {
            key: 'view',
            label: '查看详情',
            onClick: () => {
              message.info('待实现：跳转到应付详情');
            },
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待付总额"
              value={stats.totalPending}
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
              title="7天内应付"
              value={stats.in7Days}
              precision={2}
              prefix={<WarningOutlined />}
              styles={{ content: { color: 'var(--color-danger)' } }}
              formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="14天内应付"
              value={stats.in14Days}
              precision={2}
              prefix={<ExclamationCircleOutlined />}
              styles={{ content: { color: 'var(--color-warning)' } }}
              formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="30天内应付"
              value={stats.in30Days}
              precision={2}
              prefix={<ClockCircleOutlined />}
              styles={{ content: { color: 'var(--color-info)' } }}
              formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={12} align="middle" justify="space-between">
          <Col>
            <Space size={8}>
              <Text type="secondary">到期日范围：</Text>
              <RangePicker
                value={dateRange}
                onChange={(v) => {
                  setDateRange(v as [Dayjs, Dayjs] | null);
                  setPage(1);
                }}
                allowClear
                presets={DATE_PRESETS}
                placeholder={['开始日期', '结束日期']}
                style={{ width: 260 }}
              />
            </Space>
          </Col>
          <Col>
            <Text type="secondary">共 {total} 笔</Text>
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
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条`,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
          }}
          locale={{ emptyText: '暂无付款计划' }}
        />
      </Card>
    </div>
  );
};

export default PaymentSchedule;
