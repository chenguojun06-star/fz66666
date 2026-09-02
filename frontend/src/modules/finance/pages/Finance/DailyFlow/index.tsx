import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Col, DatePicker, Row, Select, Space, Statistic, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { toMoneyLocale } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';

const { RangePicker } = DatePicker;

/** 业务类型：与后端 DailyFlowOrchestrator 的 T_* 常量保持一致 */
const BIZ_TYPE_OPTIONS = [
  { value: 'SCAN', label: '生产扫码' },
  { value: 'PURCHASE', label: '物料采购' },
  { value: 'MATERIAL_INBOUND', label: '物料入库' },
  { value: 'MATERIAL_OUTBOUND', label: '物料出库' },
  { value: 'PRODUCT_INBOUND', label: '成品入库' },
  { value: 'PRODUCT_OUTSTOCK', label: '成品出库' },
];

const BIZ_TYPE_COLOR: Record<string, string> = {
  SCAN: 'blue',
  PURCHASE: 'orange',
  MATERIAL_INBOUND: 'cyan',
  MATERIAL_OUTBOUND: 'geekblue',
  PRODUCT_INBOUND: 'green',
  PRODUCT_OUTSTOCK: 'purple',
};

interface DailyFlowItem {
  bizType: string;
  bizTypeLabel: string;
  flowNo?: string;
  flowTime?: string;
  relatedName?: string;
  styleNo?: string;
  orderNo?: string;
  materialName?: string;
  processName?: string;
  quantity?: number;
  /** null 表示该业务没有金额来源（如物料出库），需显示「—」而不是 0 */
  amount?: number | null;
  operatorName?: string;
}

/**
 * D-245：每日经营流水。
 * 一张大表聚合「生产扫码 / 物料采购 / 物料入库 / 物料出库 / 成品入库 / 成品出库」，
 * 按流水时间倒序，支持类型与日期筛选、导出，用于对账。
 *
 * D-273：拆出 DailyFlowContent 供财务总览 tab 内嵌（不带 PageLayout 外壳）。
 */
const DailyFlowContent: React.FC = () => {
  const [rows, setRows] = useState<DailyFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const [bizTypes, setBizTypes] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/finance/daily-flow', {
        params: {
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
          bizTypes: bizTypes.length > 0 ? bizTypes.join(',') : undefined,
        },
      });
      setRows((res?.data ?? []) as DailyFlowItem[]);
    } catch {
      message.error('加载每日流水失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, bizTypes]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // 金额合计只统计有金额来源的流水；物料出库无金额不参与
  const stats = useMemo(() => {
    let quantity = 0;
    let amount = 0;
    let amountCount = 0;
    rows.forEach((r) => {
      quantity += Number(r.quantity ?? 0);
      if (r.amount != null) {
        amount += Number(r.amount);
        amountCount++;
      }
    });
    return { count: rows.length, quantity, amount, amountCount };
  }, [rows]);

  const columns: ColumnsType<DailyFlowItem> = [
    {
      title: '流水时间', dataIndex: 'flowTime', width: 170,
      render: v => formatDateTime(v),
    },
    {
      title: '类型', dataIndex: 'bizType', width: 110,
      render: (v: string, r) => (
        <Tag color={BIZ_TYPE_COLOR[v] ?? 'default'} style={{ margin: 0 }}>
          {r.bizTypeLabel || v}
        </Tag>
      ),
    },
    { title: '单号', dataIndex: 'flowNo', width: 170, render: v => v || '-' },
    { title: '款号', dataIndex: 'styleNo', width: 130, render: v => v || '-' },
    { title: '订单号', dataIndex: 'orderNo', width: 170, render: v => v || '-' },
    {
      title: '物料 / 工序', width: 170,
      render: (_, r) => r.materialName || r.processName || '-',
    },
    { title: '关联对象', dataIndex: 'relatedName', width: 150, render: v => v || '-' },
    {
      title: '数量', dataIndex: 'quantity', width: 100, align: 'right',
      render: v => (v == null ? '-' : toMoneyLocale(Number(v))),
    },
    {
      title: '金额', dataIndex: 'amount', width: 130, align: 'right',
      render: (v: number | null) => (v == null ? <span style={{ color: 'var(--color-text-quaternary)' }}>—</span> : `¥ ${toMoneyLocale(Number(v))}`),
    },
    { title: '操作人', dataIndex: 'operatorName', width: 110, render: v => v || '-' },
  ];

  return (
    <>
      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={12}>
          <span>日期</span>
          <RangePicker
            value={dateRange}
            onChange={(v) => { if (v?.[0] && v?.[1]) setDateRange([v[0], v[1]]); }}
            allowClear={false}
          />
          <span>类型</span>
          <Select
            mode="multiple"
            allowClear
            placeholder="全部类型"
            style={{ minWidth: 280 }}
            value={bizTypes}
            onChange={setBizTypes}
            options={BIZ_TYPE_OPTIONS}
          />
        </Space>
      </Card>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Card><Statistic title="流水笔数" value={stats.count} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="数量合计" value={stats.quantity} /></Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={`金额合计（${stats.amountCount} 笔有金额）`}
              value={stats.amount}
              precision={2}
              prefix="¥"
              formatter={v => toMoneyLocale(Number(v))}
            />
          </Card>
        </Col>
      </Row>

      <ResizableTable<DailyFlowItem>
        storageKey="finance-daily-flow-table"
        rowKey={(r, i) => `${r.bizType}-${r.flowNo ?? ''}-${r.flowTime ?? ''}-${i ?? 0}`}
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
        }}
        stickyHeader
        scroll={{ x: 'max-content' }}
        showExport
        exportFilename="每日流水.xlsx"
        emptyDescription="所选条件下暂无流水数据"
      />
    </>
  );
};

const DailyFlow: React.FC = () => (
  <PageLayout title="每日流水">
    <DailyFlowContent />
  </PageLayout>
);

export default DailyFlow;
export { DailyFlowContent };
