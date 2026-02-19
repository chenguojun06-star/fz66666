import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Space, App, Select, Tooltip, Timeline } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, DownloadOutlined, EditOutlined, HistoryOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import RowActions from '@/components/common/RowActions';
import StandardModal from '@/components/common/StandardModal';
import dayjs from 'dayjs';
import styles from './FinishedSettlementContent.module.css';
import type { Dayjs } from 'dayjs';

interface FinishedSettlementRow {
  orderId: string;
  orderNo: string;
  status: string;
  styleNo: string;
  factoryId: string;
  factoryName: string;
  orderQuantity: number;
  styleFinalPrice: number;    // 销售单价（含利润率），来自 t_style_quotation.total_price
  targetProfitRate?: number;  // 目标利润率(%)，来自报价单设定值
  warehousedQuantity: number;
  defectQuantity: number;
  colors: string;
  materialCost: number;
  productionCost: number;
  defectLoss: number;
  totalAmount: number;
  totalCost?: number;
  otherCost?: number;
  profit: number;
  profitMargin: number;
  createTime: string;
  completeTime?: string;
  remark?: string; // 备注
  [key: string]: unknown; // 索引签名，兼容 ResizableTable
}

interface PageParams {
  page: number;
  pageSize: number;
  orderNo?: string;
  styleNo?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

const FinishedSettlementContent: React.FC = () => {
  const { message } = App.useApp();
  const [searchOrderNo, setSearchOrderNo] = useState('');
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinishedSettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [remarkModalVisible, setRemarkModalVisible] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string>('');
  const [remarkText, setRemarkText] = useState<string>('');
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [orderLogs, setOrderLogs] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [pageParams, setPageParams] = useState<PageParams>({
    page: 1,
    pageSize: 20,
  });

  // 订单状态映射（支持大写和小写）
  const statusMap: Record<string, { text: string; color: string }> = {
    // 大写状态
    PENDING: { text: '待确认', color: 'var(--color-warning)' },
    CONFIRMED: { text: '已确认', color: 'var(--primary-color)' },
    IN_PRODUCTION: { text: '生产中', color: 'var(--color-success)' },
    COMPLETED: { text: '已完成', color: 'var(--info-color)' },
    CANCELLED: { text: '已取消', color: 'var(--color-danger)' },
    // 小写状态
    pending: { text: '待确认', color: 'var(--color-warning)' },
    confirmed: { text: '已确认', color: 'var(--primary-color)' },
    in_production: { text: '生产中', color: 'var(--color-success)' },
    production: { text: '生产中', color: 'var(--color-success)' },
    completed: { text: '已完成', color: 'var(--info-color)' },
    cancelled: { text: '已取消', color: 'var(--color-danger)' },
  };

  // 表格列定义
  const columns: ColumnsType<FinishedSettlementRow> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
      render: (text) => <span className={styles.orderNo}>{text}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusInfo = statusMap[status] || { text: status, color: 'var(--neutral-text-secondary)' };
        return (
          <span
            style={{
              padding: '2px 8px',
              fontSize: '12px',
              backgroundColor: `${statusInfo.color}15`,
              color: statusInfo.color,
              fontWeight: 500,
            }}
          >
            {statusInfo.text}
          </span>
        );
      },
    },
    {
      title: '完成时间',
      dataIndex: 'completeTime',
      key: 'completeTime',
      width: 160,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '颜色',
      dataIndex: 'colors',
      key: 'colors',
      width: 100,
    },
    {
      title: '下单数',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '-',
    },
    {
      title: '入库数',
      dataIndex: 'warehousedQuantity',
      key: 'warehousedQuantity',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '-',
    },
    {
      title: '次品数',
      dataIndex: 'defectQuantity',
      key: 'defectQuantity',
      width: 100,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 0 ? 'var(--color-danger)' : '#666' }}>
          {val?.toLocaleString() || '-'}
        </span>
      ),
    },
    {
      title: (
        <Tooltip title="款式报价单单价（BOM+工序成本合计含利润）">
          <span>单价</span>
        </Tooltip>
      ),
      dataIndex: 'styleFinalPrice',
      key: 'styleFinalPrice',
      width: 150,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
          ¥{val?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: (
        <Tooltip title="面辅料采购总成本（状态：已收货/已完成）">
          <span>面辅料成本</span>
        </Tooltip>
      ),
      dataIndex: 'materialCost',
      key: 'materialCost',
      width: 130,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: (
        <Tooltip title="生产过程中工序扫码成本总计（生产工序单价之和）">
          <span>生产成本</span>
        </Tooltip>
      ),
      dataIndex: 'productionCost',
      key: 'productionCost',
      width: 120,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: (
        <Tooltip title="次品报废损失 = 次品数 × 单件成本（面辅料+生产）">
          <span>报废损失</span>
        </Tooltip>
      ),
      dataIndex: 'defectLoss',
      key: 'defectLoss',
      width: 120,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 0 ? 'var(--color-danger)' : 'var(--neutral-text-secondary)' }}>
          {val > 0 ? '-' : ''}¥{val?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 130,
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
          ¥{val?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: '利润',
      dataIndex: 'profit',
      key: 'profit',
      width: 130,
      align: 'right',
      render: (val) => (
        <span
          style={{
            fontWeight: 600,
            color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          ¥{val?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: '利润率',
      dataIndex: 'profitMargin',
      key: 'profitMargin',
      width: 100,
      align: 'right',
      render: (val) => (
        <span
          style={{
            fontWeight: 600,
            color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {val !== null && val !== undefined ? `${val.toFixed(2)}%` : '-'}
        </span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: {
        showTitle: false,
      },
      render: (text: string | undefined, _record: FinishedSettlementRow) => (
        <Tooltip title={text || '暂无备注'}>
          <span style={{ cursor: 'pointer', color: text ? 'var(--primary-color)' : 'var(--neutral-text-disabled)' }}>
            {text || '暂无'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: FinishedSettlementRow) => (
        <RowActions
          actions={[
            {
              key: 'remark',
              label: '备注',
              primary: true,
              onClick: () => openRemarkModal(record),
            },
            {
              key: 'log',
              label: '日志',
              onClick: () => openLogModal(record.orderId),
            },
          ]}
        />
      ),
    },
  ];

  // 加载数据
  const loadData = async (params: PageParams = pageParams) => {
    setLoading(true);
    try {
      const response = await api.get('/finance/finished-settlement/list', { params });
      setData(response.data?.records || []);
      setTotal(response.data?.total || 0);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : '加载数据失败';
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // 搜索
  const handleSearch = () => {
    const params: PageParams = {
      page: 1,
      pageSize: pageParams.pageSize,
      orderNo: searchOrderNo || undefined,
      styleNo: searchStyleNo || undefined,
      status: searchStatus || undefined,
      startDate: dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined,
      endDate: dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined,
    };

    setPageParams(params);
    loadData(params);
  };

  // 重置
  const handleReset = () => {
    setSearchOrderNo('');
    setSearchStyleNo('');
    setSearchStatus('');
    setDateRange(null);
    const params: PageParams = { page: 1, pageSize: 20 };
    setPageParams(params);
    loadData(params);
  };

  // 导出选中的数据
  const handleExportSelected = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要导出的订单');
      return;
    }

    const queryParams = new URLSearchParams();
    selectedRowKeys.forEach(id => queryParams.append('orderIds', id));
    window.open(`/api/finance/finished-settlement/export?${queryParams.toString()}`, '_blank');
    message.success(`正在导出 ${selectedRowKeys.length} 条数据...`);
  };

  // 打开备注弹窗
  const openRemarkModal = (record: FinishedSettlementRow) => {
    setEditingOrderId(record.orderId);
    setRemarkText(record.remark || '');
    setRemarkModalVisible(true);
  };

  // 保存备注
  const saveRemark = async () => {
    if (!editingOrderId) return;

    try {
      await api.post(`/finance/finished-settlement/${editingOrderId}/remark`, {
        remark: remarkText,
      });
      message.success('备注保存成功');
      setRemarkModalVisible(false);
      loadData();
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : '保存备注失败';
      message.error(errMsg);
    }
  };

  // 打开日志弹窗 - 从后端获取操作日志
  const openLogModal = async (orderId: string) => {
    try {
      const response = await api.get<{ code: number; data: Array<{ time?: string; createTime?: string; operator?: string; operatorName?: string; action?: string; operation?: string }> }>(
        `/finance/shipment-reconciliation/${orderId}/logs`
      );
      if (response.code === 200 && Array.isArray(response.data) && response.data.length > 0) {
        setOrderLogs(response.data.map(item => ({
          time: item.time || item.createTime || '-',
          operator: item.operator || item.operatorName || '-',
          action: item.action || item.operation || '-',
        })));
      } else {
        // 后端暂无日志数据
        setOrderLogs([]);
      }
      setLogModalVisible(true);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : '获取日志失败';
      message.error(errMsg);
    }
  };

  // 导出全部
  const handleExport = async () => {
    try {
      const params = {
        orderNo: searchOrderNo || undefined,
        styleNo: searchStyleNo || undefined,
        status: searchStatus || undefined,
        startDate: dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined,
        endDate: dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined,
      };

      message.loading({ content: '导出中...', key: 'export' });

      const queryString = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString();
      window.open(`/api/finance/finished-settlement/export?${queryString}`, '_blank');

      message.success({ content: '导出成功', key: 'export', duration: 2 });
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : '导出失败';
      message.error({ content: errMsg, key: 'export', duration: 2 });
    }
  };

  // 表格分页变化
  const handleTableChange = (pagination: { current?: number; pageSize?: number }) => {
    const params = {
      ...pageParams,
      page: pagination.current || 1,
      pageSize: pagination.pageSize || 20,
    };
    setPageParams(params);
    loadData(params);
  };

  // 初始加载
  useEffect(() => {
    loadData();
  }, []);

  return (
    <>
      <Card>
        <StandardToolbar
          left={(
            <StandardSearchBar
              searchValue={searchOrderNo}
              onSearchChange={(value) => {
                setSearchOrderNo(value);
                setSearchStyleNo('');
                handleSearch();
              }}
              searchPlaceholder="搜索订单号/款号"
              dateValue={dateRange}
              onDateChange={(value) => {
                setDateRange(value);
                handleSearch();
              }}
              statusValue={searchStatus}
              onStatusChange={(value) => {
                setSearchStatus(value || '');
                handleSearch();
              }}
              statusOptions={[
                { label: '全部', value: '' },
                { label: '待确认', value: 'PENDING' },
                { label: '已确认', value: 'CONFIRMED' },
                { label: '生产中', value: 'IN_PRODUCTION' },
                { label: '已完成', value: 'COMPLETED' },
                // 已取消的订单不参与结算，不显示在列表中
              ]}
            />
          )}
          right={(
            <>
              <Button onClick={handleReset}>
                重置
              </Button>
              <Button
                type="primary"
                onClick={handleExportSelected}
                disabled={selectedRowKeys.length === 0}
              >
                导出选中 ({selectedRowKeys.length})
              </Button>
              <Button onClick={handleExport}>
                导出全部
              </Button>
            </>
          )}
        />

        <ResizableTable<FinishedSettlementRow>
          storageKey="finance-finished-settlement"
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="orderId"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
          }}
          scroll={{ x: 1800 }}
          pagination={{
            current: pageParams.page,
            pageSize: pageParams.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
        />
      </Card>

      {/* 备注编辑弹窗 */}
      <StandardModal
        title="编辑备注"
        open={remarkModalVisible}
        onOk={saveRemark}
        onCancel={() => setRemarkModalVisible(false)}
        okText="保存"
        cancelText="取消"
        size="sm"
      >
        <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--neutral-text-secondary)' }}>
          备注内容
        </div>
        <Input.TextArea
          rows={6}
          value={remarkText}
          onChange={(e) => setRemarkText(e.target.value)}
          placeholder="请输入备注内容..."
          maxLength={500}
          showCount
        />
      </StandardModal>

      {/* 操作日志弹窗 */}
      <StandardModal
        title="操作日志"
        open={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        footer={<Button onClick={() => setLogModalVisible(false)}>关闭</Button>}
        size="md"
      >
        {orderLogs.length > 0 ? (
          <Timeline
            items={orderLogs.map((log: any) => ({
              children: (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {log.action || log.operationType}
                  </div>
                  <div style={{ color: 'var(--neutral-text-secondary)', fontSize: '13px', marginBottom: 4 }}>
                    {log.description || log.content}
                  </div>
                  <div style={{ color: 'var(--neutral-text-disabled)', fontSize: '12px' }}>
                    <span>{log.operatorName || log.userName || '系统'}</span>
                    <span style={{ margin: '0 8px' }}>·</span>
                    <span>{log.createTime ? dayjs(log.createTime).format('YYYY-MM-DD HH:mm:ss') : '-'}</span>
                  </div>
                </div>
              ),
            }))}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--neutral-text-disabled)' }}>
            暂无操作日志
          </div>
        )}
      </StandardModal>
    </>
  );
};

export default FinishedSettlementContent;
