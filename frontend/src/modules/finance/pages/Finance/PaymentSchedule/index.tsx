import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import {
  ClockCircleOutlined, DollarOutlined, ExclamationCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import payableApi, { type Payable } from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import type { ApiResult } from '@/utils/api';
import { toMoneyLocale } from '@/utils/format';

const { Text } = Typography;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待付款', color: 'blue' },
  PARTIAL:  { label: '部分付款', color: 'orange' },
  PAID:     { label: '已全额付款', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

const TIME_FILTER_OPTIONS = [
  { value: '7', label: '未来7天' },
  { value: '14', label: '未来14天' },
  { value: '30', label: '未来30天' },
  { value: 'all', label: '全部' },
];

const PaymentSchedule: React.FC = () => {
  const [records, setRecords] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState('7');

  const fetchAllPayables = useCallback(async () => {
    setLoading(true);
    try {
      const allRecords: Payable[] = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const res: ApiResult = await payableApi.list({
          page,
          pageSize,
        });
        const data = (res?.data ?? res) as Record<string, unknown> | undefined;
        const pageRecords = (data?.records as Payable[]) ?? [];
        allRecords.push(...pageRecords);
        const total = (data?.total as number) ?? 0;
        hasMore = page * pageSize < total && pageRecords.length > 0;
        page++;
      }

      setRecords(allRecords);
    } catch {
      message.error('加载付款计划失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllPayables();
  }, [fetchAllPayables]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const filteredRecords = useMemo(() => {
    let result = records.filter(r => {
      if (!r.dueDate) return false;
      const due = new Date(r.dueDate);
      due.setHours(0, 0, 0, 0);
      const remaining = r.amount - (r.paidAmount ?? 0);
      return remaining > 0 && due >= now;
    });

    if (timeFilter !== 'all') {
      const days = parseInt(timeFilter, 10);
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);
      result = result.filter(r => {
        if (!r.dueDate) return false;
        const due = new Date(r.dueDate);
        due.setHours(0, 0, 0, 0);
        return due <= targetDate;
      });
    }

    result.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return result;
  }, [records, timeFilter, now.getTime()]);

  const stats = useMemo(() => {
    const totalPending = filteredRecords.reduce((sum, r) => sum + (r.amount - (r.paidAmount ?? 0)), 0);

    const calcAmountInDays = (days: number) => {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);
      return filteredRecords
        .filter(r => {
          if (!r.dueDate) return false;
          const due = new Date(r.dueDate);
          due.setHours(0, 0, 0, 0);
          return due <= targetDate;
        })
        .reduce((sum, r) => sum + (r.amount - (r.paidAmount ?? 0)), 0);
    };

    return {
      totalPending,
      in7Days: calcAmountInDays(7),
      in14Days: calcAmountInDays(14),
      in30Days: calcAmountInDays(30),
    };
  }, [filteredRecords, now.getTime()]);

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
        const color = getRemainingDaysColor(days);
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
      render: (_, record) => {
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
            <Space>
              <Text type="secondary">时间筛选：</Text>
              <Select
                value={timeFilter}
                onChange={setTimeFilter}
                style={{ width: 140 }}
                options={TIME_FILTER_OPTIONS}
              />
            </Space>
          </Col>
          <Col>
            <Text type="secondary">共 {filteredRecords.length} 笔待付款</Text>
          </Col>
        </Row>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={filteredRecords}
          loading={loading}
          stickyHeader
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条`,
          }}
          locale={{ emptyText: '暂无待付款计划' }}
        />
      </Card>
    </div>
  );
};

export default PaymentSchedule;
