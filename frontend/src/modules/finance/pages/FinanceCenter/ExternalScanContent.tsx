import React, { useState, useCallback, useEffect } from 'react';
import { Card, Input, Button, Tag, DatePicker, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import { readPageSize } from '@/utils/pageSizeStore';

const { RangePicker } = DatePicker;

interface ScanRecordRow {
  id: string;
  delegateTargetName?: string;
  operatorName?: string;
  processName?: string;
  orderNo?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  processUnitPrice?: number;
  scanCost?: number;
  scanTime?: string;
  scanResult?: string;
  bundleNo?: string;
  [key: string]: unknown;
}

interface FilterState {
  orderNo: string;
  processName: string;
  operatorName: string;
  startTime: Dayjs | null;
  endTime: Dayjs | null;
}

const ExternalScanContent: React.FC = () => {
  const [data, setData] = useState<ScanRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readPageSize(20));
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    orderNo: '',
    processName: '',
    operatorName: '',
    startTime: null,
    endTime: null,
  });
  const [pendingFilters, setPendingFilters] = useState<FilterState>({ ...filters });

  const fetchData = useCallback(async (currentPage: number, currentPageSize: number, f: FilterState) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: currentPage,
        pageSize: currentPageSize,
        externalOnly: 'true',
      };
      if (f.orderNo) params.orderNo = f.orderNo;
      if (f.processName) params.processName = f.processName;
      if (f.operatorName) params.operatorName = f.operatorName;
      if (f.startTime) params.startTime = f.startTime.format('YYYY-MM-DD HH:mm:ss');
      if (f.endTime) params.endTime = f.endTime.endOf('day').format('YYYY-MM-DD HH:mm:ss');

      const res = await api.get('/production/scan/list', { params });
      setData(res.data?.records ?? []);
      setTotal(res.data?.total ?? 0);
    } catch {
      // 错误由全局拦截器处理
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page, pageSize, filters);
  }, [page, pageSize, filters, fetchData]);

  const handleSearch = () => {
    setFilters({ ...pendingFilters });
    setPage(1);
  };

  const handleReset = () => {
    const empty: FilterState = { orderNo: '', processName: '', operatorName: '', startTime: null, endTime: null };
    setPendingFilters(empty);
    setFilters(empty);
    setPage(1);
  };

  const columns: ColumnsType<ScanRecordRow> = [
    {
      title: '委托工厂',
      dataIndex: 'delegateTargetName',
      key: 'delegateTargetName',
      width: 140,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '操作员',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '工序',
      dataIndex: 'processName',
      key: 'processName',
      width: 110,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: string) => v || '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      render: (v: string) => v || '-',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
      render: (v: number) => (v != null ? v : '-'),
    },
    {
      title: '单价',
      dataIndex: 'processUnitPrice',
      key: 'processUnitPrice',
      width: 80,
      align: 'right',
      render: (v: number) => (v != null ? `¥${Number(v).toFixed(2)}` : '-'),
    },
    {
      title: '金额',
      dataIndex: 'scanCost',
      key: 'scanCost',
      width: 90,
      align: 'right',
      render: (v: number) => (v != null ? `¥${Number(v).toFixed(2)}` : '-'),
    },
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '结果',
      dataIndex: 'scanResult',
      key: 'scanResult',
      width: 80,
      render: (v: string) =>
        v === 'success' ? (
          <Tag color="success">成功</Tag>
        ) : v === 'fail' ? (
          <Tag color="error">失败</Tag>
        ) : (
          <Tag>{v || '-'}</Tag>
        ),
    },
  ];

  return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      {/* 搜索栏 */}
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker
          value={[pendingFilters.startTime, pendingFilters.endTime]}
          onChange={(dates) =>
            setPendingFilters((f) => ({
              ...f,
              startTime: dates?.[0] ?? null,
              endTime: dates?.[1] ?? null,
            }))
          }
          placeholder={['开始日期', '结束日期']}
          allowClear
        />
        <Input
          placeholder="订单号"
          value={pendingFilters.orderNo}
          onChange={(e) => setPendingFilters((f) => ({ ...f, orderNo: e.target.value }))}
          style={{ width: 160 }}
          allowClear
          onPressEnter={handleSearch}
        />
        <Input
          placeholder="工序名"
          value={pendingFilters.processName}
          onChange={(e) => setPendingFilters((f) => ({ ...f, processName: e.target.value }))}
          style={{ width: 130 }}
          allowClear
          onPressEnter={handleSearch}
        />
        <Input
          placeholder="操作员"
          value={pendingFilters.operatorName}
          onChange={(e) => setPendingFilters((f) => ({ ...f, operatorName: e.target.value }))}
          style={{ width: 130 }}
          allowClear
          onPressEnter={handleSearch}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          重置
        </Button>
      </Space>

      <ResizableTable<ScanRecordRow>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        scroll={{ x: 1300 }}
        size="small"
      />
    </Card>
  );
};

export default ExternalScanContent;
