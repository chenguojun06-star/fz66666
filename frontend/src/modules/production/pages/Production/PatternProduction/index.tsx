import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Space, Input, message, Row, Col, Modal, Form, InputNumber, Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, AppstoreOutlined, UnorderedListOutlined, EyeOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, UserOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import UniversalCardView from '@/components/common/UniversalCardView';
import QRCodeBox from '@/components/common/QRCodeBox';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import api from '@/utils/api';
import { useModal } from '@/hooks';
import { formatDateTime } from '@/utils/datetime';
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
  processUnitPrices?: { [processName: string]: number }; // 工序单价汇总（从后端获取）
  processDetails?: { [stageName: string]: Array<{ name: string; unitPrice: number }> }; // 每个节点下的工序明细
  procurementProgress?: { // 采购进度信息
    total: number; // 总采购单数
    completed: number; // 已完成采购单数
    percent: number; // 完成百分比
    completedTime?: string; // 最新完成时间
    receiver?: string; // 最新领取人
  };
  coverImage?: string; // 封面图片
  patternMaker?: string; // 纸样师傅
  // 人员信息（从款式基础信息同步）
  designer?: string; // 设计师
  patternDeveloper?: string; // 纸样师
  plateWorker?: string; // 车板师
  merchandiser?: string; // 跟单员
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
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [operationLogVisible, setOperationLogVisible] = useState(false);

  // ===== 使用 useModal 管理弹窗状态 =====
  const progressModal = useModal<PatternProductionRecord>();
  const detailModal = useModal<PatternProductionRecord>();
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

  // 节点详情弹窗状态
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailRecord, setNodeDetailRecord] = useState<PatternProductionRecord | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState<string>('');
  const [nodeDetailName, setNodeDetailName] = useState<string>('');
  const [nodeDetailStats, setNodeDetailStats] = useState<{ done: number; total: number; percent: number; remaining: number } | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<{ name: string; unitPrice?: number }[]>([]);
  const [nodeDetailExtraData, setNodeDetailExtraData] = useState<any>(undefined);

  // 打开节点详情弹窗
  const openNodeDetail = useCallback((
    record: PatternProductionRecord,
    nodeType: string,
    nodeName: string,
    stats: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { name: string; unitPrice?: number }[],
    extraData?: any
  ) => {
    setNodeDetailRecord(record);
    setNodeDetailType(nodeType);
    setNodeDetailName(nodeName);
    setNodeDetailStats(stats);
    setNodeDetailUnitPrice(unitPrice);
    setNodeDetailProcessList(processList || []);
    setNodeDetailExtraData(extraData);
    setNodeDetailVisible(true);
  }, []);

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
        status: item.status || 'PENDING',
        progressNodes: item.progressNodes ? JSON.parse(item.progressNodes) : {
          cutting: 0,
          sewing: 0,
          ironing: 0,
          quality: 0,
          secondary: 0,
          packaging: 0,
        },
        // 工序单价汇总从后端获取（从样板开发的工艺配置汇总）
        processUnitPrices: item.processUnitPrices || {},
        // 每个节点下的工序明细（含工序名和单价）
        processDetails: item.processDetails || {},
        // 采购进度信息
        procurementProgress: item.procurementProgress || {
          total: 0,
          completed: 0,
          percent: 0,
        },
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

  // 直接领取（不弹窗）
  const handleReceive = async (record: PatternProductionRecord) => {
    try {
      await api.post(`/production/pattern/${record.id}/receive`, {});
      message.success('领取成功');
      addOperationLog('领取', `领取：${record.styleNo}`);
      loadData();
    } catch (error: any) {
      message.error(error.message || '领取失败');
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

  // 打印样板生产单（含二维码）
  const handlePrint = (record: PatternProductionRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      message.error('无法打开打印窗口，请检查浏览器设置');
      return;
    }

    // 生成二维码数据
    const qrData = JSON.stringify({
      type: 'pattern',
      id: record.id,
      styleNo: record.styleNo,
      color: record.color,
    });

    // 获取当前用户信息
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const printerName = userInfo.realName || userInfo.username || '未知';
    const printTime = new Date().toLocaleString('zh-CN');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>样板生产单 - ${record.styleNo}</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: "Microsoft YaHei", sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .header h1 { font-size: 24px; margin-bottom: 5px; }
          .header .sub { font-size: 12px; color: #666; }
          .content { display: flex; gap: 20px; }
          .info { flex: 1; }
          .qr-section { text-align: center; }
          .info-row { display: flex; margin-bottom: 8px; }
          .info-label { width: 80px; font-weight: bold; color: #333; }
          .info-value { flex: 1; }
          .sizes { margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .sizes-title { font-weight: bold; margin-bottom: 8px; }
          .sizes-list { display: flex; flex-wrap: wrap; gap: 8px; }
          .size-tag { background: #1890ff; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>样板生产单</h1>
          <div class="sub">扫码进行车板/跟单操作</div>
        </div>
        <div class="content">
          <div class="info">
            <div class="info-row"><span class="info-label">款号：</span><span class="info-value" style="font-size: 18px; font-weight: bold;">${record.styleNo}</span></div>
            <div class="info-row"><span class="info-label">颜色：</span><span class="info-value">${record.color || '-'}</span></div>
            <div class="info-row"><span class="info-label">数量：</span><span class="info-value">${record.quantity} 件</span></div>
            <div class="info-row"><span class="info-label">设计师：</span><span class="info-value">${record.designer || '-'}</span></div>
            <div class="info-row"><span class="info-label">纸样师：</span><span class="info-value">${record.patternDeveloper || '-'}</span></div>
            <div class="info-row"><span class="info-label">车板师：</span><span class="info-value">${record.plateWorker || '-'}</span></div>
            <div class="info-row"><span class="info-label">跟单员：</span><span class="info-value">${record.merchandiser || '-'}</span></div>
            <div class="info-row"><span class="info-label">交板日期：</span><span class="info-value">${record.deliveryTime || '-'}</span></div>
            ${record.sizes && record.sizes.length > 0 ? `
            <div class="sizes">
              <div class="sizes-title">码数：</div>
              <div class="sizes-list">
                ${record.sizes.map(s => `<span class="size-tag">${s}</span>`).join('')}
              </div>
            </div>
            ` : ''}
          </div>
          <div class="qr-section">
            <canvas id="qrcode"></canvas>
            <div style="margin-top: 5px; font-size: 11px; color: #666;">扫码操作</div>
          </div>
        </div>
        <div class="footer">
          <span>打印人：${printerName}</span>
          <span>打印时间：${printTime}</span>
        </div>
        <div class="no-print" style="margin-top: 20px; text-align: center;">
          <button onclick="window.print()" style="padding: 8px 24px; font-size: 14px; cursor: pointer;">打印</button>
        </div>
        <script>
          QRCode.toCanvas(document.getElementById('qrcode'), '${qrData}', { width: 120 }, function(err) {
            if (err) console.error(err);
          });
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
          await api.post(`/production/pattern/${record.id}/maintenance`, { reason });
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
          <div style={{ marginBottom: 12, color: '#ff4d4f', fontWeight: 600 }}>
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
            let remaining: number;

            if (node.name === '采购' && record.procurementProgress) {
              // 采购进度使用实际采购单完成数据
              percent = record.procurementProgress.percent || 0;
              completedQty = record.procurementProgress.completed || 0;
              remaining = record.procurementProgress.total - completedQty;
            } else {
              // 其他节点使用原有逻辑
              percent = progressNodes[node.id] || 0;
              completedQty = percent >= 100 ? record.quantity : Math.floor(record.quantity * percent / 100);
              remaining = record.quantity - completedQty;
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
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
                onClick={() => {
                  // 获取该节点下的工序明细列表
                  const processDetails = record.processDetails || {};
                  const nodeProcessList = processDetails[node.name] || [];

                  // 传递额外数据：时间信息 + 采购进度（如果是采购节点）
                  const extraData: any = {
                    // 时间节点信息
                    releaseTime: record.releaseTime,
                    deliveryTime: record.deliveryTime,
                    receiveTime: record.receiveTime,
                    completeTime: record.completeTime,
                    // 人员信息
                    patternMaker: record.patternMaker,
                    receiver: record.receiver,
                  };

                  // 如果是采购节点，添加采购进度信息
                  if (node.name === '采购' && record.procurementProgress) {
                    extraData.procurementProgress = record.procurementProgress;
                  }

                  openNodeDetail(
                    record,
                    node.id,
                    node.name,
                    { done: completedQty, total: record.quantity, percent, remaining },
                    node.unitPrice,
                    nodeProcessList, // 传递该节点下的工序明细
                    extraData
                  );
                }}
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
            icon: <UserOutlined />,
            label: '领取',
            onClick: () => handleReceive(record),
          },
          record.status === 'IN_PROGRESS' && !isCompleted && {
            key: 'progress',
            icon: <SyncOutlined />,
            label: '进度',
            onClick: () => handleOpenProgress(record),
          },
          {
            key: 'print',
            icon: <PrinterOutlined />,
            label: '打印',
            onClick: () => handlePrint(record),
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
          <Space size={4}>
            <Button
              size="small"
              onClick={() => handleOpenDetail(record)}
              style={{ fontSize: '12px', padding: '0 8px', height: '24px' }}
            >
              查看
            </Button>
            {menuItems.length > 0 && (
              <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                <Button size="small" style={{ fontSize: '12px', padding: '0 8px', height: '24px' }}>
                  更多
                </Button>
              </Dropdown>
            )}
          </Space>
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
                { label: '码数', key: 'sizes', render: (val: string[]) => val && val.length > 0 ? val.join(', ') : '-' },
                { label: '数量', key: 'quantity', render: (val) => (val !== null && val !== undefined) ? `${val} 件` : '-' },
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
                    icon: <EyeOutlined />,
                    label: '查看',
                    onClick: () => handleOpenDetail(record),
                  },
                  record.status === 'PENDING' && {
                    key: 'receive',
                    icon: <UserOutlined />,
                    label: '领取',
                    onClick: () => handleReceive(record),
                  },
                  record.status === 'IN_PROGRESS' && !isCompleted && {
                    key: 'progress',
                    icon: <SyncOutlined />,
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
                    style: isCompleted ? { color: '#d9d9d9' } : undefined,
                  },
                  {
                    key: 'maintenance',
                    label: '维护',
                    onClick: () => handleMaintenance(record),
                    danger: !isCompleted,
                    disabled: isCompleted,
                    style: isCompleted ? { color: '#d9d9d9' } : undefined,
                  },
                ] as const;
              }}
            />
          )}
        </Card>

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
          width="40vw"
        >
          {detailModal.data && (
            <div style={{ fontSize: 12 }}>
              {/* 顶部：图片 + 二维码 + 基本信息 */}
              <div style={{
                display: 'flex',
                gap: 12,
                padding: 12,
                background: '#f8f9fa',
                borderRadius: 6,
                marginBottom: 12,
              }}>
                {/* 封面图 */}
                {detailModal.data.coverImage && (
                  <img
                    src={detailModal.data.coverImage}
                    alt={detailModal.data.styleNo}
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: '1px solid #e5e7eb',
                    }}
                  />
                )}

                {/* 二维码 */}
                <QRCodeBox
                  value={{
                    type: 'pattern',
                    id: detailModal.data.id,
                    styleNo: detailModal.data.styleNo,
                    color: detailModal.data.color,
                  }}
                  label="📱 扫码查看全流程"
                  variant="primary"
                  size={80}
                />

                {/* 基本信息 - 紧凑排列 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#1f2937' }}>
                    {detailModal.data.styleNo}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: '#6b7280' }}>
                    <span><b>颜色:</b> {detailModal.data.color || '-'}</span>
                    <span><b>数量:</b> {detailModal.data.quantity}</span>
                    <span><b>状态:</b> {renderStatus(detailModal.data.status)}</span>
                  </div>
                  {/* 人员信息 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: '#6b7280', marginTop: 4 }}>
                    <span><b>设计师:</b> {detailModal.data.designer || '-'}</span>
                    <span><b>纸样师:</b> {detailModal.data.patternDeveloper || '-'}</span>
                    <span><b>车板师:</b> {detailModal.data.plateWorker || '-'}</span>
                    <span><b>跟单员:</b> {detailModal.data.merchandiser || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 时间节点 - 紧凑横向排列 */}
              <div style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
                padding: '8px 12px',
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
              }}>
                <span style={{ fontWeight: 600, color: '#1f2937' }}>⏰</span>
                <span><b>下板:</b> {detailModal.data.releaseTime}</span>
                <span style={{ color: '#d9d9d9' }}>|</span>
                <span><b>交板:</b> {detailModal.data.deliveryTime}</span>
                <span style={{ color: '#d9d9d9' }}>|</span>
                <span><b>领取:</b> {detailModal.data.receiveTime}</span>
                <span style={{ color: '#d9d9d9' }}>|</span>
                <span><b>完成:</b> {detailModal.data.completeTime}</span>
              </div>

              {/* 工序进度 - 紧凑展示 */}
              <div style={{
                padding: 10,
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
              }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#1f2937' }}>📊 工序进度</div>
                <Row gutter={[8, 8]}>
                  {DEFAULT_NODES.map((node) => {
                    const percent = detailModal.data.progressNodes[node.id] || 0;
                    return (
                      <Col span={8} key={node.id}>
                        <div style={{
                          textAlign: 'center',
                          padding: 8,
                          background: percent >= 100 ? '#f0fdf4' : '#fafafa',
                          borderRadius: 4,
                          border: `1px solid ${percent >= 100 ? '#86efac' : '#e5e7eb'}`,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{node.name}</div>
                          <LiquidProgressLottie
                            progress={percent}
                            size={45}
                            color1="#52c41a"
                            color2="#95de64"
                          />
                          <div style={{
                            fontSize: 13,
                            fontWeight: 700,
                            marginTop: 4,
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
            setNodeDetailExtraData(undefined);
          }}
          orderId={nodeDetailRecord?.id}
          orderNo={nodeDetailRecord?.styleNo}
          nodeType={nodeDetailType}
          nodeName={nodeDetailName}
          stats={nodeDetailStats}
          unitPrice={nodeDetailUnitPrice}
          processList={nodeDetailProcessList}
          isPatternProduction={true}
          extraData={nodeDetailExtraData}
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
              modalTitle={`${attachmentModal.data.styleNo} - 纸样附件`}
              onModalClose={() => attachmentModal.close()}
            />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PatternProduction;
