import React, { useState, useEffect, useCallback } from 'react';
import { App, Tag, Statistic, Card, Row, Col, DatePicker, Input, Select } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import SkuColorImage from '@/components/common/SkuColorImage';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

export interface OrderWasteAnalysisDTO {
  id: string;
  orderNo: string;
  styleNo: string;
  styleId: string;
  styleName: string;
  color: string;
  size: string;
  skuColorImage: string;
  factoryName: string;
  customerName: string;
  salesChannel: string;
  orderQuantity: number;
  cuttingQuantity: number;
  completedQuantity: number;
  warehousingQualifiedQuantity: number;
  outstockQuantity: number;
  unqualifiedQuantity: number;
  repairQuantity: number;
  cuttingWaste: number;
  cuttingWasteRate: string;
  productionWaste: number;
  productionWasteRate: string;
  qualityWaste: number;
  qualityWasteRate: string;
  shipmentWaste: number;
  shipmentWasteRate: string;
  totalWaste: number;
  totalWasteRate: string;
  materialCost: string;
  processCost: string;
  totalCost: string;
  unitCostWithoutWaste: string;
  unitCostWithWasteAllocation: string;
  unitCostIncrease: string;
  unitCostIncreaseRate: string;
  orderStatus: string;
  completionTime: string;
}

export interface OrderWasteSummaryDTO {
  totalOrderQuantity: number;
  totalCuttingQuantity: number;
  totalCompletedQuantity: number;
  totalWarehousingQuantity: number;
  totalOutstockQuantity: number;
  totalCuttingWaste: number;
  avgCuttingWasteRate: string;
  totalProductionWaste: number;
  avgProductionWasteRate: string;
  totalQualityWaste: number;
  avgQualityWasteRate: string;
  totalShipmentWaste: number;
  avgShipmentWasteRate: string;
  totalWaste: number;
  avgTotalWasteRate: string;
  totalMaterialCost: string;
  totalProcessCost: string;
  totalCost: string;
  avgUnitCostWithoutWaste: string;
  avgUnitCostWithWaste: string;
  totalCostIncrease: string;
  avgCostIncreaseRate: string;
  wasteByFactory: { factoryId: string; factoryName: string; orderQuantity: number; wasteQuantity: number; wasteRate: string }[];
  wasteByStyle: { styleId: string; styleNo: string; styleName: string; orderQuantity: number; wasteQuantity: number; wasteRate: string }[];
  wasteTrend: { date: string; orderQuantity: number; wasteQuantity: number; wasteRate: string }[];
}

