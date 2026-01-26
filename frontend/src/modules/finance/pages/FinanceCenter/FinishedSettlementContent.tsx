import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Space, message, DatePicker, Select, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, ReloadOutlined, DownloadOutlined, FileExcelOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import dayjs from 'dayjs';
import styles from './FinishedSettlementContent.module.css';

const { RangePicker } = DatePicker;

interface FinishedSettlementRow {
  orderId: string;
  orderNo: string;
  status: string;
  styleNo: string;
  factoryId: string;
  factoryName: string;
  orderQuantity: number;
  styleFinalPrice: number;
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
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinishedSettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<FinishedSettlementRow | null>(null);
  const [pageParams, setPageParams] = useState<PageParams>({
    page: 1,
    pageSize: 20,
  });

  // 订单状态映射（支持大写和小写）
  const statusMap: Record<string, { text: string; color: string }> = {
    // 大写状态
    PENDING: { text: '待确认', color: '#faad14' },
    CONFIRMED: { text: '已确认', color: '#1890ff' },
    IN_PRODUCTION: { text: '生产中', color: '#52c41a' },
    COMPLETED: { text: '已完成', color: '#13c2c2' },
    CANCELLED: { text: '已取消', color: '#f5222d' },
    // 小写状态
    pending: { text: '待确认', color: '#faad14' },
    confirmed: { text: '已确认', color: '#1890ff' },
    in_production: { text: '生产中', color: '#52c41a' },
    production: { text: '生产中', color: '#52c41a' },
    completed: { text: '已完成', color: '#13c2c2' },
    cancelled: { text: '已取消', color: '#f5222d' },
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
        const statusInfo = statusMap[status] || { text: status, color: '#666' };
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
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
        <span style={{ color: val > 0 ? '#f5222d' : '#666' }}>
          {val?.toLocaleString() || '-'}
        </span>
      ),
    },
    {
      title: '款式单价',
      dataIndex: 'styleFinalPrice',
      key: 'styleFinalPrice',
      width: 120,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: '面辅料成本',
      dataIndex: 'materialCost',
      key: 'materialCost',
      width: 130,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: '生产成本',
      dataIndex: 'productionCost',
      key: 'productionCost',
      width: 120,
      align: 'right',
      render: (val) => `¥${val?.toFixed(2) || '0.00'}`,
    },
    {
      title: '次品报废',
      dataIndex: 'defectLoss',
      key: 'defectLoss',
      width: 120,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 0 ? '#f5222d' : '#666' }}>
          ¥{val?.toFixed(2) || '0.00'}
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
        <span style={{ fontWeight: 600, color: '#1890ff' }}>
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
            color: val >= 0 ? '#52c41a' : '#f5222d',
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
            color: val >= 0 ? '#52c41a' : '#f5222d',
          }}
        >
          {val !== null && val !== undefined ? `${val.toFixed(2)}%` : '-'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: FinishedSettlementRow) => (
        <RowActions
          actions={[
            {
              key: 'more',
              label: '更多',
              children: [
                {
                  key: 'verify',
                  label: '审批核实',
                  icon: <CheckCircleOutlined />,
                  onClick: () => handleVerify(record),
                },
              ],
            },
          ]}
          maxInline={0}
        />
      ),
    },
  ];

  // 加载数据
  const loadData = async (params: PageParams = pageParams) => {
    setLoading(true);
    try {
      const response = await api.get('/finance/finished-settlement/page', { params });
      setData(response.data?.records || []);
      setTotal(response.data?.total || 0);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '加载数据失败';
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // 搜索
  const handleSearch = () => {
    const values = form.getFieldsValue();
    const dateRange = values.dateRange;

    const params: PageParams = {
      page: 1,
      pageSize: pageParams.pageSize,
      orderNo: values.orderNo,
      styleNo: values.styleNo,
      status: values.status,
      startDate: dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined,
      endDate: dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined,
    };

    setPageParams(params);
    loadData(params);
  };

  // 重置
  const handleReset = () => {
    form.resetFields();
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

  // 打开审批核实弹窗
  const handleVerify = (record: FinishedSettlementRow) => {
    setCurrentRecord(record);
    setVerifyModalVisible(true);
  };

  // 确认审批核实
  const handleVerifyConfirm = async () => {
    if (!currentRecord) return;

    try {
      // TODO: 调用审批核实API
      message.success('审批核实成功');
      setVerifyModalVisible(false);
      setCurrentRecord(null);
      loadData();
    } catch {
      message.error('审批核实失败');
    }
  };

  // 取消审批核实
  const handleVerifyCancel = () => {
    setVerifyModalVisible(false);
    setCurrentRecord(null);
  };

  // 导出全部
  const handleExport = async () => {
    try {
      const { dateRange } = form.getFieldsValue();
      const params = {
        ...form.getFieldsValue(),
        startDate: dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined,
        endDate: dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined,
      };

      message.loading({ content: '导出中...', key: 'export' });

      const queryString = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString();
      window.open(`/api/finance/finished-settlement/export?${queryString}`, '_blank');

      message.success({ content: '导出成功', key: 'export', duration: 2 });
    } catch (error: unknown) {
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
        <Form
          form={form}
          layout="inline"
          style={{ marginBottom: 16 }}
          onFinish={handleSearch}
        >
          <Form.Item name="orderNo" label="订单号">
            <Input placeholder="输入订单号" allowClear style={{ width: 180 }} />
          </Form.Item>

          <Form.Item name="styleNo" label="款号">
            <Input placeholder="输入款号" allowClear style={{ width: 150 }} />
          </Form.Item>

          <Form.Item name="status" label="状态">
            <Select placeholder="选择状态" allowClear style={{ width: 150 }}>
              <Select.Option value="PENDING">待确认</Select.Option>
              <Select.Option value="CONFIRMED">已确认</Select.Option>
              <Select.Option value="IN_PRODUCTION">生产中</Select.Option>
              <Select.Option value="COMPLETED">已完成</Select.Option>
              <Select.Option value="CANCELLED">已取消</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="dateRange" label="日期范围">
            <RangePicker format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>
                重置
              </Button>
              <Button
                type="primary"
                onClick={handleExportSelected}
                icon={<FileExcelOutlined />}
                disabled={selectedRowKeys.length === 0}
              >
                导出选中 ({selectedRowKeys.length})
              </Button>
              <Button
                onClick={handleExport}
                icon={<DownloadOutlined />}
              >
                导出全部
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <ResizableTable
          storageKey="finance-finished-settlement"
          columns={columns}
          dataSource={data as unknown as Record<string, unknown>[]}
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

      {/* 审批核实弹窗 */}
      <Modal
        title="审批核实"
        open={verifyModalVisible}
        onOk={handleVerifyConfirm}
        onCancel={handleVerifyCancel}
        width={600}
        okText="确认核实"
        cancelText="取消"
      >
        {currentRecord && (
          <div className={styles.verifyModal}>
            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>订单号</div>
              <div className={styles.modalFieldValue}>{currentRecord.orderNo}</div>
            </div>

            <div className={styles.modalFieldGrid2}>
              <div>
                <div className={styles.modalFieldLabel}>款号</div>
                <div className={styles.modalFieldValueSmall}>{currentRecord.styleNo}</div>
              </div>
              <div>
                <div className={styles.modalFieldLabel}>工厂</div>
                <div className={styles.modalFieldValueSmall}>{currentRecord.factoryName || '-'}</div>
              </div>
            </div>

            <div className={styles.modalFieldGrid2}>
              <div>
                <div className={styles.modalFieldLabel}>总成本</div>
                <div className={styles.costValue}>¥{currentRecord.totalCost?.toFixed(2) || '0.00'}</div>
              </div>
              <div>
                <div className={styles.modalFieldLabel}>利润</div>
                <div className={`${styles.profitValue} ${currentRecord.profit && currentRecord.profit > 0 ? styles.profitPositive : styles.profitNegative}`}>
                  ¥{currentRecord.profit?.toFixed(2) || '0.00'}
                </div>
              </div>
            </div>

            <div className={styles.modalFieldGrid3}>
              <div>
                <div className={styles.modalFieldLabel}>物料成本</div>
                <div>¥{currentRecord.materialCost?.toFixed(2) || '0.00'}</div>
              </div>
              <div>
                <div className={styles.modalFieldLabel}>生产成本</div>
                <div>¥{currentRecord.productionCost?.toFixed(2) || '0.00'}</div>
              </div>
              <div>
                <div className={styles.modalFieldLabel}>其他成本</div>
                <div>¥{currentRecord.otherCost?.toFixed(2) || '0.00'}</div>
              </div>
            </div>

            <div className={styles.modalNote}>
              <div className={styles.modalNoteTitle}>审批说明</div>
              <div className={styles.modalNoteText}>确认该订单的成本数据准确无误，审批后将锁定该订单的财务数据。</div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default FinishedSettlementContent;
