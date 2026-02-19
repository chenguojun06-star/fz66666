import React, { useState, useEffect } from 'react';
import { Card, Button, Input, message, Modal, Form, InputNumber, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardModal from '@/components/common/StandardModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import UniversalCardView from '@/components/common/UniversalCardView';
import StylePrintModal from '@/components/common/StylePrintModal';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useModal } from '@/hooks';
import { formatDateTime } from '@/utils/datetime';
import './style.css';
import type { Dayjs } from 'dayjs';

interface ProgressNode {
  id: string;
  name: string;
  unitPrice?: number;
}

interface PatternProductionRecord {
  id: string;
  styleId?: string;
  styleNo: string;
  color: string;
  sizes?: string[]; // 码数列表
  quantity: number;
  releaseTime: string; // 下板时间
  deliveryTime: string; // 交板时间
  receiver: string; // 领取人
  receiveTime: string; // 领取时间
  completeTime: string; // 完成时间
  progressNodes: { [nodeId: string]: number }; // 各工序的完成百分比
  processUnitPrices?: { [processName: string]: number }; // 工序单价汇总（从后端获取）
  processDetails?: { [stageName: string]: Array<{ name: string; unitPrice: number }> }; // 每个节点下的工序明细
  procurementProgress?: { // 采购进度信息
    total: number; // 总采购单数
    completed: number; // 已完成采购单数
    percent: number; // 完成百分比
    completedTime?: string; // 最新完成时间
    receiver?: string; // 最新领取人
  };
  orderNo?: string; // 订单号
  coverImage?: string; // 封面图片
  patternMaker?: string; // 纸样师傅
  // 人员信息（从款式基础信息同步）
  designer?: string; // 设计师
  patternDeveloper?: string; // 纸样师
  plateWorker?: string; // 车板师
  merchandiser?: string; // 跟单员
  maintainer?: string; // 维护人
  maintainTime?: string; // 维护时间
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'; // 状态
}

// 默认工序节点（不含单价，单价从后端获取）
const DEFAULT_NODES: ProgressNode[] = [
  { id: 'cutting', name: '裁剪' },
  { id: 'sewing', name: '车缝' },
  { id: 'ironing', name: '大烫' },
  { id: 'quality', name: '质检' },
  { id: 'secondary', name: '二次工艺' },
  { id: 'packaging', name: '包装' },
];

// Lottie 液体进度组件（已移至通用组件 LiquidProgressLottie）

// 计算交期状态
const getDeliveryStatus = (deliveryTime: string): 'normal' | 'warning' | 'danger' => {
  const now = new Date();
  const delivery = new Date(deliveryTime);
  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'danger'; // 已逾期
  if (diffDays <= 3) return 'warning'; // 3天内临近
  return 'normal'; // 充足时间
};

// 计算总体进度百分比（从 record 对象中提取 progressNodes）
const calculateProgress = (record: PatternProductionRecord): number => {
  const progressNodes = record.progressNodes;
  if (!progressNodes) return 0;
  const values = Object.values(progressNodes);
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
};

