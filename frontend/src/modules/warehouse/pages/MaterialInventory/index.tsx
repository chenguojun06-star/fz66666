import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Tag,
  message,
  Select,
  Image,
  Row,
  Col,
  Tooltip,
  Form,
  InputNumber,
} from 'antd';
import type { Dayjs } from 'dayjs';
import {
  PlusOutlined,
  DownloadOutlined,
  WarningOutlined,
  PrinterOutlined,
  ScanOutlined,
  InboxOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import RowActions from '@/components/common/RowActions';
import { useModal, useTablePagination } from '@/hooks';
import { useAuth, isSupervisorOrAbove, isAdmin as isAdminUser } from '@/utils/AuthContext';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import MaterialAlertRanking, { MaterialStockAlertItem } from './components/MaterialAlertRanking';
import './MaterialInventory.css';
import StandardModal from '@/components/common/StandardModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';

const { Option } = Select;

// 物料批次明细接口
interface MaterialBatchDetail {
  batchNo: string;              // 批次号
  warehouseLocation: string;    // 仓库位置
  color?: string;               // 颜色（如果有）
  availableQty: number;         // 可用库存
  lockedQty: number;            // 锁定库存
  inboundDate: string;          // 入库日期
  expiryDate?: string;          // 过期日期（如果有）
  outboundQty?: number;         // 出库数量
}

// 面辅料库存
interface MaterialInventory {
  id: string;
  materialCode: string;
  materialName: string;
  materialImage?: string;
  materialType: string;
  specification: string;
  color?: string;
  supplierName: string;
  quantity: number; // 统一用 quantity
  availableQty: number; // 暂时映射 quantity
  inTransitQty: number;
  lockedQty: number;
  safetyStock: number;
  unit: string;
  unitPrice: number;
  totalValue: number;
  warehouseLocation: string;
  lastInboundDate: string;
  lastOutboundDate: string;
  lastInboundBy?: string;     // 最后入库操作人
  lastOutboundBy?: string;    // 最后出库操作人
  remark?: string;            // 备注
  // 面料属性
  fabricWidth?: string;       // 门幅（仅面料）
  fabricWeight?: string;      // 克重（仅面料）
  fabricComposition?: string; // 成分（仅面料）
  size?: string;              // 尺码（兼容筛选/展示）
  updateTime?: string;
}

const _MaterialInventory: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<MaterialInventory[]>([]);
  const { user } = useAuth(); // 获取当前用户信息

  // ===== 使用 useTablePagination 管理分页 =====
  const pagination = useTablePagination(20);

  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // ===== 使用 useModal 管理弹窗 =====
  const detailModal = useModal<MaterialInventory>();
  const inboundModal = useModal<MaterialInventory>();
  const outboundModal = useModal<MaterialInventory>();

  const [inboundForm] = Form.useForm();
  const [outboundForm] = Form.useForm();
  const [batchDetails, setBatchDetails] = useState<MaterialBatchDetail[]>([]);

  const [alertLoading, setAlertLoading] = useState(false);
  const [alertList, setAlertList] = useState<MaterialStockAlertItem[]>([]);
  const [instructionVisible, setInstructionVisible] = useState(false);
  const [instructionSubmitting, setInstructionSubmitting] = useState(false);
  const [instructionTarget, setInstructionTarget] = useState<MaterialStockAlertItem | null>(null);
  const [receiverOptions, setReceiverOptions] = useState<Array<{ label: string; value: string; name: string; roleName?: string }>>([]);
  const [instructionForm] = Form.useForm();

  const [stats, setStats] = useState({
    totalValue: 0,
    totalQty: 0,
    lowStockCount: 0,
    materialTypes: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
        const { current, pageSize } = pagination.pagination;
        const res = await api.get('/production/material/stock/list', {
            params: {
                page: current,
                pageSize: pageSize,
                materialCode: searchText,
                materialType: selectedType || undefined,
                startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
                endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
            }
        });

        if (res?.data?.records) {
            const list = res.data.records.map((item: any) => ({
                ...item,
                availableQty: item.quantity, // 暂用总库存代替可用
                specification: item.specifications, // 字段映射
                safetyStock: 100, // 默认值
                inTransitQty: 0, // 暂无数据
                unitPrice: 0, // 暂无数据
                totalValue: 0,
                warehouseLocation: '默认仓',
                lastInboundDate: item.updateTime,
                lastOutboundDate: '-',
            }));
            setDataSource(list);
            pagination.setTotal(res.data.total);

            // 简单统计
            setStats({
                totalValue: 0,
                totalQty: list.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0),
                lowStockCount: list.filter((i: any) => (i.quantity || 0) < 100).length,
                materialTypes: list.length
            });
        }
    } catch (e) {
        console.error(e);
        message.error('加载库存失败');
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.pagination.current, pagination.pagination.pageSize, searchText, selectedType, dateRange]);

  const fetchAlerts = async () => {
    setAlertLoading(true);
    try {
      const res = await api.get('/production/material/stock/alerts', {
        params: {
          days: 30,
          leadDays: 7,
          limit: 50,
          onlyNeed: true,
        },
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        setAlertList(res.data as MaterialStockAlertItem[]);
      } else {
        setAlertList([]);
      }
    } catch (e) {
      console.error(e);
      setAlertList([]);
    } finally {
      setAlertLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60000);
    return () => clearInterval(timer);
  }, []);

  const alertOptions = useMemo(() => {
    return alertList.map((item) => {
      const key = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      const label = `${item.materialName || item.materialCode || '物料'}${item.color ? `/${item.color}` : ''}${item.size ? `/${item.size}` : ''}`;
      return { label, value: key };
    });
  }, [alertList]);

  const loadReceivers = async () => {
    try {
      const res = await api.get('/system/user/list', {
        params: { page: 1, pageSize: 200 },
      });
      if (res?.code === 200 && res.data?.records) {
        const items = res.data.records.map((item: any) => {
          const name = String(item.name || item.username || item.id || '').trim();
          return {
            label: name,
            value: String(item.id || ''),
            name,
            roleName: String(item.roleName || ''),
          };
        }).filter((item: any) => item.value);
        const supervisors = items.filter((item: any) => {
          const roleName = String(item.roleName || '');
          return roleName.includes('主管') || roleName.includes('管理员');
        });
        setReceiverOptions(supervisors);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openInstruction = (alert: MaterialStockAlertItem) => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    const target = alert;
    setInstructionTarget(target);
    const suggested = Number(target.suggestedSafetyStock ?? target.safetyStock ?? 0);
    const current = Number(target.quantity ?? 0);
    const shortage = Math.max(0, suggested - current);
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();

    const materialKey = `${target.materialCode || ''}|${target.color || ''}|${target.size || ''}`;
    instructionForm.setFieldsValue({
      materialSelect: materialKey,
      purchaseQuantity: shortage > 0 ? shortage : 1,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      remark: '',
    });

    setInstructionVisible(true);
    if (!receiverOptions.length) {
      loadReceivers();
    }
  };

  const openInstructionEmpty = () => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    setInstructionTarget(null);
    instructionForm.resetFields();
    setInstructionVisible(true);
    if (!receiverOptions.length) {
      loadReceivers();
    }
  };

  const handleMaterialSelect = (value: string) => {
    const target = alertList.find((item) => {
      const key = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      return key === value;
    }) || null;
    setInstructionTarget(target);
    if (target) {
      const suggested = Number(target.suggestedSafetyStock ?? target.safetyStock ?? 0);
      const current = Number(target.quantity ?? 0);
      const shortage = Math.max(0, suggested - current);
      instructionForm.setFieldsValue({
        purchaseQuantity: shortage > 0 ? shortage : 1,
      });
    }
  };

  const closeInstruction = () => {
    setInstructionVisible(false);
    setInstructionTarget(null);
    instructionForm.resetFields();
  };

  const handleSendInstruction = async () => {
    if (!instructionTarget) {
      message.error('请选择物料');
      return;
    }
    try {
      const values = await instructionForm.validateFields();
      const receiverId = String(values.receiverId || '').trim();
      const receiverName = String(values.receiverName || '').trim();
      if (!receiverId || !receiverName) {
        message.error('请选择采购人');
        return;
      }
      setInstructionSubmitting(true);
      const payload = {
        materialId: instructionTarget.materialId,
        materialCode: instructionTarget.materialCode,
        materialName: instructionTarget.materialName,
        materialType: instructionTarget.materialType,
        unit: instructionTarget.unit,
        color: instructionTarget.color,
        size: instructionTarget.size,
        purchaseQuantity: values.purchaseQuantity,
        receiverId,
        receiverName,
        remark: values.remark || '',
      };
      const res = await api.post('/production/purchase/instruction', payload);
      if (res?.code === 200) {
        message.success('指令已下发');
        closeInstruction();
      } else {
        message.error(res?.message || '指令下发失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '指令下发失败');
    } finally {
      setInstructionSubmitting(false);
    }
  };

  const buildAlertFromRecord = (record: MaterialInventory): MaterialStockAlertItem => {
    const key = `${record.materialCode || ''}|${record.color || ''}|${record.size || ''}`;
    const matched = alertList.find((item) => {
      const itemKey = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      return itemKey === key;
    });
    if (matched) {
      return matched;
    }
    return {
      materialId: record.id,
      materialCode: record.materialCode,
      materialName: record.materialName,
      materialType: record.materialType,
      unit: record.unit,
      color: record.color,
      size: record.size,
      quantity: record.quantity,
      safetyStock: record.safetyStock,
      suggestedSafetyStock: record.safetyStock,
    };
  };

  const openInstructionFromRecord = (record: MaterialInventory) => {
    const alert = buildAlertFromRecord(record);
    openInstruction(alert);
  };

  // 查看详情（出入库记录）
  const handleViewDetail = (record: MaterialInventory) => {
    detailModal.open(record);
  };

  // 扫码入库
  const handleInbound = (record?: MaterialInventory) => {
    if (record) {
      inboundForm.setFieldsValue({
        materialCode: record.materialCode,
        materialName: record.materialName,
        warehouseLocation: record.warehouseLocation,
      });
    }
    inboundModal.open(record || null);
  };

  // 确认入库
  const handleInboundConfirm = async () => {
    try {
      const values = await inboundForm.validateFields();

      // 调用手动入库API
      const response = await api.post('/production/material/inbound/manual', {
        materialCode: values.materialCode,
        materialName: values.materialName || '',
        materialType: values.materialType || '面料',
        color: values.color || '',
        size: values.size || '',
        quantity: values.quantity,
        warehouseLocation: values.warehouseLocation || '默认仓',
        supplierName: values.supplierName || '',
        operatorId: user?.id || '',
        operatorName: user?.name || user?.username || '系统',
        remark: values.remark || '',
      });

      if (response.data.code === 200) {
        message.success(`入库成功！入库单号：${response.data.data.inboundNo}`);
        inboundModal.close();
        inboundForm.resetFields();
        // 刷新库存列表
        fetchData();
      } else {
        message.error(response.data.message || '入库失败');
      }
    } catch (error: any) {
      console.error('入库失败:', error);
      message.error(error.response?.data?.message || error.message || '入库操作失败，请重试');
    }
  };

  // 出库
  const handleOutbound = (record: MaterialInventory) => {
    outboundForm.setFieldsValue({
      materialCode: record.materialCode,
      materialName: record.materialName,
      availableQty: record.availableQty,
    });
    outboundModal.open(record);

    // 模拟批次明细数据（实际应从后端获取）
    const mockBatchDetails: MaterialBatchDetail[] = [
      {
        batchNo: 'BATCH-20260101-001',
        warehouseLocation: 'A-01-01',
        color: record.color,
        availableQty: 800,
        lockedQty: 50,
        inboundDate: '2026-01-01',
        expiryDate: '2027-01-01',
      },
      {
        batchNo: 'BATCH-20260115-002',
        warehouseLocation: 'A-01-02',
        color: record.color,
        availableQty: 650,
        lockedQty: 30,
        inboundDate: '2026-01-15',
        expiryDate: '2027-01-15',
      },
      {
        batchNo: 'BATCH-20260120-003',
        warehouseLocation: 'A-02-01',
        color: record.color,
        availableQty: 550,
        lockedQty: 20,
        inboundDate: '2026-01-20',
        expiryDate: '2027-01-20',
      },
    ];
    setBatchDetails(mockBatchDetails);
  };

  // 批次数量变化
  const handleBatchQtyChange = (index: number, value: number | null) => {
    const newDetails = [...batchDetails];
    newDetails[index].outboundQty = value || 0;
    setBatchDetails(newDetails);
  };

  // 确认出库
  const handleOutboundConfirm = async () => {
    const selectedBatches = batchDetails.filter(item => (item.outboundQty || 0) > 0);
    if (selectedBatches.length === 0) {
      message.warning('请至少输入一个批次的出库数量');
      return;
    }

    // 验证每个批次的出库数量不超过可用库存
    const invalidBatches = selectedBatches.filter(item => (item.outboundQty || 0) > item.availableQty);
    if (invalidBatches.length > 0) {
      message.error(`批次 ${invalidBatches[0].batchNo} 的出库数量超过可用库存`);
      return;
    }

    // console.log('物料出库数据:', {
    //   materialCode: outboundModal.data?.materialCode,
    //   materialName: outboundModal.data?.materialName,
    //   batches: selectedBatches.map(item => ({
    //     batchNo: item.batchNo,
    //     warehouseLocation: item.warehouseLocation,
    //     color: item.color,
    //     outboundQty: item.outboundQty,
    //   })),
    // });

    message.success(`成功出库 ${selectedBatches.length} 个批次，共 ${selectedBatches.reduce((sum, item) => sum + (item.outboundQty || 0), 0)} ${outboundModal.data?.unit || '件'}`);
    outboundModal.close();
    setBatchDetails([]);
    outboundForm.resetFields();
  };
// 打印出库单
  const handlePrintOutbound = (record: MaterialInventory) => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>物料出库单</title>
        <style>
          body { font-family: SimHei, Arial; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 28px; }
          .info { margin: 20px 0; }
          .info-row { display: flex; margin: 10px 0; }
          .info-label { width: 120px; font-weight: bold; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #000; padding: 8px; text-align: left; }
          .table th { background: #f0f0f0; font-weight: bold; }
          .footer { margin-top: 40px; }
          .signature { display: flex; justify-content: space-between; margin-top: 60px; }
          .signature div { width: 200px; border-bottom: 1px solid #000; text-align: center; padding-top: 80px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>物料出库单</h1>
        </div>
        <div class="info">
          <div class="info-row"><span class="info-label">出库单号：</span><span>OUT${new Date().getTime()}</span></div>
          <div class="info-row"><span class="info-label">出库日期：</span><span>${dayjs().format('YYYY-MM-DD HH:mm')}</span></div>
          <div class="info-row"><span class="info-label">面料编号：</span><span>${record.materialCode}</span></div>
          <div class="info-row"><span class="info-label">面料名称：</span><span>${record.materialName}</span></div>
          <div class="info-row"><span class="info-label">规格型号：</span><span>${record.specification}</span></div>
          <div class="info-row"><span class="info-label">供应商：</span><span>${record.supplierName}</span></div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>序号</th>
              <th>面料名称</th>
              <th>规格</th>
              <th>单位</th>
              <th>库存数量</th>
              <th>出库数量</th>
              <th>库位</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>${record.materialName}</td>
              <td>${record.specification}</td>
              <td>${record.unit}</td>
              <td>${record.availableQty}</td>
              <td>___________</td>
              <td>${record.warehouseLocation}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div class="info-row"><span class="info-label">备注：</span><span>_________________________________________</span></div>
        </div>
        <div class="signature">
          <div>仓库管理员：</div>
          <div>领料人：</div>
          <div>审核人：</div>
        </div>
      </body>
      </html>
    `;

    const success = safePrint(printContent, '物料出库单');
    if (!success) {
      message.error('浏览器拦截了新窗口');
    }
  };

  const columns: ColumnsType<MaterialInventory> = [
    {
      title: '图片',
      key: 'image',
      width: 90,
      fixed: 'left',
      align: 'center',
      render: (_, record) => (
        <Image
          src={record.materialImage || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjcwIiBoZWlnaHQ9IjcwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+54mp5paZPC90ZXh0Pjwvc3ZnPg=="}
          alt="物料"
          width={70}
          height={70}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjcwIiBoZWlnaHQ9IjcwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+54mp5paZPC90ZXh0Pjwvc3ZnPg=="
        />
      ),
    },
    {
      title: '物料信息',
      key: 'materialInfo',
      width: 260,
      fixed: 'left',
      render: (_, record) => (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Space size={8} align="center">
            <Tag
              color={record.materialType === '面料' ? 'blue' : record.materialType === '辅料' ? 'green' : 'orange'}
              style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}
            >
              {record.materialType}
            </Tag>
          </Space>
          <div className="material-info-grid">
            <div className="material-info-item">
              <span className="material-info-label">物料编号</span>
              <span className="material-info-value">{record.materialCode || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">物料名称</span>
              <span className="material-info-value">{record.materialName || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">布行</span>
              <span className="material-info-value">{record.supplierName || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">规格</span>
              <span className="material-info-value">{record.specification || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">颜色</span>
              <span className="material-info-value">{record.color || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">尺码</span>
              <span className="material-info-value">{record.size || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">单位</span>
              <span className="material-info-value">{record.unit || '-'}</span>
            </div>
            <div className="material-info-item">
              <span className="material-info-label">库位</span>
              <span className="material-info-value">{record.warehouseLocation || '-'}</span>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '面料属性',
      key: 'fabricProperties',
      width: 260,
      render: (_, record) => {
        if (record.materialType !== '面料') {
          return <div style={{ textAlign: 'center', color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>-</div>;
        }
        return (
          <Space orientation="vertical" size={6} style={{ width: '100%' }}>
            {record.fabricWidth && (
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>门幅:</span>{' '}
                <span style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: "var(--font-size-base)" }}>{record.fabricWidth}</span>
              </div>
            )}
            {record.fabricWeight && (
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>克重:</span>{' '}
                <span style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: "var(--font-size-base)" }}>{record.fabricWeight}</span>
              </div>
            )}
            {record.fabricComposition && (
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>成分:</span>{' '}
                <span style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: "var(--font-size-base)" }}>{record.fabricComposition}</span>
              </div>
            )}
            {!record.fabricWidth && !record.fabricWeight && !record.fabricComposition && (
              <div style={{ textAlign: 'center', color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>-</div>
            )}
          </Space>
        );
      },
    },
    {
      title: '库存状态',
      key: 'stock',
      width: 300,
      render: (_, record) => {
        const availableQty = record.availableQty ?? 0;
        const inTransitQty = record.inTransitQty ?? 0;
        const lockedQty = record.lockedQty ?? 0;
        const safetyStock = record.safetyStock ?? 0;
        const isLow = availableQty < safetyStock;
        return (
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <div className="stock-grid">
              <div>
                <div className="stock-label">可用库存</div>
                <div className={`stock-value ${isLow ? 'stock-value--warn' : 'stock-value--ok'}`}>
                  {availableQty.toLocaleString()}
                  {isLow && <WarningOutlined style={{ marginLeft: 4, fontSize: "var(--font-size-base)" }} />}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
              <div>
                <div className="stock-label">在途</div>
                <div className="stock-value stock-value--info">
                  {inTransitQty.toLocaleString()}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
              <div>
                <div className="stock-label">锁定</div>
                <div className="stock-value stock-value--lock">
                  {lockedQty.toLocaleString()}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
            </div>
            <div style={{
              fontSize: "var(--font-size-sm)",
              color: 'var(--neutral-text-secondary)',
              paddingTop: 8,
              borderTop: '1px solid #f0f0f0',
              fontWeight: 500
            }}>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>安全库存:</span> {safetyStock} {record.unit}
              <span style={{ margin: '0 8px', color: 'var(--neutral-border)' }}>|</span>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>库位:</span> {record.warehouseLocation || '-'}
            </div>
          </Space>
        );
      },
    },
    {
      title: '金额信息',
      key: 'price',
      width: 180,
      render: (_, record) => (
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>单价</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--neutral-text)' }}>
              ¥{(record.unitPrice ?? 0).toFixed(2)}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>/{record.unit}</div>
          </div>
          <div style={{
            paddingTop: 8,
            borderTop: '1px solid #f0f0f0'
          }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>库存总值</div>
            <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: 'var(--primary-color)' }}>
              ¥{(record.totalValue ?? 0).toLocaleString()}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '出入库记录',
      key: 'records',
      width: 200,
      render: (_, record) => (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ padding: '4px 8px', background: '#f0f9ff', borderRadius: 4 }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--primary-color)', marginBottom: 2 }}>📥 最后入库</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>{record.lastInboundDate}</div>
            {record.lastInboundBy && (
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastInboundBy}</div>
            )}
          </div>
          <div style={{ padding: '4px 8px', background: '#fff7e6', borderRadius: 4 }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--warning-color-dark)', marginBottom: 2 }}>📤 最后出库</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>{record.lastOutboundDate}</div>
            {record.lastOutboundBy && (
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastOutboundBy}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: '备注',
      key: 'remark',
      width: 200,
      render: (_, record) => (
        <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', lineHeight: 1.5 }}>
          {record.remark || '-'}
        </div>
      ),
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          vertical
          actions={[
            {
              label: '采购指令',
              icon: <WarningOutlined />,
              onClick: () => openInstructionFromRecord(record)
            },
            {
              label: '入库',
              type: 'primary',
              icon: <InboxOutlined />,
              onClick: () => handleInbound(record)
            },
            {
              label: '出库',
              icon: <ExportOutlined />,
              onClick: () => handleOutbound(record)
            },
            {
              label: '打印出库单',
              icon: <PrinterOutlined />,
              onClick: () => handlePrintOutbound(record)
            },
            {
              label: '详情',
              tooltip: '查看最近出入库记录',
              onClick: () => handleViewDetail(record)
            }
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: '16px 24px' }}>
        <Card size="small" className="material-summary-bar">
          <div className="material-summary-content">
            <div className="material-summary-item">
              <span className="material-summary-label">库存总值</span>
              <span className="material-summary-value">¥{Number(stats.totalValue || 0).toLocaleString()}</span>
            </div>
            <div className="material-summary-item">
              <span className="material-summary-label">库存总量</span>
              <span className="material-summary-value">{Number(stats.totalQty || 0).toLocaleString()} 件/米</span>
            </div>
            <div className="material-summary-item">
              <span className="material-summary-label">低于安全库存</span>
              <span className="material-summary-value">{Number(stats.lowStockCount || 0).toLocaleString()} 种</span>
            </div>
            <div className="material-summary-item">
              <span className="material-summary-label">物料种类</span>
              <span className="material-summary-value">{Number(stats.materialTypes || 0).toLocaleString()} 类</span>
            </div>
          </div>
        </Card>

        <div className="material-alerts-section">
          <MaterialAlertRanking
            loading={alertLoading}
            alerts={alertList}
            onSendInstruction={openInstruction}
          />
        </div>

        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>📦 面辅料进销存</h2>
          </div>

          <StandardToolbar
            left={(
              <StandardSearchBar
                searchValue={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder="搜索物料编号/名称"
                dateValue={dateRange}
                onDateChange={setDateRange}
                statusValue={selectedType}
                onStatusChange={setSelectedType}
                statusOptions={[
                  { label: '面料', value: '面料' },
                  { label: '辅料', value: '辅料' },
                  { label: '配件', value: '配件' },
                ]}
              />
            )}
            right={(
              <>
                <Button icon={<WarningOutlined />} onClick={openInstructionEmpty}>发出采购需求</Button>
                <Button icon={<DownloadOutlined />}>导出</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => handleInbound()}>入库</Button>
              </>
            )}
          />

          <Table
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            scroll={{ x: 1600 }}
            pagination={pagination.pagination}
          />
        </Card>
      </div>

      <StandardModal
        title="下发采购指令"
        open={instructionVisible}
        onCancel={closeInstruction}
        onOk={handleSendInstruction}
        confirmLoading={instructionSubmitting}
        okText="下发"
        centered
        size="md"
      >
        <Form form={instructionForm} layout="vertical">
          {!instructionTarget && (
            <Form.Item
              name="materialSelect"
              label="选择物料"
              rules={[{ required: true, message: '请选择物料' }]}
            >
              <Select
                showSearch
                placeholder="请选择预警物料"
                options={alertOptions}
                onChange={handleMaterialSelect}
                filterOption={(input, option) =>
                  String(option?.label || '').toLowerCase().includes(String(input || '').toLowerCase())
                }
              />
            </Form.Item>
          )}
          <Form.Item label="物料信息">
            <div className="material-info-grid">
              <div className="material-info-item">
                <span className="material-info-label">物料编号</span>
                <span className="material-info-value">{instructionTarget?.materialCode || '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">物料名称</span>
                <span className="material-info-value">{instructionTarget?.materialName || '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">类型</span>
                <span className="material-info-value">{instructionTarget?.materialType || '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">单位</span>
                <span className="material-info-value">{instructionTarget?.unit || '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">颜色</span>
                <span className="material-info-value">{instructionTarget?.color || '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">尺码</span>
                <span className="material-info-value">{instructionTarget?.size || '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">单件用量</span>
                <span className="material-info-value">{instructionTarget?.perPieceUsage ?? '-'}</span>
              </div>
              <div className="material-info-item">
                <span className="material-info-label">最少/最大可产</span>
                <span className="material-info-value">
                  {instructionTarget?.minProductionQty ?? '-'} / {instructionTarget?.maxProductionQty ?? '-'}
                </span>
              </div>
            </div>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="purchaseQuantity"
                label="采购数量"
                rules={[{ required: true, message: '请输入采购数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="receiverId"
                label="采购人"
                rules={[{ required: true, message: '请选择采购人' }]}
              >
                <Select
                  showSearch
                  placeholder="请选择采购人"
                  options={receiverOptions}
                  onChange={(value) => {
                    const hit = receiverOptions.find((item) => item.value === value);
                    instructionForm.setFieldsValue({ receiverName: hit?.name || '' });
                  }}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(String(input || '').toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="receiverName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 详情模态框 - 出入库记录 */}
      <StandardModal
        title="出入库记录"
        open={detailModal.visible}
        onCancel={detailModal.close}
        footer={[
          <Button key="close" onClick={detailModal.close}>
            关闭
          </Button>,
        ]}
        size="md"
      >
        {detailModal.data && (
          <div>
            <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5' }}>
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <strong style={{ fontSize: "var(--font-size-lg)" }}>{detailModal.data.materialCode}</strong>
                  <Tag color="blue" style={{ marginLeft: 8 }}>{detailModal.data.materialType}</Tag>
                </div>
                <div style={{ fontSize: "var(--font-size-base)" }}>{detailModal.data.materialName}</div>
              </Space>
            </Card>

            <Table
              size="small"
              dataSource={[
                {
                  id: '1',
                  type: '入库',
                  date: detailModal.data.lastInboundDate,
                  operator: detailModal.data.lastInboundBy,
                  quantity: 2000,
                  unit: detailModal.data.unit,
                  warehouseLocation: detailModal.data.warehouseLocation,
                  remark: '正常入库',
                },
                {
                  id: '2',
                  type: '出库',
                  date: detailModal.data.lastOutboundDate,
                  operator: detailModal.data.lastOutboundBy,
                  quantity: 500,
                  unit: detailModal.data.unit,
                  warehouseLocation: detailModal.data.warehouseLocation,
                  remark: '生产领料',
                },
              ]}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'type',
                  width: 80,
                  render: (text) => (
                    <Tag color={text === '入库' ? 'blue' : 'orange'}>{text}</Tag>
                  ),
                },
                {
                  title: '日期',
                  dataIndex: 'date',
                  width: 120,
                },
                {
                  title: '数量',
                  width: 120,
                  render: (_, record) => `${record.quantity} ${record.unit}`,
                },
                {
                  title: '操作人',
                  dataIndex: 'operator',
                  width: 100,
                },
                {
                  title: '库位',
                  dataIndex: 'warehouseLocation',
                  width: 100,
                },
                {
                  title: '备注',
                  dataIndex: 'remark',
                },
              ]}
              pagination={false}
            />
          </div>
        )}
      </StandardModal>

      {/* 入库模态框 */}
      <StandardModal
        title={
          <Space>
            <ScanOutlined style={{ color: 'var(--primary-color)' }} />
            扫码入库
          </Space>
        }
        open={inboundModal.visible}
        onCancel={() => {
          inboundModal.close();
          inboundForm.resetFields();
        }}
        onOk={handleInboundConfirm}
        size="md"
      >
        <Form
          form={inboundForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="面料编号"
            name="materialCode"
            rules={[{ required: true, message: '请输入或扫码面料编号' }]}
          >
            <Input
              placeholder="请扫码或手动输入面料编号"
              prefix={<ScanOutlined />}
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="面料名称"
            name="materialName"
          >
            <Input disabled />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="入库数量"
                name="quantity"
                rules={[{ required: true, message: '请输入入库数量' }]}
              >
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  placeholder="请输入数量"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="仓库库位"
                name="warehouseLocation"
                rules={[{ required: true, message: '请选择仓库库位' }]}
              >
                <Select size="large" placeholder="请选择库位">
                  <Option value="A-01-01">A-01-01</Option>
                  <Option value="A-01-02">A-01-02</Option>
                  <Option value="A-02-01">A-02-01</Option>
                  <Option value="B-01-01">B-01-01</Option>
                  <Option value="B-02-01">B-02-01</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="备注"
            name="remark"
          >
            <Input.TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 出库模态框 */}
      <StandardModal
        title={
          <Space>
            <ExportOutlined style={{ color: 'var(--primary-color)' }} />
            <span>物料出库 - 批次明细</span>
          </Space>
        }
        open={outboundModal.visible}
        onCancel={() => {
          outboundModal.close();
          setBatchDetails([]);
          outboundForm.resetFields();
        }}
        onOk={handleOutboundConfirm}
        size="lg"
        okText="确认出库"
        cancelText="取消"
      >
        {outboundModal.data && (
          <Space orientation="vertical" style={{ width: '100%' }} size="large">
            {/* 基础信息卡片 */}
            <Card size="small" style={{ background: '#f5f5f5' }}>
              <Row gutter={24}>
                <Col span={6}>
                  <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>面料编号</div>
                  <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>{outboundModal.data.materialCode}</div>
                </Col>
                <Col span={8}>
                  <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>面料名称</div>
                  <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>{outboundModal.data.materialName}</div>
                </Col>
                <Col span={5}>
                  <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>物料类型</div>
                  <div><Tag color="blue">{outboundModal.data.materialType}</Tag></div>
                </Col>
                <Col span={5}>
                  <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>颜色</div>
                  <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>{outboundModal.data.color || '-'}</div>
                </Col>
              </Row>
            </Card>

            {/* 批次明细表格 */}
            <div>
              <div style={{
                fontSize: "var(--font-size-base)",
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--neutral-text)'
              }}>
                📋 请选择需要出库的批次，并输入数量：
              </div>
              <Table
                columns={[
                  {
                    title: '批次号',
                    dataIndex: 'batchNo',
                    key: 'batchNo',
                    width: 160,
                    render: (text: string) => (
                      <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{text}</span>
                    ),
                  },
                  {
                    title: '仓库位置',
                    dataIndex: 'warehouseLocation',
                    key: 'warehouseLocation',
                    width: 100,
                    align: 'center' as const,
                  },
                  {
                    title: '颜色',
                    dataIndex: 'color',
                    key: 'color',
                    width: 80,
                    align: 'center' as const,
                    render: (color: string) => color ? <Tag color="blue">{color}</Tag> : '-',
                  },
                  {
                    title: '入库日期',
                    dataIndex: 'inboundDate',
                    key: 'inboundDate',
                    width: 110,
                    align: 'center' as const,
                  },
                  {
                    title: '可用库存',
                    dataIndex: 'availableQty',
                    key: 'availableQty',
                    width: 100,
                    align: 'center' as const,
                    render: (qty: number) => (
                      <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>{qty}</span>
                    ),
                  },
                  {
                    title: '锁定库存',
                    dataIndex: 'lockedQty',
                    key: 'lockedQty',
                    width: 100,
                    align: 'center' as const,
                    render: (qty: number) => (
                      <span style={{ color: 'var(--warning-color)', fontWeight: 600 }}>{qty}</span>
                    ),
                  },
                  {
                    title: '出库数量',
                    dataIndex: 'outboundQty',
                    key: 'outboundQty',
                    width: 120,
                    align: 'center' as const,
                    render: (value: number, _record: MaterialBatchDetail, index: number) => (
                      <InputNumber
                        min={0}
                        max={_record.availableQty}
                        value={value}
                        onChange={(val) => handleBatchQtyChange(index, val)}
                        style={{ width: '100%' }}
                        placeholder="0"
                      />
                    ),
                  },
                ]}
                dataSource={batchDetails}
                rowKey="batchNo"
                pagination={false}
                scroll={{ y: 300 }}
                size="small"
                bordered
                summary={() => {
                  const totalOutbound = batchDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
                  const totalAvailable = batchDetails.reduce((sum, item) => sum + item.availableQty, 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={4} align="right">
                          <strong>合计</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="center">
                          <strong style={{ color: 'var(--success-color)' }}>{totalAvailable}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} />
                        <Table.Summary.Cell index={3} align="center">
                          <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-md)" }}>
                            {totalOutbound} {outboundModal.data.unit}
                          </strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </div>

            {/* 提示信息 */}
            <div style={{
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
              borderRadius: 4,
              padding: '8px 12px',
              fontSize: "var(--font-size-sm)",
              color: 'var(--primary-color)'
            }}>
              💡 提示：请在"出库数量"列输入需要出库的数量，系统将自动汇总。出库数量不能超过可用库存。
            </div>
          </Space>
        )}
      </StandardModal>
    </Layout>
  );
};

export default _MaterialInventory;
