import React, { useState, useEffect, useCallback } from 'react';
import { App, Card, Row, Col, Statistic, DatePicker, Input, Button, Tag, Space } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import SkuColorImage from '@/components/common/SkuColorImage';
import dayjs from 'dayjs';
import api from '@/utils/api';

const { RangePicker } = DatePicker;

interface OrderWasteAnalysisDTO {
  id: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  color: string;
  size: string;
  factoryName: string;
  customerName: string;
  orderQuantity: number;
  completedQuantity: number;
  warehousingQualifiedQuantity: number;
  outstockQuantity: number;
  totalWaste: number;
  totalWasteRate: string;
  unitCostIncreaseRate: string;
  orderStatus: string;
}

interface OrderWasteSummaryDTO {
  totalOrderQuantity: number;
  totalOutstockQuantity: number;
  totalWaste: number;
  avgTotalWasteRate: string;
  totalCostIncrease: string;
  totalCuttingWaste: number;
  avgCuttingWasteRate: string;
  totalProductionWaste: number;
  avgProductionWasteRate: string;
  totalQualityWaste: number;
  avgQualityWasteRate: string;
  totalShipmentWaste: number;
  avgShipmentWasteRate: string;
}

const WasteTab: React.FC = () => {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<OrderWasteSummaryDTO | null>(null);
  const [dataSource, setDataSource] = useState<OrderWasteAnalysisDTO[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const [filters, setFilters] = useState({
    styleNo: '',
    orderNo: '',
    factoryName: '',
    dateRange: [] as [dayjs.Dayjs, dayjs.Dayjs] | [],
  });

  const fetchSummary = useCallback(async () => {
    const dateRangeStr = filters.dateRange.length === 2
      ? `${filters.dateRange[0].format('YYYY-MM-DD')}~${filters.dateRange[1].format('YYYY-MM-DD')}` : '';

    try {
      const result = await api.get('/production/waste-analysis/summary', {
        params: { styleNo: filters.styleNo || '', orderNo: filters.orderNo || '', factoryName: filters.factoryName || '', dateRange: dateRangeStr },
      });
      if (result.data.code === 200) { setSummary(result.data.data); }
    } catch { message.error('获取汇总数据失败'); }
  }, [filters, message]);

  const fetchList = useCallback(async (page: number, pageSize: number) => {
    const dateRangeStr = filters.dateRange.length === 2
      ? `${filters.dateRange[0].format('YYYY-MM-DD')}~${filters.dateRange[1].format('YYYY-MM-DD')}` : '';

    setLoading(true);
    try {
      const result = await api.get('/production/waste-analysis/list', {
        params: { current: String(page), size: String(pageSize), styleNo: filters.styleNo || '', orderNo: filters.orderNo || '', factoryName: filters.factoryName || '', dateRange: dateRangeStr },
      });
      if (result.data.code === 200) {
        setDataSource(result.data.data.records || []);
        setPagination(prev => ({ ...prev, total: result.data.data.total || 0, current: page, pageSize }));
      }
    } catch { message.error('获取订单损耗列表失败'); }
    finally { setLoading(false); }
  }, [filters, message]);

  const pageSize = pagination.pageSize;
  useEffect(() => { fetchSummary(); fetchList(1, pageSize); }, [fetchSummary, fetchList, pageSize]);

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchSummary();
    fetchList(1, pagination.pageSize);
  };

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', width: 120, ellipsis: true },
    { title: '图片', key: 'skuImage', width: 50, render: (_: unknown, record: OrderWasteAnalysisDTO) => <SkuColorImage styleNo={record.styleNo} color={record.color} size={32} /> },
    { title: '款号', dataIndex: 'styleNo', width: 90, ellipsis: true },
    { title: '款名', dataIndex: 'styleName', width: 100, ellipsis: true },
    { title: '颜色/尺码', dataIndex: 'color', width: 90, render: (text: string, record: OrderWasteAnalysisDTO) => `${text || '-'} / ${record.size || '-'}` },
    { title: '工厂', dataIndex: 'factoryName', width: 100, ellipsis: true },
    { title: '下单数量', dataIndex: 'orderQuantity', width: 80, align: 'right' as const },
    { title: '完成数量', dataIndex: 'completedQuantity', width: 80, align: 'right' as const },
    { title: '入库数量', dataIndex: 'warehousingQualifiedQuantity', width: 80, align: 'right' as const },
    { title: '出货数量', dataIndex: 'outstockQuantity', width: 80, align: 'right' as const },
    { title: '总损耗', dataIndex: 'totalWaste', width: 70, align: 'right' as const, render: (val: number) => <span style={{ fontWeight: 500 }}>{val}</span> },
    { title: '损耗率', dataIndex: 'totalWasteRate', width: 70, align: 'right' as const, render: (text: string) => `${text}%` },
    { title: '成本增幅', dataIndex: 'unitCostIncreaseRate', width: 80, align: 'right' as const, render: (text: string) => <Tag color={parseFloat(text) > 0 ? 'red' : 'green'}>{text}%</Tag> },
    { title: '状态', dataIndex: 'orderStatus', width: 80 },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {summary && (
        <Row gutter={12}>
          <Col span={6}><Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}><Statistic title="总下单数量" value={summary.totalOrderQuantity} /></Card></Col>
          <Col span={6}><Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}><Statistic title="总出货数量" value={summary.totalOutstockQuantity} /></Card></Col>
          <Col span={6}><Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}><Statistic title="总损耗数量" value={summary.totalWaste} suffix={`(${summary.avgTotalWasteRate}%)`} /></Card></Col>
          <Col span={6}><Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}><Statistic title="成本增加" value={`¥${summary.totalCostIncrease}`} /></Card></Col>
        </Row>
      )}
      <Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input placeholder="款号" value={filters.styleNo} onChange={(e) => setFilters(prev => ({ ...prev, styleNo: e.target.value }))} style={{ width: 140 }} onPressEnter={handleSearch} />
          <Input placeholder="订单号" value={filters.orderNo} onChange={(e) => setFilters(prev => ({ ...prev, orderNo: e.target.value }))} style={{ width: 140 }} onPressEnter={handleSearch} />
          <Input placeholder="工厂名称" value={filters.factoryName} onChange={(e) => setFilters(prev => ({ ...prev, factoryName: e.target.value }))} style={{ width: 140 }} onPressEnter={handleSearch} />
          <RangePicker value={filters.dateRange.length === 2 ? filters.dateRange : null}
            onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates ? [dates[0]!, dates[1]!] : [] }))} style={{ width: 260 }} />
          <Button type="primary" ghost onClick={handleSearch}>查询</Button>
        </Space>
        <ResizableTable columns={columns} dataSource={dataSource} rowKey="id" loading={loading} scroll={{ x: 1200 }} emptyDescription="暂无财务数据"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, pageSize: number) => fetchList(page, pageSize),
          }} />
      </Card>
    </Space>
  );
};

export default WasteTab;