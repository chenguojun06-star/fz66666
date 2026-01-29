import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Input, message, Row, Col, Modal, Form, InputNumber, Tag, DatePicker, Dropdown, Checkbox } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, AppstoreOutlined, UnorderedListOutlined, EyeOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, MoreOutlined, UserOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import UniversalCardView from '@/components/common/UniversalCardView';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import api from '@/utils/api';
import { useModal } from '@/hooks';
import './style.css';

interface ProgressNode {
  id: string;
  name: string;
  unitPrice?: number;
}

interface PatternProductionRecord {
  id: string;
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
  processUnitPrices?: { [processName: string]: number }; // 工序单价（从后端获取）
  coverImage?: string; // 封面图片
  patternMaker?: string; // 纸样师傅
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
const getDeliveryStatus = (deliveryTime: string): 'success' | 'warning' | 'danger' => {
  const now = new Date();
  const delivery = new Date(deliveryTime);
  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'danger'; // 已逾期
  if (diffDays <= 3) return 'warning'; // 3天内临近
  return 'success'; // 充足时间
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
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [operationLogVisible, setOperationLogVisible] = useState(false);

  // ===== 使用 useModal 管理弹窗状态 =====
  const progressModal = useModal<PatternProductionRecord>();
  const receiveModal = useModal<PatternProductionRecord>();
  const detailModal = useModal<PatternProductionRecord>();
  const attachmentModal = useModal<PatternProductionRecord>();
  const attachmentWrapperRef = React.useRef<HTMLDivElement>(null);
  const [customNodes, setCustomNodes] = useState<ProgressNode[]>([...DEFAULT_NODES]);
  const [newNodeName, setNewNodeName] = useState('');
  const [operationLogs, setOperationLogs] = useState<Array<{
    id: string;
    action: string;
    operator: string;
    time: string;
    detail: string;
  }>>([]);
  const [form] = Form.useForm();
  const [receiveForm] = Form.useForm();

  // 节点详情弹窗状态
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailRecord, setNodeDetailRecord] = useState<PatternProductionRecord | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState<string>('');
  const [nodeDetailName, setNodeDetailName] = useState<string>('');
  const [nodeDetailStats, setNodeDetailStats] = useState<{ done: number; total: number; percent: number; remaining: number } | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<{ name: string; unitPrice?: number }[]>([]);

  // 打开节点详情弹窗
  const openNodeDetail = useCallback((
    record: PatternProductionRecord,
    nodeType: string,
    nodeName: string,
    stats: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { name: string; unitPrice?: number }[]
  ) => {
    setNodeDetailRecord(record);
    setNodeDetailType(nodeType);
    setNodeDetailName(nodeName);
    setNodeDetailStats(stats);
    setNodeDetailUnitPrice(unitPrice);
    setNodeDetailProcessList(processList || []);
    setNodeDetailVisible(true);
  }, []);

