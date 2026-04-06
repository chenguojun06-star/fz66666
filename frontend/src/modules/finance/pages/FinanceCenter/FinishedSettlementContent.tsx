import React, { useState, useEffect, useCallback } from 'react';
import { Card, Input, Button, App, Tooltip, Timeline, Select, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import api from '@/utils/api';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import RowActions from '@/components/common/RowActions';
import StandardModal from '@/components/common/StandardModal';
import SmallModal from '@/components/common/SmallModal';
import dayjs from 'dayjs';
import styles from './FinishedSettlementContent.module.css';
import type { Dayjs } from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import { downloadFile } from '@/utils/fileUrl';
import { readPageSize } from '@/utils/pageSizeStore';

interface FinishedSettlementRow {
  orderId: string;
  orderNo: string;
  status: string;
  styleNo: string;
  factoryId: string;
  factoryName: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  parentOrgUnitName?: string;
  orgPath?: string;
  orderQuantity: number;
  styleFinalPrice: number;
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
  parentOrgUnitId?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL' | '';
  startDate?: string;
  endDate?: string;
}

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const FinishedSettlementContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
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
  const [selectedFactoryType, setSelectedFactoryType] = useState('');
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const { factoryTypeOptions } = useOrganizationFilterOptions();
  const [pageParams, setPageParams] = useState<PageParams>({
    page: 1,
    pageSize: readPageSize(20),
  });
  const buildPageParams = useCallback((overrides?: Partial<PageParams>): PageParams => ({
    page: overrides?.page || 1,
    pageSize: overrides?.pageSize || pageParams.pageSize,
    orderNo: (overrides?.orderNo ?? searchOrderNo) || undefined,
    styleNo: (overrides?.styleNo ?? searchStyleNo) || undefined,
    status: (overrides?.status ?? searchStatus) || undefined,
    factoryType: ((overrides?.factoryType ?? selectedFactoryType) || undefined) as PageParams['factoryType'],
    startDate: overrides?.startDate ?? (dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined),
    endDate: overrides?.endDate ?? (dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined),
  }), [dateRange, pageParams.pageSize, searchOrderNo, searchStatus, searchStyleNo, selectedFactoryType]);

  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

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
      render: (text: string, _record: FinishedSettlementRow) => (
        <span className={styles.orderNo}>{text}</span>
      ),
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
      width: 220,
      render: (_text, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {record.factoryType === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
            {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
            <span>{record.factoryName || '-'}</span>
          </div>
          {(record.orgPath || record.parentOrgUnitName) &&
           (record.orgPath || record.parentOrgUnitName) !== record.factoryName ? (
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
              {record.orgPath || record.parentOrgUnitName}
            </div>
          ) : null}
        </div>
      ),
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
        <Tooltip title="下单时锁定的加工单价">
          <span>下单锁定单价</span>
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
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, record: FinishedSettlementRow) => {
        // 内部工厂在工资结算中审核，此页面禁止审核内部工厂订单
        const isInternalFactory = record.factoryType === 'INTERNAL';
        const canAudit = !isInternalFactory && isOrderFrozenByStatus(record) && !auditedOrderNos.has(record.orderNo);
        const isAudited = auditedOrderNos.has(record.orderNo);
        const isCancelled = ['CANCELLED', 'cancelled', 'DELETED', 'deleted', 'scrapped', '废弃', '已取消'].includes(record.status || '');
        return (
          <RowActions
            actions={[
              {
                key: 'approve',
                label: isAudited ? '已审核' : '审核',
                primary: canAudit,
                disabled: isInternalFactory || isCancelled || isAudited || !isOrderFrozenByStatus(record),
                onClick: () => handleAuditOrder(record),
              },
              {
                key: 'remark',
                label: '备注',
                onClick: () => openRemarkModal(record),
              },
              {
                key: 'log',
                label: '日志',
                onClick: () => openLogModal(record.orderId),
              },
            ]}
          />
        );
      },
    },
  ];

  // 加载数据
  const loadData = async (params: PageParams = pageParams) => {
    setLoading(true);
    try {
      const response = await api.get('/finance/finished-settlement/list', { params });
      setData(response.data?.records || []);
      setTotal(response.data?.total || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : '加载数据失败';
      reportSmartError('成品结算列表加载失败', errMsg, 'FIN_SETTLEMENT_LIST_LOAD_FAILED');
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // 搜索
  const handleSearch = (overrides?: Partial<PageParams>) => {
    const params = buildPageParams(overrides);
    setPageParams(params);
    loadData(params);
  };

  // 重置
  const handleReset = () => {
    setSearchOrderNo('');
    setSearchStyleNo('');
    setSearchStatus('');
    setSelectedFactoryType('');
    setDateRange(null);
    const params: PageParams = { page: 1, pageSize: 20 };
    setPageParams(params);
    loadData(params);
  };

  // 审核单条订单（仅外部工厂·已关单才可审核；内部工厂请在工资结算中审核）
  const handleAuditOrder = (record: FinishedSettlementRow) => {
    if (record.factoryType === 'INTERNAL') {
      message.warning('内部工厂订单请在「工资结算」中审核');
      return;
    }
    if (!isOrderFrozenByStatus(record)) {
      message.warning('该订单尚未关单，无法审核');
      return;
    }
    onAuditNosChange(new Set([...auditedOrderNos, record.orderNo]));
    message.success(`订单 ${record.orderNo} 已审核，可在「工厂订单汇总」进行终审推送`);
  };

  // 批量审核（仅外部工厂·已关单且未审核；内部工厂跳过）
  const handleBatchAudit = () => {
    const eligible = data.filter(r =>
      selectedRowKeys.includes(r.orderId) &&
      r.factoryType !== 'INTERNAL' &&
      isOrderFrozenByStatus(r) &&
      !auditedOrderNos.has(r.orderNo)
    );
    if (eligible.length === 0) {
      message.warning('选中订单中没有可审核的（外部工厂·已关单且未审核）');
      return;
    }
    const newNos = new Set(auditedOrderNos);
    eligible.forEach(r => newNos.add(r.orderNo));
    onAuditNosChange(newNos);
    message.success(`批量审核 ${eligible.length} 个订单成功`);
    setSelectedRowKeys([]);
  };

  // 导出选中的数据
  const handleExportSelected = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要导出的订单');
      return;
    }

    const queryParams = new URLSearchParams();
    selectedRowKeys.forEach(id => queryParams.append('orderIds', id));
    downloadFile(`/api/finance/finished-settlement/export?${queryParams.toString()}`);
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
      reportSmartError('结算备注保存失败', errMsg, 'FIN_SETTLEMENT_REMARK_SAVE_FAILED');
      message.error(errMsg);
    }
  };

  // 已除去：新流程不再向后端查询审核状态

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
      reportSmartError('结算日志加载失败', errMsg, 'FIN_SETTLEMENT_LOG_LOAD_FAILED');
      message.error(errMsg);
    }
  };

  // 导出全部
  const handleExport = async () => {
    try {
      const params = buildPageParams();

      message.loading({ content: '导出中...', key: 'export' });

      const queryString = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString();
      downloadFile(`/api/finance/finished-settlement/export?${queryString}`);

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
      <PageLayout
        filterCard={false}
        headerContent={
          showSmartErrorNotice && smartError ? (
            <Card size="small" style={{ marginBottom: 12 }}>
              <SmartErrorNotice
                error={smartError}
                onFix={() => {
                  void loadData();
                }}
              />
            </Card>
          ) : null
        }
        filterLeft={
          <>
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
                  handleSearch({ status: (value || undefined) as PageParams['status'] });
                }}
                statusOptions={[
                  { label: '全部', value: '' },
                  { label: '生产中', value: 'production' },
                  { label: '已完成', value: 'completed' },
                ]}
              />
              <Select
                value={selectedFactoryType}
                onChange={(value) => {
                  const nextValue = value || '';
                  setSelectedFactoryType(nextValue);
                  handleSearch({ factoryType: (nextValue || undefined) as PageParams['factoryType'] });
                }}
                placeholder="内外标签"
                allowClear
                style={{ minWidth: 110 }}
                options={factoryTypeOptions}
              />
          </>
        }
        filterRight={
          <>
              <Button
                type="primary"
                onClick={handleBatchAudit}
                disabled={selectedRowKeys.length === 0 || !data.some(r =>
                  selectedRowKeys.includes(r.orderId) &&
                  r.factoryType !== 'INTERNAL' &&
                  isOrderFrozenByStatus(r) &&
                  !auditedOrderNos.has(r.orderNo)
                )}
              >
                批量审核 ({selectedRowKeys.length})
              </Button>
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
        }
      >

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
      </PageLayout>

      {/* 备注编辑弹窗 */}
      <SmallModal
        title="编辑备注"
        open={remarkModalVisible}
        onOk={saveRemark}
        onCancel={() => setRemarkModalVisible(false)}
        okText="保存"
        cancelText="取消"
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
      </SmallModal>

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