const PatternProduction: React.FC = () => {
  const [dataSource, setDataSource] = useState<PatternProductionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [statusValue, setStatusValue] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [operationLogVisible, setOperationLogVisible] = useState(false);

  // ===== 使用 useModal 管理弹窗状态 =====
  const progressModal = useModal<PatternProductionRecord>();
  const attachmentModal = useModal<PatternProductionRecord>();
  const attachmentWrapperRef = React.useRef<HTMLDivElement>(null);
  const [operationLogs, setOperationLogs] = useState<Array<{
    id: string;
    action: string;
    operator: string;
    time: string;
    detail: string;
  }>>([]);
  const [form] = Form.useForm();

  // 当 attachmentModal 打开时，程序化触发附件按钮点击
  useEffect(() => {
    if (attachmentModal.visible && attachmentWrapperRef.current) {
      const button = attachmentWrapperRef.current.querySelector('button');
      if (button) {
        button.click();
        // 注意：不要立即关闭 attachmentModal，因为需要保持 data 来渲染隐藏的按钮组件
      }
    }
  }, [attachmentModal.visible]);

  // 当进度弹窗打开时，填充表单数据
  // 解决 warning: Instance created by useForm is not connected to any Form element
  useEffect(() => {
    if (progressModal.visible && progressModal.data) {
      // 延迟一点以确保 Form 已渲染（如果是 destroyOnClose=true）
      // 使用 requestAnimationFrame 或 setTimeout
      const timer = setTimeout(() => {
        form.setFieldsValue(progressModal.data!.progressNodes);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [progressModal.visible, progressModal.data, form]);

  // 记录操作日志
  const addOperationLog = (action: string, detail: string) => {
    const newLog = {
      id: `log_${Date.now()}`,
      action,
      operator: '系统管理员', // 实际应从 UserContext 获取
      time: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      detail,
    };
    setOperationLogs(prev => [newLog, ...prev]);
  };

  // 数据加载
  useEffect(() => {
    loadData();
  }, [searchText, statusValue, dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/production/pattern/list', {
        params: {
          page: 1,
          pageSize: 100,
          keyword: searchText || undefined,
          status: statusValue || undefined,
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        }
      });

      const records = response.data?.records || [];

      // 转换后端数据格式为前端格式
      const formattedData: PatternProductionRecord[] = records.map((item: any) => {
        const statusRaw = String(item.status || 'PENDING').toUpperCase();
        // 归一化状态值
        let normalizedStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' = 'PENDING';
        if (statusRaw === 'COMPLETED' || statusRaw === 'DONE' || Boolean(item.completeTime)) {
          normalizedStatus = 'COMPLETED';
        } else if (statusRaw === 'IN_PROGRESS' || statusRaw === 'DOING') {
          normalizedStatus = 'IN_PROGRESS';
        }

        const baseProgressNodes = item.progressNodes ? JSON.parse(item.progressNodes) : {
          cutting: 0,
          sewing: 0,
          ironing: 0,
          quality: 0,
          secondary: 0,
          packaging: 0,
        };

        const completedFlag = normalizedStatus === 'COMPLETED';
        const progressNodes = completedFlag
          ? {
            ...baseProgressNodes,
            procurement: 100,
            cutting: 100,
            sewing: 100,
            tail: 100,
            warehousing: 100,
          }
          : baseProgressNodes;

        const baseProcurementProgress = item.procurementProgress || {
          total: 0,
          completed: 0,
          percent: 0,
        };

        const procurementProgress = completedFlag
          ? {
            ...baseProcurementProgress,
            percent: 100,
            completed: Number(baseProcurementProgress.total || 0),
          }
          : baseProcurementProgress;

        return {
          id: item.id,
          styleId: item.styleId,
          styleNo: item.styleNo || '-',
          color: item.color || '',
          sizes: item.sizes || [], // 从后端获取码数
          quantity: item.quantity ?? 0,
          releaseTime: formatDateTime(item.releaseTime) || '-',
          deliveryTime: formatDateTime(item.deliveryTime) || '-',
          receiver: item.receiver || '-',
          receiveTime: formatDateTime(item.receiveTime) || '-',
          completeTime: formatDateTime(item.completeTime) || '-',
          coverImage: item.coverImage,
          patternMaker: item.patternMaker || '-',
          progressNodes,
          // 工序单价汇总从后端获取（从样板开发的工艺配置汇总）
          processUnitPrices: item.processUnitPrices || {},
          // 每个节点下的工序明细（含工序名和单价）
          processDetails: item.processDetails || {},
          // 采购进度信息
          procurementProgress,
          status: normalizedStatus,
        };
      });

      setDataSource(formattedData);
    } catch (error) {
      console.error('加载样板生产数据失败:', error);
      message.error('加载数据失败');
      setDataSource([]); // 出错时显示空列表
    } finally {
      setLoading(false);
    }
  };

  // 直接领取（不弹窗）
  const handleReceive = async (record: PatternProductionRecord) => {
    try {
      await api.post(`/production/pattern/${record.id}/workflow-action`, {}, { params: { action: 'receive' } });
      message.success('领取成功');
      addOperationLog('领取', `领取：${record.styleNo}`);
      loadData();
    } catch (error: any) {
      message.error(error.message || '领取失败');
    }
  };

  // 打开进度更新对话框
  const handleOpenProgress = (record: PatternProductionRecord) => {
    // form.setFieldsValue(record.progressNodes); // 改为在 useEffect 中处理
    progressModal.open(record);
  };

  const handleOpenDetail = (record: PatternProductionRecord) => {
    progressModal.open(record);
  };

  // 打印模态框
  const printModal = useModal<PatternProductionRecord>();

  // 打印样板生产单（使用通用打印模态框）
  const handlePrint = (record: PatternProductionRecord) => {
    printModal.open(record);
  };

  // 维护操作
  const handleMaintenance = (record: PatternProductionRecord) => {
    let maintenanceReason = '';
    Modal.confirm({
      title: '维护',
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>
            维护样板：{record.styleNo} - {record.color}
          </div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>维护原因：</div>
          <Input.TextArea
            placeholder="请输入维护原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              maintenanceReason = e.target.value;
            }}
          />
        </div>
      ),
      okText: '确认维护',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const reason = maintenanceReason.trim();
        if (!reason) {
          message.error('请输入维护原因');
          return Promise.reject(new Error('请输入维护原因'));
        }
        try {
          await api.post(`/production/pattern/${record.id}/workflow-action`, { reason }, { params: { action: 'maintenance' } });
          message.success('维护成功');
          addOperationLog('维护记录', `维护样板：${record.styleNo}，原因：${reason}`);
          loadData();
        } catch (error: any) {
          message.error(error.message || '维护失败');
        }
      },
    });
  };

  // 删除样板生产记录（保留但标记为未使用）
  const _handleDelete = async (record: PatternProductionRecord) => {
    let deleteReason = '';
    Modal.confirm({
      title: '确认删除',
      content: (
        <div>
          <div style={{ marginBottom: 12, color: 'var(--error-color)', fontWeight: 600 }}>
            删除样板生产记录：{record.styleNo} - {record.color}
          </div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>请输入删除原因：</div>
          <Input.TextArea
            placeholder="请输入删除原因（必填）"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              deleteReason = e.target.value;
            }}
          />
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const reason = deleteReason.trim();
        if (!reason) {
          message.error('请输入删除原因');
          return Promise.reject(new Error('请输入删除原因'));
        }
        try {
          await api.delete(`/production/pattern/${record.id}`, {
            data: { reason },
          });
          message.success('删除成功');
          addOperationLog('删除记录', `删除样板生产记录：${record.styleNo}，原因：${reason}`);
          loadData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  // 更新工序进度
  const handleUpdateProgress = async () => {
    try {
      const values = await form.validateFields();
      await api.post(`/production/pattern/${progressModal.data!.id}/progress`, values);
      message.success('进度更新成功');
      progressModal.close();
      form.resetFields();
      loadData(); // 刷新列表
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查输入数据');
      } else {
        message.error(error.message || '更新失败');
      }
    }
  };

  // 渲染状态标签
  const renderStatus = (status: string) => {
    const normalized = String(status || 'PENDING').toUpperCase();
    const statusMap: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
      PENDING: { text: '待领取', color: 'default', icon: <ClockCircleOutlined /> },
      IN_PROGRESS: { text: '进行中', color: 'processing', icon: <SyncOutlined spin /> },
      COMPLETED: { text: '已完成', color: 'success', icon: <CheckCircleOutlined /> },
    };
    const config = statusMap[normalized] || statusMap.PENDING;
    return <Tag icon={config.icon} color={config.color}>{config.text}</Tag>;
  };

  // 构建表格列
  const columns: ColumnsType<PatternProductionRecord> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '图片',
      dataIndex: 'coverImage',
      key: 'coverImage',
      width: 80,
      render: (coverImage: string) => (
        <div style={{
          width: 60,
          height: 60,

          overflow: 'hidden',
          background: 'var(--color-bg-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {coverImage ? (
            <img src={getFullAuthedFileUrl(coverImage)} alt="样板图" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>无图</span>
          )}
        </div>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
    },
    {
      title: '码数',
      dataIndex: 'sizes',
      key: 'sizes',
      width: 120,
      render: (sizes: string[]) => {
        if (!sizes || sizes.length === 0) return '-';
        return (
          <div style={{ lineHeight: '1.5' }}>
            {sizes.join(', ')}
          </div>
        );
      },
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'center',
    },
    {
      title: '纸样师傅',
      dataIndex: 'patternMaker',
      key: 'patternMaker',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '生产进度',
      dataIndex: 'progressNodes',
      key: 'progressNodes',
      width: 900,
      align: 'center' as const,
      render: (progressNodes: { [key: string]: number }, record) => {
        // 从后端获取的进度节点配置和单价汇总
        const processUnitPrices = record.processUnitPrices || {};

        // 动态构建进度节点列表（从样板开发的工艺配置读取）
        // 进度节点按顺序：采购、裁剪、车缝、尾部、入库
        const progressStages = ['采购', '裁剪', '车缝', '尾部', '入库'];
        const nodesWithPrices = progressStages.map((stageName) => {
          // 节点ID使用拼音映射
          const stageIdMap: Record<string, string> = {
            '采购': 'procurement',
            '裁剪': 'cutting',
            '车缝': 'sewing',
            '尾部': 'tail',
            '入库': 'warehousing',
          };
          const nodeId = stageIdMap[stageName] || stageName;
          return {
            id: nodeId,
            name: stageName,
            unitPrice: processUnitPrices[stageName] || 0,
          };
        });

        return (
          <div style={{
            display: 'flex',
            gap: 0,
            alignItems: 'center',
            justifyContent: 'space-evenly',
            padding: '12px 8px',
            width: '100%',
          }}>
            {nodesWithPrices.map((node) => {
              // 采购节点使用 procurementProgress 数据，其他节点使用 progressNodes
              let percent: number;
              let completedQty: number;

              if (node.name === '采购' && record.procurementProgress) {
                // 采购进度使用实际采购单完成数据
                percent = record.procurementProgress.percent || 0;
                completedQty = record.procurementProgress.completed || 0;
                const _remaining = record.procurementProgress.total - completedQty;
              } else {
                // 其他节点使用原有逻辑
                percent = progressNodes[node.id] || 0;
                completedQty = percent >= 100 ? record.quantity : Math.floor(record.quantity * percent / 100);
                const _remaining = record.quantity - completedQty;
              }

              return (
                <div
                  key={node.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    cursor: 'default',
                    padding: 4,

                    transition: 'background 0.2s',
                  }}
                >
                  <LiquidProgressLottie
                    progress={percent}
                    size={60}
                    color1={
                      percent >= 100
                        ? '#9ca3af'
                        : getDeliveryStatus(record.deliveryTime) === 'danger'
                          ? '#ef4444'
                          : getDeliveryStatus(record.deliveryTime) === 'warning'
                            ? '#f59e0b'
                            : 'var(--success-color)'
                    }
                    color2={
                      percent >= 100
                        ? '#d1d5db'
                        : getDeliveryStatus(record.deliveryTime) === 'danger'
                          ? '#fca5a5'
                          : getDeliveryStatus(record.deliveryTime) === 'warning'
                            ? '#fbbf24'
                            : '#95de64'
                    }
                    nodeName={node.name}
                  />
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      title: '领取人',
      dataIndex: 'receiver',
      key: 'receiver',
      width: 100,
    },
    {
      title: '领取时间',
      dataIndex: 'receiveTime',
      key: 'receiveTime',
      width: 140,
    },
    {
      title: '完成时间',
      dataIndex: 'completeTime',
      key: 'completeTime',
      width: 140,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => {
        // 计算完成进度（0-100）
        const progressNodes = record.progressNodes || {};
        const nodeValues = Object.values(progressNodes) as number[];
        const totalProgress = nodeValues.length > 0
          ? Math.round(nodeValues.reduce((sum: number, val: number) => sum + val, 0) / nodeValues.length)
          : 0;
        const isCompleted = totalProgress === 100 || record.status === 'COMPLETED';

        const menuItems: MenuProps['items'] = [
          record.status === 'PENDING' && {
            key: 'receive',
            label: '领取',
            onClick: () => handleReceive(record),
          },
          record.status === 'IN_PROGRESS' && !isCompleted && {
            key: 'progress',
            label: '进度',
            onClick: () => handleOpenProgress(record),
          },
          {
            key: 'divider1',
            type: 'divider',
          },
          {
            key: 'attachment',
            label: '附件',
            onClick: () => attachmentModal.open(record),
            disabled: isCompleted,
          },
          {
            key: 'maintenance',
            label: '维护',
            onClick: () => handleMaintenance(record),
            danger: !isCompleted,
            disabled: isCompleted,
          },
        ].filter(Boolean) as MenuProps['items'];

        return (
          <RowActions
            actions={[
              {
                key: 'print',
                label: '打印',
                onClick: () => handlePrint(record),
              },
              ...(menuItems.length > 0
                ? [
                  {
                    key: 'more',
                    label: '更多',
                    children: menuItems
                  }
                ]
                : [])
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <div className="pattern-production-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">样板生产</h2>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchText}
                  onSearchChange={setSearchText}
                  searchPlaceholder="搜索款号或颜色"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={statusValue}
                  onStatusChange={setStatusValue}
                  statusOptions={[
                    { label: '全部', value: '' },
                    { label: '待领取', value: 'PENDING' },
                    { label: '进行中', value: 'IN_PROGRESS' },
                    { label: '已完成', value: 'COMPLETED' },
                  ]}
                />
              )}
              right={(
                <>
                  <Button
                    icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                    onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                  >
                    {viewMode === 'list' ? '卡片视图' : '列表视图'}
                  </Button>
                </>
              )}
            />
          </Card>

          {/* 表格/卡片视图 */}
          {viewMode === 'list' ? (
            <ResizableTable
              columns={columns as any}
              dataSource={dataSource as any}
              loading={loading}
              rowKey="id"
              scroll={{ x: 'max-content' }}
              storageKey="pattern-production-table"
              reorderableColumns={true}
              resizableColumns={true}
              pagination={{
                total: dataSource.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
              }}
            />
          ) : (
            <UniversalCardView
              dataSource={dataSource}
              loading={loading}
              columns={6}
              coverField="coverImage"
              titleField="styleNo"
              subtitleField="color"
              fields={[]}
              fieldGroups={[
                [{ label: '码数', key: 'sizes', render: (val: string[]) => val && val.length > 0 ? val.join(',') : '-' }, { label: '数量', key: 'quantity', render: (val) => (val !== null && val !== undefined) ? `${val}件` : '-' }],
              ]}
              progressConfig={{
                calculate: calculateProgress,
                getStatus: (record) => getDeliveryStatus(record.deliveryTime),
                show: true,
                type: 'liquid', // 液体波浪进度条
              }}
              actions={(record) => {
                // 计算完成进度（0-100）
                const progressNodes = record.progressNodes || {};
                const nodeValues = Object.values(progressNodes) as number[];
                const totalProgress = nodeValues.length > 0
                  ? Math.round(nodeValues.reduce((sum: number, val: number) => sum + val, 0) / nodeValues.length)
                  : 0;
                const isCompleted = totalProgress === 100 || record.status === 'COMPLETED';

                return [
                  {
                    key: 'view',
                    label: '查看',
                    onClick: () => handleOpenDetail(record),
                  },
                  record.status === 'PENDING' && {
                    key: 'receive',
                    label: '领取',
                    onClick: () => handleReceive(record),
                  },
                  record.status === 'IN_PROGRESS' && !isCompleted && {
                    key: 'progress',
                    label: '进度',
                    onClick: () => handleOpenProgress(record),
                  },
                  {
                    key: 'divider1',
                    type: 'divider' as const,
                    label: '',
                  },
                  {
                    key: 'attachment',
                    label: '附件',
                    onClick: () => attachmentModal.open(record),
                    disabled: isCompleted,
                    style: isCompleted ? { color: 'var(--neutral-border)' } : undefined,
                  },
                  {
                    key: 'maintenance',
                    label: '维护',
                    onClick: () => handleMaintenance(record),
                    danger: !isCompleted,
                    disabled: isCompleted,
                    style: isCompleted ? { color: 'var(--neutral-border)' } : undefined,
                  },
                ] as const;
              }}
            />
          )}
        </Card>

        {/* 工序进度更新对话框 */}
        <StandardModal
          title="更新工序进度"
          open={progressModal.visible}
          onOk={handleUpdateProgress}
          onCancel={() => {
            progressModal.close();
            form.resetFields();
          }}
          okText="保存"
          cancelText="取消"
          size="sm"
        >
          {progressModal.data && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div><strong>款号:</strong> {progressModal.data.styleNo}</div>
                <div><strong>颜色:</strong> {progressModal.data.color}</div>
                <div><strong>状态:</strong> {renderStatus(progressModal.data.status)}</div>
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
                当所有工序进度达到 100% 时，系统将自动标记为已完成
              </div>
            </div>
          )}
          <Form form={form} layout="vertical">
            {DEFAULT_NODES.map((node) => (
              <Form.Item
                key={node.id}
                name={node.id}
                label={node.name}
                rules={[
                  { required: true, message: `请输入${node.name}进度` },
                  { type: 'number', min: 0, max: 100, message: '进度范围：0-100' },
                ]}
              >
                <InputNumber
                  min={0}
                  max={100}
                  style={{ width: '100%' }}
                  placeholder="请输入百分比（0-100）"
                  addonAfter="%"
                />
              </Form.Item>
            ))}
          </Form>
        </StandardModal>

        {/* 操作历史弹窗 */}
        <StandardModal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: 'var(--primary-color)' }} />
              <span>操作历史记录</span>
            </div>
          }
          open={operationLogVisible}
          onCancel={() => setOperationLogVisible(false)}
          footer={[
            <Button key="close" onClick={() => setOperationLogVisible(false)}>
              关闭
            </Button>
          ]}
          size="md"
        >
          {operationLogs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 0',
              color: 'var(--neutral-text-disabled)',
            }}>
              <ClockCircleOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <div>暂无操作记录</div>
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {operationLogs.map((log, index) => (
                <div
                  key={log.id}
                  style={{
                    padding: '12px 16px',
                    marginBottom: 8,
                    background: index % 2 === 0 ? '#fafafa' : '#fff',

                    border: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <Tag color="blue">{log.action}</Tag>
                      <span style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)' }}>
                        <UserOutlined style={{ marginRight: 4 }} />
                        {log.operator}
                      </span>
                    </div>
                    <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
                      {log.time}
                    </span>
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text)', paddingLeft: 8 }}>
                    {log.detail}
                  </div>
                </div>
              ))}
            </div>
          )}
        </StandardModal>

        {/* 附件管理弹窗 */}
        {attachmentModal.data && (
          <div ref={attachmentWrapperRef} style={{ position: 'absolute', left: -9999, top: -9999 }}>
            <StyleAttachmentsButton
              styleNo={attachmentModal.data.styleNo}
              buttonText="附件管理"
              modalTitle={`${attachmentModal.data.styleNo} - 纸样附件`}
              onlyActive
              onModalClose={() => attachmentModal.close()}
            />
          </div>
        )}

        {/* 打印弹窗 */}
        <StylePrintModal
          visible={printModal.visible}
          onClose={printModal.close}
          styleId={printModal.data?.styleId}
          orderId={printModal.data?.id}
          orderNo={printModal.data?.orderNo}
          styleNo={printModal.data?.styleNo}
          color={printModal.data?.color}
          quantity={printModal.data?.quantity}
          mode="production"
          extraInfo={{
            '设计师': printModal.data?.designer,
            '纸样师': printModal.data?.patternDeveloper,
            '车板工': printModal.data?.plateWorker,
            '跟单员': printModal.data?.merchandiser,
            '交货日期': printModal.data?.deliveryTime,
            '尺码': printModal.data?.sizes,
            isPattern: true, // 标记为样板打印
          }}
        />
      </div>
    </Layout>
  );
};

export default PatternProduction;