  // 当 attachmentModal 打开时，程序化触发附件按钮点击
  useEffect(() => {
    if (attachmentModal.visible && attachmentWrapperRef.current) {
      const button = attachmentWrapperRef.current.querySelector('button');
      if (button) {
        button.click();
        attachmentModal.close(); // 立即关闭moda state，避免重复触发
      }
    }
  }, [attachmentModal.visible]);

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
  }, [searchText]); // 搜索文本变化时重新加载

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/production/pattern/list', {
        params: {
          page: 1,
          pageSize: 100,
          keyword: searchText || undefined,
        }
      });

      const records = response.data?.records || [];

      // 转换后端数据格式为前端格式
      const formattedData: PatternProductionRecord[] = records.map((item: any) => ({
        id: item.id,
        styleNo: item.styleNo,
        color: item.color || '-',
        sizes: [], // 后端暂未提供
        quantity: item.quantity || 0,
        releaseTime: item.releaseTime ? String(item.releaseTime).replace('T', ' ') : '-',
        deliveryTime: item.deliveryTime ? String(item.deliveryTime).replace('T', ' ') : '-',
        receiver: item.receiver || '-',
        receiveTime: item.receiveTime ? String(item.receiveTime).replace('T', ' ') : '-',
        completeTime: item.completeTime ? String(item.completeTime).replace('T', ' ') : '-',
        coverImage: item.coverImage,
        patternMaker: item.patternMaker || '-',
        status: item.status || 'PENDING',
        progressNodes: item.progressNodes ? JSON.parse(item.progressNodes) : {
          cutting: 0,
          sewing: 0,
          ironing: 0,
          quality: 0,
          secondary: 0,
          packaging: 0,
        },
        // 工序单价从后端获取
        processUnitPrices: item.processUnitPrices || {},
      }));

      setDataSource(formattedData);
    } catch (error) {
      console.error('加载样板生产数据失败:', error);
      message.error('加载数据失败');
      setDataSource([]); // 出错时显示空列表
    } finally {
      setLoading(false);
    }
  };

  // 打开领取对话框
  const handleOpenReceive = (record: PatternProductionRecord) => {
    receiveForm.setFieldsValue({
      patternMaker: '',
      releaseTime: null,
      deliveryTime: null,
    });
    receiveModal.open(record);
  };

  // 提交领取
  const handleReceiveSubmit = async () => {
    try {
      const values = await receiveForm.validateFields();
      await api.post(`/production/pattern/${receiveModal.data!.id}/receive`, {
        patternMaker: values.patternMaker,
        releaseTime: values.releaseTime?.format('YYYY-MM-DD HH:mm:ss'),
        deliveryTime: values.deliveryTime?.format('YYYY-MM-DD HH:mm:ss'),
      });
      message.success('领取成功');
      receiveModal.close();
      receiveForm.resetFields();
      loadData();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查输入数据');
      } else {
        message.error(error.message || '领取失败');
      }
    }
  };

  // 打开进度更新对话框
  const handleOpenProgress = (record: PatternProductionRecord) => {
    form.setFieldsValue(record.progressNodes);
    progressModal.open(record);
  };

  // 打开查看详情
  const handleOpenDetail = (record: PatternProductionRecord) => {
    detailModal.open(record);
  };

  // 删除样板生产记录
  const handleDelete = async (record: PatternProductionRecord) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除样板生产记录：${record.styleNo} - ${record.color}？`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/production/pattern/${record.id}`);
          message.success('删除成功');
          addOperationLog('删除记录', `删除样板生产记录：${record.styleNo}`);
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
    const statusMap = {
      PENDING: { text: '待领取', color: 'default', icon: <ClockCircleOutlined /> },
      IN_PROGRESS: { text: '进行中', color: 'processing', icon: <SyncOutlined spin /> },
      COMPLETED: { text: '已完成', color: 'success', icon: <CheckCircleOutlined /> },
    };
    const config = statusMap[status as keyof typeof statusMap] || statusMap.PENDING;
    return <Tag icon={config.icon} color={config.color}>{config.text}</Tag>;
  };

  // 构建表格列
  const columns: ColumnsType<PatternProductionRecord> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      fixed: 'left',
      render: renderStatus,
    },
    {
      title: '图片',
      dataIndex: 'coverImage',
      key: 'coverImage',
      width: 80,
      fixed: 'left',
      render: (coverImage: string) => (
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 4,
          overflow: 'hidden',
          background: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {coverImage ? (
            <img src={coverImage} alt="样板图" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#ccc', fontSize: 12 }}>无图</span>
          )}
        </div>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
      fixed: 'left',
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
      title: '下板时间',
      dataIndex: 'releaseTime',
      key: 'releaseTime',
      width: 140,
    },
    {
      title: '交板时间',
      dataIndex: 'deliveryTime',
      key: 'deliveryTime',
      width: 140,
    },
    {
      title: '生产进度',
      dataIndex: 'progressNodes',
      key: 'progressNodes',
      width: 900,
      align: 'center' as const,
      render: (progressNodes: { [key: string]: number }, record) => {
        // 从后端获取的工序单价
        const processUnitPrices = record.processUnitPrices || {};

        // 构建带单价的节点列表
        const nodesWithPrices = DEFAULT_NODES.map(node => ({
          ...node,
          unitPrice: processUnitPrices[node.name] || 0,
        }));

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
            const percent = progressNodes[node.id] || 0;
            const completedQty = percent >= 100 ? record.quantity : Math.floor(record.quantity * percent / 100);
            const remaining = record.quantity - completedQty;

            return (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  flex: 1,
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
                onClick={() => openNodeDetail(
                  record,
                  node.id,
                  node.name,
                  { done: completedQty, total: record.quantity, percent, remaining },
                  node.unitPrice,
                  nodesWithPrices.map(n => ({ name: n.name, unitPrice: n.unitPrice }))
                )}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title={`点击查看 ${node.name} 详情`}
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
                      : '#52c41a'
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
                />
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#1f2937',
                  letterSpacing: '0.3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span>{node.name}</span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: percent >= 100 ? '#059669' : '#6b7280',
                  }}>({completedQty}/{record.quantity})</span>
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                }}>
                  {node.unitPrice > 0 && (
                    <span style={{ color: '#f59e0b' }}>¥{node.unitPrice}</span>
                  )}
                </div>
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
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const menuItems: MenuProps['items'] = [
          record.status === 'PENDING' && {
            key: 'receive',
            icon: <UserOutlined />,
            label: '领取样板',
            onClick: () => handleOpenReceive(record),
          },
          record.status === 'IN_PROGRESS' && {
            key: 'progress',
            icon: <SyncOutlined />,
            label: '更新进度',
            onClick: () => handleOpenProgress(record),
          },
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: '查看详情',
            onClick: () => handleOpenDetail(record),
          },
          {
            key: 'divider1',
            type: 'divider',
          },
          {
            key: 'attachment',
            label: '附件管理',
            onClick: () => attachmentModal.open(record),
          },
          {
            key: 'divider2',
            type: 'divider',
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除记录',
            danger: true,
            onClick: () => handleDelete(record),
          },
        ].filter(Boolean) as MenuProps['items'];

        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button icon={<MoreOutlined />}>更多</Button>
          </Dropdown>
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
            <Space wrap>
              <Button
                icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
              >
                {viewMode === 'list' ? '卡片视图' : '列表视图'}
              </Button>
              <Button type="primary" icon={<PlusOutlined />}>
                新增样板
              </Button>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Input
              placeholder="搜索款号或颜色"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
            />
          </Card>

          {/* 表格/卡片视图 */}
          {viewMode === 'list' ? (
            <Table
              columns={columns}
              dataSource={dataSource}
              loading={loading}
              rowKey="id"
              scroll={{ x: 'max-content' }}
              pagination={{
                total: dataSource.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 条`,
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
              fields={[
                { label: '码数', key: 'sizes', render: (val, record) => {
                  const sizeCount = record.sizeCount || 0;
                  return sizeCount > 0 ? `${sizeCount}个码` : '-';
                }},
                { label: '数量', key: 'quantity', suffix: ' 件' },
                { label: '下板', key: 'releaseTime' },
                { label: '交板', key: 'deliveryTime' },
              ]}
              progressConfig={{
                calculate: calculateProgress,
                getStatus: (record) => getDeliveryStatus(record.deliveryTime),
                show: true,
              }}
              actions={(record) => ([
                record.status === 'PENDING' && {
                  key: 'receive',
                  icon: <UserOutlined />,
                  label: '领取样板',
                  onClick: () => handleOpenReceive(record),
                },
                record.status === 'IN_PROGRESS' && {
                  key: 'progress',
                  icon: <SyncOutlined />,
                  label: '更新进度',
                  onClick: () => handleOpenProgress(record),
                },
                {
                  key: 'view',
                  icon: <EyeOutlined />,
                  label: '查看详情',
                  onClick: () => handleOpenDetail(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                  label: '',
                },
                {
                  key: 'attachment',
                  label: '附件管理',
                  onClick: () => attachmentModal.open(record),
                },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  onClick: () => handleDelete(record),
                  danger: true,
                },
              ] as const).filter(Boolean) as any}
            />
          )}
        </Card>

        {/* 领取样板对话框 */}
        <Modal
          title="领取样板"
          open={receiveModal.visible}
          onOk={handleReceiveSubmit}
          onCancel={() => {
            receiveModal.close();
            receiveForm.resetFields();
          }}
          width={1000}
          okText="确认领取"
          cancelText="取消"
        >
          {receiveModal.data && (
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div><strong>款号:</strong> {receiveModal.data.styleNo}</div>
                  <div><strong>颜色:</strong> {receiveModal.data.color}</div>
                  <div><strong>状态:</strong> {renderStatus(receiveModal.data.status)}</div>
                </div>
                <Button
                  type="link"
                  icon={<ClockCircleOutlined />}
                  onClick={() => setOperationLogVisible(true)}
                >
                  操作历史
                </Button>
              </div>
            </div>
          )}
          <Form form={receiveForm} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="releaseTime"
                  label="下板时间"
                  rules={[
                    { required: true, message: '请选择时间' },
                  ]}
                >
                  <DatePicker
                    showTime
                    format="YYYY-MM-DD HH:mm:ss"
                    style={{ width: '100%' }}
                    placeholder="选择时间"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="deliveryTime"
                  label="预计交板时间"
                  rules={[
                    { required: true, message: '请选择时间' },
                  ]}
                >
                  <DatePicker
                    showTime
                    format="YYYY-MM-DD HH:mm:ss"
                    style={{ width: '100%' }}
                    placeholder="选择时间"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="productionNodes"
              label={(
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>生产节点配置</span>
                  <Space size="small">
                    <Input
                      placeholder="新工序名称"
                      value={newNodeName}
                      onChange={(e) => setNewNodeName(e.target.value)}
                      style={{ width: 120 }}
                      size="small"
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      size="small"
                      onClick={() => {
                        if (!newNodeName.trim()) {
                          message.warning('请输入工序名称');
                          return;
                        }
                        if (customNodes.some(n => n.name === newNodeName.trim())) {
                          message.warning('工序已存在');
                          return;
                        }
                        const newNode: ProgressNode = {
                          id: `custom_${Date.now()}`,
                          name: newNodeName.trim(),
                        };
                        setCustomNodes([...customNodes, newNode]);
                        addOperationLog('添加工序', `添加自定义工序：${newNodeName.trim()}`);
                        setNewNodeName('');
                        message.success('工序添加成功');
                      }}
                    >
                      添加工序
                    </Button>
                  </Space>
                </div>
              )}
              rules={[
                { required: true, message: '请至少选择一个生产节点' },
              ]}
              initialValue={customNodes.map(n => n.id)}
            >
              <Checkbox.Group style={{ width: '100%' }}>
                <Row gutter={[8, 8]}>
                  {customNodes.map((node) => (
                    <Col span={8} key={node.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Checkbox value={node.id}>
                          {node.name}
                        </Checkbox>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            const nodeName = node.name;
                            setCustomNodes(customNodes.filter(n => n.id !== node.id));
                            addOperationLog('删除工序', `删除工序：${nodeName}`);
                            message.success('工序已删除');
                          }}
                          style={{ padding: '0 4px', minWidth: 'auto' }}
                        />
                      </div>
                    </Col>
                  ))}
                </Row>
              </Checkbox.Group>
            </Form.Item>

            {/* 工序指派配置 */}
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.productionNodes !== curr.productionNodes}>
              {({ getFieldValue }) => {
                const selectedNodes = getFieldValue('productionNodes') || [];
                const nodesToShow = customNodes.filter(node => selectedNodes.includes(node.id));

                if (nodesToShow.length === 0) {
                  return null;
                }

                return (
                  <div style={{
                    marginTop: 16,
                    padding: 16,
                    background: '#fafafa',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                  }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#1f2937',
                      marginBottom: 12,
                    }}>👥 工序指派配置（多人协作）</div>
                    <Row gutter={[12, 12]}>
                      {nodesToShow.map((node) => (
                        <Col span={6} key={node.id}>
                          <Form.Item
                            name={['nodeAssignments', node.id]}
                            label={node.name}
                            style={{ marginBottom: 0 }}
                          >
                            <Input
                              placeholder={`输入${node.name}负责人`}
                              prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
                            />
                          </Form.Item>
                        </Col>
                      ))}
                    </Row>
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: '#6b7280',
                    }}>
                      💡 提示：每个工序可以指派不同的人员负责，如：张三负责印花，李四负责车缝
                    </div>
                  </div>
                );
              }}
            </Form.Item>

            <div style={{
              padding: 12,
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
              borderRadius: 4,
              fontSize: 13,
              color: '#0958d9'
            }}>
              <div>💡 <strong>提示：</strong></div>
              <div style={{ marginTop: 4 }}>• 领取后将自动切换为“进行中”状态</div>
              <div>• 可以自定义生产节点（裁剪、车缝、大烫等）</div>
              <div>• 领取后可在“更新进度”中实时更新各工序进度</div>
            </div>
          </Form>
        </Modal>

        {/* 工序进度更新对话框 */}
        <Modal
          title="更新工序进度"
          open={progressModal.visible}
          onOk={handleUpdateProgress}
          onCancel={() => {
            progressModal.close();
            form.resetFields();
          }}
          width={600}
          okText="保存"
          cancelText="取消"
        >
          {progressModal.data && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div><strong>款号:</strong> {progressModal.data.styleNo}</div>
                <div><strong>颜色:</strong> {progressModal.data.color}</div>
                <div><strong>状态:</strong> {renderStatus(progressModal.data.status)}</div>
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>
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
        </Modal>

        {/* 操作历史弹窗 */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: '#1890ff' }} />
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
          width={800}
        >
          {operationLogs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 0',
              color: '#999',
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
                    borderRadius: 4,
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <Tag color="blue">{log.action}</Tag>
                      <span style={{ fontSize: 13, color: '#666' }}>
                        <UserOutlined style={{ marginRight: 4 }} />
                        {log.operator}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {log.time}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#333', paddingLeft: 8 }}>
                    {log.detail}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>

        {/* 查看详情弹窗 */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EyeOutlined style={{ color: '#1890ff' }} />
              <span>样板详情</span>
            </div>
          }
          open={detailModal.visible}
          onCancel={detailModal.close}
          footer={[
            <Button key="close" onClick={detailModal.close}>
              关闭
            </Button>
          ]}
          width={900}
        >
          {detailModal.data && (
            <div>
              {/* 基本信息 */}
              <div style={{
                padding: 16,
                background: '#fafafa',
                borderRadius: 6,
                marginBottom: 16,
              }}>
                <Row gutter={[24, 16]}>
                  <Col span={8}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>款号</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{detailModal.data.styleNo}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>颜色</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{detailModal.data.color}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>状态</div>
                      <div>{renderStatus(detailModal.data.status)}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>数量</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{detailModal.data.quantity}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>纸样师傅</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{detailModal.data.patternMaker}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>领取人</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>{detailModal.data.receiver}</div>
                    </div>
                  </Col>
                </Row>
              </div>

              {/* 时间信息 */}
              <div style={{
                padding: 16,
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
                marginBottom: 16,
              }}>
                <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>⏰ 时间节点</h4>
                <Row gutter={[24, 16]}>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>下板时间</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{detailModal.data.releaseTime}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>交板时间</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{detailModal.data.deliveryTime}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>领取时间</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{detailModal.data.receiveTime}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>完成时间</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{detailModal.data.completeTime}</div>
                  </Col>
                </Row>
              </div>

              {/* 工序进度 */}
              <div style={{
                padding: 16,
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
              }}>
                <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>📊 工序进度</h4>
                <Row gutter={[16, 16]}>
                  {DEFAULT_NODES.map((node) => {
                    const percent = detailModal.data.progressNodes[node.id] || 0;
                    return (
                      <Col span={8} key={node.id}>
                        <div style={{
                          textAlign: 'center',
                          padding: 12,
                          background: percent >= 100 ? '#f0fdf4' : '#fafafa',
                          borderRadius: 6,
                          border: `1px solid ${percent >= 100 ? '#86efac' : '#e5e7eb'}`,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{node.name}</div>
                          <LiquidProgressLottie
                            progress={percent}
                            size={60}
                            color1="#52c41a"
                            color2="#95de64"
                          />
                          <div style={{
                            fontSize: 16,
                            fontWeight: 700,
                            marginTop: 8,
                            color: percent >= 100 ? '#059669' : '#6b7280',
                          }}>
                            {percent}%
                          </div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            </div>
          )}
        </Modal>

        {/* 节点详情弹窗 - 水晶球生产节点看板 */}
        <NodeDetailModal
          visible={nodeDetailVisible}
          onClose={() => {
            setNodeDetailVisible(false);
            setNodeDetailRecord(null);
          }}
          orderId={nodeDetailRecord?.id}
          orderNo={nodeDetailRecord?.styleNo}
          nodeType={nodeDetailType}
          nodeName={nodeDetailName}
          stats={nodeDetailStats}
          unitPrice={nodeDetailUnitPrice}
          processList={nodeDetailProcessList}
          onSaved={() => {
            // 刷新数据
            void loadData();
          }}
        />

        {/* 附件管理弹窗 */}
        {attachmentModal.data && (
          <div ref={attachmentWrapperRef} style={{ position: 'absolute', left: -9999, top: -9999 }}>
            <StyleAttachmentsButton
              styleNo={attachmentModal.data.styleNo}
              buttonText="附件管理"
              modalTitle={`${attachmentModal.data.styleNo} - 附件`}
              onlyGradingPattern={true}
            />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PatternProduction;