const OrderWasteAnalysis: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<OrderWasteSummaryDTO | null>(null);
  const [dataSource, setDataSource] = useState<OrderWasteAnalysisDTO[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const [filters, setFilters] = useState({
    styleNo: '',
    orderNo: '',
    factoryName: '',
    factoryType: '',
    dateRange: [] as [dayjs.Dayjs, dayjs.Dayjs] | [],
  });

  const fetchSummary = useCallback(async () => {
    const dateRangeStr = filters.dateRange.length === 2
      ? `${filters.dateRange[0].format('YYYY-MM-DD')}~${filters.dateRange[1].format('YYYY-MM-DD')}`
      : '';

    setLoading(true);
    try {
      const result = await api.get('/production/waste-analysis/summary', {
        params: {
          styleNo: filters.styleNo || '',
          orderNo: filters.orderNo || '',
          factoryName: filters.factoryName || '',
          factoryType: filters.factoryType || '',
          dateRange: dateRangeStr,
        },
      });
      if (result.data.code === 200) {
        setSummary(result.data.data);
      }
    } catch (error) {
      message.error('获取汇总数据失败');
    } finally {
      setLoading(false);
    }
  }, [filters, message]);

  const fetchList = useCallback(async (page: number, pageSize: number) => {
    const dateRangeStr = filters.dateRange.length === 2
      ? `${filters.dateRange[0].format('YYYY-MM-DD')}~${filters.dateRange[1].format('YYYY-MM-DD')}`
      : '';

    setLoading(true);
    try {
      const result = await api.get('/production/waste-analysis/list', {
        params: {
          current: String(page),
          size: String(pageSize),
          styleNo: filters.styleNo || '',
          orderNo: filters.orderNo || '',
          factoryName: filters.factoryName || '',
          factoryType: filters.factoryType || '',
          dateRange: dateRangeStr,
        },
      });
      if (result.data.code === 200) {
        setDataSource(result.data.data.records || []);
        setPagination(prev => ({ ...prev, total: result.data.data.total || 0, current: page, pageSize }));
      }
    } catch (error) {
      message.error('获取订单损耗列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters, message]);

  useEffect(() => {
    fetchSummary();
    fetchList(1, pagination.pageSize);
  }, [fetchSummary, fetchList]);

  const handleFilterChange = (key: keyof typeof filters, value: string | dayjs.Dayjs[]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchSummary();
    fetchList(1, pagination.pageSize);
  };

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 120, ellipsis: true },
    {
      title: '图片',
      key: 'skuImage',
      width: 60,
      render: (_: unknown, record: OrderWasteAnalysisDTO) => (
        <SkuColorImage styleNo={record.styleNo} color={record.color} size={40} />
      )
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 100, ellipsis: true },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', width: 120, ellipsis: true },
    { title: '颜色/尺码', dataIndex: 'color', key: 'color', width: 100, render: (text: string, record: OrderWasteAnalysisDTO) => `${text || '-'} / ${record.size || '-'}` },
    { title: '工厂', dataIndex: 'factoryName', key: 'factoryName', width: 120, ellipsis: true },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 120, ellipsis: true },
    { title: '下单数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 80, align: 'right' as const },
    { title: '裁剪数量', dataIndex: 'cuttingQuantity', key: 'cuttingQuantity', width: 80, align: 'right' as const },
    { title: '完成数量', dataIndex: 'completedQuantity', key: 'completedQuantity', width: 80, align: 'right' as const },
    { title: '入库数量', dataIndex: 'warehousingQualifiedQuantity', key: 'warehousingQualifiedQuantity', width: 80, align: 'right' as const },
    { title: '出货数量', dataIndex: 'outstockQuantity', key: 'outstockQuantity', width: 80, align: 'right' as const },
    { title: '裁剪损耗', key: 'cuttingWaste', width: 100, align: 'right' as const, render: (_: unknown, record: OrderWasteAnalysisDTO) => `${record.cuttingWaste} (${record.cuttingWasteRate}%)` },
    { title: '生产损耗', key: 'productionWaste', width: 100, align: 'right' as const, render: (_: unknown, record: OrderWasteAnalysisDTO) => `${record.productionWaste} (${record.productionWasteRate}%)` },
    { title: '质检损耗', key: 'qualityWaste', width: 100, align: 'right' as const, render: (_: unknown, record: OrderWasteAnalysisDTO) => `${record.qualityWaste} (${record.qualityWasteRate}%)` },
    { title: '出货损耗', key: 'shipmentWaste', width: 100, align: 'right' as const, render: (_: unknown, record: OrderWasteAnalysisDTO) => `${record.shipmentWaste} (${record.shipmentWasteRate}%)` },
    { title: '总损耗', key: 'totalWaste', width: 80, align: 'right' as const, render: (_: unknown, record: OrderWasteAnalysisDTO) => <span className="font-bold">{record.totalWaste} ({record.totalWasteRate}%)</span> },
    { title: '分摊后单价', key: 'unitCostWithWasteAllocation', width: 120, align: 'right' as const, render: (text: string) => `¥${text}` },
    { title: '成本增幅', key: 'unitCostIncreaseRate', width: 100, align: 'right' as const, render: (text: string) => <Tag color={parseFloat(text) > 0 ? 'red' : 'green'}>{text}%</Tag> },
    { title: '状态', dataIndex: 'orderStatus', key: 'orderStatus', width: 80 },
  ];

  return (
    <PageLayout title="订单损耗财务分析">
      <div className="page-content">
        <Card className="filter-card" style={{ marginBottom: 20 }}>
          <div className="flex gap-4 flex-wrap">
            <Input
              placeholder="款号"
              value={filters.styleNo}
              onChange={(e) => handleFilterChange('styleNo', e.target.value)}
              style={{ width: 200 }}
              onPressEnter={handleSearch}
            />
            <Input
              placeholder="订单号"
              value={filters.orderNo}
              onChange={(e) => handleFilterChange('orderNo', e.target.value)}
              style={{ width: 200 }}
              onPressEnter={handleSearch}
            />
            <Input
              placeholder="工厂名称"
              value={filters.factoryName}
              onChange={(e) => handleFilterChange('factoryName', e.target.value)}
              style={{ width: 200 }}
              onPressEnter={handleSearch}
            />
            <Select
              placeholder="工厂类型"
              value={filters.factoryType}
              onChange={(value) => handleFilterChange('factoryType', value)}
              style={{ width: 160 }}
            >
              <Option value="">全部</Option>
              <Option value="INTERNAL">内部工厂</Option>
              <Option value="EXTERNAL">外部工厂</Option>
            </Select>
            <RangePicker
              value={filters.dateRange.length === 2 ? filters.dateRange : null}
              onChange={(dates) => handleFilterChange('dateRange', dates ? [dates[0]!, dates[1]!] : [])}
              style={{ width: 300 }}
            />
            <button className="ant-btn ant-btn-primary" onClick={handleSearch}>查询</button>
          </div>
        </Card>

        {summary && (
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col span={6}>
              <Card>
                <Statistic title="总下单数量" value={summary.totalOrderQuantity} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="总出货数量" value={summary.totalOutstockQuantity} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="总损耗数量" value={summary.totalWaste} suffix={`(${summary.avgTotalWasteRate}%)`} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="损耗导致成本增加" value={`¥${summary.totalCostIncrease}`} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="裁剪损耗" value={`${summary.totalCuttingWaste} (${summary.avgCuttingWasteRate}%)`} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="生产损耗" value={`${summary.totalProductionWaste} (${summary.avgProductionWasteRate}%)`} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="质检损耗" value={`${summary.totalQualityWaste} (${summary.avgQualityWasteRate}%)`} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="出货损耗" value={`${summary.totalShipmentWaste} (${summary.avgShipmentWasteRate}%)`} />
              </Card>
            </Col>
          </Row>
        )}

        <Card title="订单损耗列表" style={{ marginBottom: 20 }}>
          <ResizableTable
            columns={columns}
            dataSource={dataSource}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ x: 1800 }}
            emptyDescription="暂无财务数据"
          />
          <StandardPagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={(page, pageSize) => fetchList(page, pageSize)}
          />
        </Card>

        {summary && summary.wasteByFactory.length > 0 && (
          <Card title="按工厂分析损耗" style={{ marginBottom: 20 }}>
            <ResizableTable
              storageKey="order-waste-by-factory"
              size="small"
              columns={[
                { title: '工厂名称', dataIndex: 'factoryName', key: 'factoryName' },
                { title: '下单数量', dataIndex: 'orderQuantity', key: 'orderQuantity', align: 'right' },
                { title: '损耗数量', dataIndex: 'wasteQuantity', key: 'wasteQuantity', align: 'right' },
                { title: '损耗率', dataIndex: 'wasteRate', key: 'wasteRate', align: 'right', render: (text: string) => `${text}%` },
              ]}
              dataSource={summary.wasteByFactory}
              rowKey="factoryName"
              pagination={false}
              scroll={{ x: 600 }}
            />
          </Card>
        )}

        {summary && summary.wasteByStyle.length > 0 && (
          <Card title="按款式分析损耗">
            <ResizableTable
              storageKey="order-waste-by-style"
              size="small"
              columns={[
                { title: '款号', dataIndex: 'styleNo', key: 'styleNo' },
                { title: '款名', dataIndex: 'styleName', key: 'styleName' },
                { title: '下单数量', dataIndex: 'orderQuantity', key: 'orderQuantity', align: 'right' },
                { title: '损耗数量', dataIndex: 'wasteQuantity', key: 'wasteQuantity', align: 'right' },
                { title: '损耗率', dataIndex: 'wasteRate', key: 'wasteRate', align: 'right', render: (text: string) => `${text}%` },
              ]}
              dataSource={summary.wasteByStyle}
              rowKey="styleNo"
              pagination={false}
              scroll={{ x: 600 }}
            />
          </Card>
        )}
      </div>
    </PageLayout>
  );
};

export default OrderWasteAnalysis;