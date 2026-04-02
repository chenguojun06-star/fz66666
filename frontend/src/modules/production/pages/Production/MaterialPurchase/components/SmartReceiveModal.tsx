import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Tag, InputNumber, Modal, Input, Tooltip, Space, Divider, Empty } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  ShopOutlined,
  SendOutlined,
  UndoOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import PageStatCards, { StatCard } from '@/components/common/PageStatCards';
import InoutRecommendBanner from './InoutRecommendBanner';
import api from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';

/** 获取物料类型中文名（委托共享工具函数） */
const getMaterialTypeName = (type: string): string => {
  return getMaterialTypeLabel(type);
};

/** 获取物料类型颜色 */
const getMaterialTypeColor = (type: string): string => {
  if (type.startsWith('fabric')) return 'blue';
  if (type.startsWith('lining')) return 'cyan';
  if (type.startsWith('accessory')) return 'green';
  return 'default';
};

/** 物料项类型 */
interface MaterialItem {
  purchaseId: string;
  materialCode: string;
  materialName: string;
  materialType: string;
  color: string;
  size: string;
  requiredQty: number;
  availableStock: number;
  canPickQty: number;
  needPurchaseQty: number;
  unit: string;
  purchaseStatus: string;
  arrivedQuantity: number;
  /** 用户填写的领取数量 */
  userPickQty?: number;
}

/** 出库记录类型 */
interface PickingRecord {
  pickingId: string;
  pickingNo: string;
  status: string;
  pickerName: string;
  pickTime: string;
  remark: string;
  items: Array<{
    materialCode: string;
    materialName: string;
    color: string;
    size: string;
    quantity: number;
    unit: string;
  }>;
}

interface SmartReceiveModalProps {
  open: boolean;
  orderNo: string;
  onCancel: () => void;
  onSuccess: () => void;
  isSupervisorOrAbove: boolean;
  userId?: string;
  userName?: string;
}

const SmartReceiveModal: React.FC<SmartReceiveModalProps> = ({
  open,
  orderNo,
  onCancel,
  onSuccess,
  isSupervisorOrAbove,
  userId,
  userName,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [pickingRecords, setPickingRecords] = useState<PickingRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // 加载预览数据
  const loadPreview = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      const res = await api.get<{
        code: number;
        data: {
          orderNo: string;
          materials: MaterialItem[];
          pickingRecords: PickingRecord[];
          totalRequired: number;
          totalAvailable: number;
          pendingCount: number;
          totalCount: number;
        };
      }>('/production/purchase/smart-receive-preview', { params: { orderNo } });

      if (res.code === 200 && res.data) {
        const mats = (res.data.materials || []).map((m: MaterialItem) => ({
          ...m,
          userPickQty: m.canPickQty, // 默认填入可领取的最大数量
        }));
        setMaterials(mats);
        setPickingRecords(res.data.pickingRecords || []);
        setPendingCount(res.data.pendingCount || 0);
      }
    } catch (e) {
      console.error('加载预览失败:', e);
      message.error('加载面辅料数据失败');
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    if (open && orderNo) {
      loadPreview();
    } else if (!open) {
      setMaterials([]);
      setPickingRecords([]);
      setPendingCount(0);
    }
  }, [open, orderNo, loadPreview]);

  // 更新用户填写的领取数量
  const updatePickQty = (purchaseId: string, value: number | null) => {
    setMaterials((prev) =>
      prev.map((m) => (m.purchaseId === purchaseId ? { ...m, userPickQty: value ?? 0 } : m)),
    );
  };

  // 仓库领取单项 → 领取填入的数量 → 差额自动保持采购状态
  const handleWarehousePick = async (item: MaterialItem) => {
    const pickQty = item.userPickQty || 0;
    if (pickQty <= 0) {
      message.warning('请输入领取数量');
      return;
    }
    if (pickQty > item.availableStock) {
      message.error(`库存不足，最多可领取 ${item.availableStock}`);
      return;
    }

    const remainQty = item.requiredQty - pickQty;
    const confirmMsg = remainQty > 0
      ? `从仓库领取 ${pickQty}，剩余 ${remainQty} 将自动生成采购单`
      : `从仓库领取 ${pickQty}，全部满足`;

    Modal.confirm({
      width: '30vw',
      title: `确认仓库领取 - ${item.materialName}`,
      icon: <ShopOutlined style={{ color: 'var(--color-primary)' }} />,
      content: (
        <div>
          <p>物料：<strong>{item.materialName}</strong> {item.color ? `(${item.color})` : ''}</p>
          <p>需求数量：<strong>{item.requiredQty}</strong></p>
          <p>仓库库存：<strong>{item.availableStock}</strong></p>
          <p style={{ color: remainQty > 0 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 600 }}>{confirmMsg}</p>
        </div>
      ),
      okText: '确认领取',
      cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, [item.purchaseId]: true }));
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
            purchaseId: item.purchaseId,
            pickQty,
            receiverId: userId,
            receiverName: userName,
          });

          if (res.code === 200) {
            message.success(`${item.materialName} 仓库领取成功，已出库 ${pickQty}${remainQty > 0 ? `，剩余 ${remainQty} 待采购` : ''}`);
            loadPreview();
            onSuccess();
          } else {
            message.error(res.message || '领取失败');
          }
        } catch (e: any) {
          message.error((e as Error)?.message || '领取失败');
        } finally {
          setActionLoading((prev) => ({ ...prev, [item.purchaseId]: false }));
        }
      },
    });
  };

  // 一键采购（无库存时确认外部采购）
  const handlePurchaseOnly = (item: MaterialItem) => {
    Modal.confirm({
      width: '30vw',
      title: `确认采购 - ${item.materialName}`,
      icon: <SendOutlined style={{ color: 'var(--color-primary)' }} />,
      content: (
        <div>
          <p>物料编号：<strong>{item.materialCode}</strong></p>
          <p>物料名称：<strong>{item.materialName}</strong>（{getMaterialTypeName(item.materialType)}）</p>
          <p>需求数量：<strong>{item.requiredQty} {item.unit}</strong></p>
          <p>仓库库存：<span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>0（无库存）</span></p>
          <Divider style={{ margin: '8px 0' }} />
          <p style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            确认后将标记为"采购中"，请联系供应商进行采购。
          </p>
        </div>
      ),
      okText: '确认采购',
      cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, [item.purchaseId]: true }));
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
            purchaseId: item.purchaseId,
            receiverId: userId,
            receiverName: userName,
          });
          if (res.code === 200) {
            message.success(`${item.materialName} 已确认采购，请联系供应商`);
            loadPreview();
            onSuccess();
          } else {
            message.error(res.message || '操作失败');
          }
        } catch (e: any) {
          message.error((e as Error)?.message || '操作失败');
        } finally {
          setActionLoading((prev) => ({ ...prev, [item.purchaseId]: false }));
        }
      },
    });
  };

  // 撤销出库单
  const handleCancelPicking = (record: PickingRecord) => {
    let reason = '';
    Modal.confirm({
      width: '30vw',
      title: '撤销出库单',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>出库单号：<strong>{record.pickingNo}</strong></p>
          <p>领料人：{record.pickerName}</p>
          <p style={{ marginBottom: 8 }}>撤销后将回退库存并恢复采购任务状态。</p>
          <Input.TextArea
            placeholder="请填写撤销原因（必填）"
            rows={3}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      okText: '确认撤销',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        if (!reason.trim()) {
          message.error('请填写撤销原因');
          throw new Error('请填写撤销原因');
        }
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/cancel-picking', {
            pickingId: record.pickingId,
            reason: reason.trim(),
          });
          if (res.code === 200) {
            message.success('出库单撤销成功，库存已回退');
            loadPreview();
            onSuccess();
          } else {
            message.error(res.message || '撤销失败');
          }
        } catch (e: any) {
          message.error((e as Error)?.message || '撤销失败');
        }
      },
    });
  };

  // 一键采购全部（批量处理所有无库存的待处理项）
  const handleBatchPurchaseAll = async () => {
    const needPurchaseItems = materials.filter(
      (m) => m.purchaseStatus === 'pending' && m.availableStock <= 0,
    );
    if (needPurchaseItems.length === 0) {
      message.info('没有需要采购的物料');
      return;
    }

    Modal.confirm({
      width: '30vw',
      title: '确认批量采购',
      icon: <SendOutlined style={{ color: 'var(--color-primary)' }} />,
      content: (
        <div>
          <p>以下 <strong>{needPurchaseItems.length}</strong> 项物料将标记为"采购中"：</p>
          <div style={{ maxHeight: 200, overflow: 'auto', margin: '8px 0', padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 4 }}>
            {needPurchaseItems.map((item) => (
              <div key={item.purchaseId} style={{ fontSize: 13, padding: '2px 0' }}>
                • {item.materialName}（{item.materialCode}）— {item.requiredQty} {item.unit}
              </div>
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <p style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            确认后请联系供应商进行采购。
          </p>
        </div>
      ),
      okText: `确认采购 ${needPurchaseItems.length} 项`,
      cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, _batchPurchase: true }));
        let successCount = 0;
        let failCount = 0;
        try {
          for (const item of needPurchaseItems) {
            try {
              const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
                purchaseId: item.purchaseId,
                receiverId: userId,
                receiverName: userName,
              });
              if (res.code === 200) {
                successCount++;
              } else {
                failCount++;
              }
            } catch {
              failCount++;
            }
          }
          if (failCount === 0) {
            message.success(`批量采购完成：${successCount} 项已标记为采购中`);
          } else {
            message.warning(`批量采购完成：${successCount} 项成功，${failCount} 项失败`);
          }
          loadPreview();
          onSuccess();
        } finally {
          setActionLoading((prev) => ({ ...prev, _batchPurchase: false }));
        }
      },
    });
  };

  // 忽略库存全部外采（跳过仓库库存，所有待处理项直接走外部采购）
  const handleForcePurchaseAll = async () => {
    const allPendingItems = materials.filter((m) => m.purchaseStatus === 'pending');
    if (allPendingItems.length === 0) {
      message.info('没有待处理的采购任务');
      return;
    }
    const hasStockCount = allPendingItems.filter((m) => m.availableStock > 0).length;

    Modal.confirm({
      width: '30vw',
      title: '确认跳过库存全部外采',
      icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      content: (
        <div>
          {hasStockCount > 0 && (
            <p style={{ color: '#fa8c16', fontWeight: 600 }}>
               有 {hasStockCount} 项物料存在可用库存，确认后将跳过仓库直接外采。
            </p>
          )}
          <p>
            以下 <strong>{allPendingItems.length}</strong> 项物料将全部标记为"采购中"：
          </p>
          <div
            style={{
              maxHeight: 200,
              overflow: 'auto',
              margin: '8px 0',
              padding: '8px 12px',
              background: 'var(--color-bg-container)',
              borderRadius: 4,
            }}
          >
            {allPendingItems.map((item) => (
              <div key={item.purchaseId} style={{ fontSize: 13, padding: '2px 0' }}>
                • {item.materialName}（{item.materialCode}）— {item.requiredQty} {item.unit}
                {item.availableStock > 0 && (
                  <span style={{ color: '#fa8c16', marginLeft: 4, fontSize: 12 }}>有库存</span>
                )}
              </div>
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <p style={{ color: '#fa8c16', fontWeight: 600 }}>确认后请联系供应商进行采购，不使用仓库库存。</p>
        </div>
      ),
      okText: `确认外采 ${allPendingItems.length} 项`,
      cancelText: '取消',
      onOk: async () => {
        setActionLoading((prev) => ({ ...prev, _forcePurchase: true }));
        let successCount = 0;
        let failCount = 0;
        try {
          for (const item of allPendingItems) {
            try {
              const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
                purchaseId: item.purchaseId,
                receiverId: userId,
                receiverName: userName,
              });
              if (res.code === 200) {
                successCount++;
              } else {
                failCount++;
              }
            } catch {
              failCount++;
            }
          }
          if (failCount === 0) {
            message.success(`全部外采完成：${successCount} 项已标记为采购中`);
          } else {
            message.warning(`外采完成：${successCount} 项成功，${failCount} 项失败`);
          }
          loadPreview();
          onSuccess();
        } finally {
          setActionLoading((prev) => ({ ...prev, _forcePurchase: false }));
        }
      },
    });
  };

  // 一键智能领取全部（使用原有接口）
  const handleSmartReceiveAll = async () => {
    if (pendingCount === 0) {
      message.info('没有待处理的采购任务');
      return;
    }

    setActionLoading((prev) => ({ ...prev, _all: true }));
    try {
      const res = await api.post<{ code: number; message?: string; data: Record<string, unknown> }>(
        '/production/purchase/smart-receive-all',
        { orderNo, receiverId: userId, receiverName: userName },
      );

      if (res.code === 200) {
        const data = res.data || {};
        const outCount = Number(data.outboundCount || 0);
        const purCount = Number(data.purchaseCount || 0);
        if (outCount > 0 && purCount === 0) {
          message.success(`已提交 ${outCount} 项出库申请，等待仓库确认出库`);
        } else if (outCount > 0 && purCount > 0) {
          message.info(`${outCount} 项已提交出库申请；${purCount} 项库存不足，需先完成采购入库后再领取`);
        } else {
          message.warning(`${purCount} 项物料库存不足，请先完成采购入库后再领取`);
        }
        loadPreview();
        onSuccess();
      } else {
        message.error(res.message || '智能领取失败');
      }
    } catch (e: any) {
      message.error((e as Error)?.message || '智能领取失败');
    } finally {
      setActionLoading((prev) => ({ ...prev, _all: false }));
    }
  };

  // 状态标签渲染
  const renderStatusTag = (status: string, item: MaterialItem) => {
    if (status === 'completed' || status === 'received') {
      return <Tag color="green">已完成</Tag>;
    }
    if (status === 'partial') {
      return <Tag color="orange">部分到料</Tag>;
    }
    if (status === 'cancelled') {
      return <Tag color="default">已取消</Tag>;
    }
    if (status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING) {
      return <Tag color="blue">待仓库出库</Tag>;
    }
    if (status === 'purchasing') {
      return <Tag color="purple">采购中</Tag>;
    }
    // pending 状态根据库存显示
    if (item.availableStock <= 0) {
      return <Tag color="red">无库存</Tag>;
    }
    if (item.availableStock >= item.requiredQty) {
      return <Tag color="green">库存充足</Tag>;
    }
    return <Tag color="orange">部分有货</Tag>;
  };

  // 物料需求表格列
  const materialColumns = useMemo(
    () => [
      {
        title: '物料编号',
        dataIndex: 'materialCode',
        key: 'materialCode',
        width: 100,
        render: (code: string) => (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-secondary)' }}>{code || '-'}</span>
        ),
      },
      {
        title: '物料名称',
        dataIndex: 'materialName',
        key: 'materialName',
        width: 140,
        render: (text: string, record: MaterialItem) => (
          <div>
            <div style={{ fontWeight: 500 }}>{text || '无'}</div>
            {record.materialType && (
              <Tag
                color={getMaterialTypeColor(record.materialType)}
                style={{ fontSize: 11, marginTop: 2 }}
              >
                {getMaterialTypeName(record.materialType)}
              </Tag>
            )}
          </div>
        ),
      },
      {
        title: '颜色/尺码',
        key: 'colorSize',
        width: 100,
        render: (_: unknown, record: MaterialItem) => (
          <span>{record.color || '无'} / {record.size || '无'}</span>
        ),
      },
      {
        title: '需求数量',
        dataIndex: 'requiredQty',
        key: 'requiredQty',
        width: 90,
        align: 'center' as const,
        render: (qty: number, record: MaterialItem) => (
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{qty || '无'} {record.unit || ''}</span>
        ),
      },
      {
        title: '仓库库存',
        dataIndex: 'availableStock',
        key: 'availableStock',
        width: 90,
        align: 'center' as const,
        render: (stock: number, record: MaterialItem) => {
          if (record.purchaseStatus !== 'pending') {
            return <span style={{ color: 'var(--color-text-tertiary)' }}>{stock}</span>;
          }
          const color = stock <= 0 ? 'var(--color-danger)' : stock < record.requiredQty ? 'var(--color-warning)' : 'var(--color-success)';
          return <span style={{ fontWeight: 600, color }}>{stock}</span>;
        },
      },
      {
        title: '领取数量',
        key: 'pickQty',
        width: 110,
        align: 'center' as const,
        render: (_: unknown, record: MaterialItem) => {
          if (record.purchaseStatus !== 'pending') {
            return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
          }
          // 所有 pending 状态都显示可编辑输入框
          const maxQty = record.availableStock > 0
            ? Math.min(record.availableStock, record.requiredQty)
            : 0;
          return (
            <InputNumber
              min={0}
              max={maxQty}
              value={record.userPickQty}
              onChange={(v) => updatePickQty(record.purchaseId, v)}
              size="small"
              style={{ width: 80 }}
              disabled={record.availableStock <= 0}
              placeholder={record.availableStock <= 0 ? '无库存' : '填写'}
            />
          );
        },
      },
      {
        title: '需采购',
        key: 'purchaseQty',
        width: 80,
        align: 'center' as const,
        render: (_: unknown, record: MaterialItem) => {
          if (record.purchaseStatus !== 'pending') {
            return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
          }
          const pQty = Math.max(0, record.requiredQty - (record.userPickQty || 0));
          if (pQty === 0) {
            return <span style={{ color: 'var(--color-success)', fontWeight: 600 }}> 0</span>;
          }
          return <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{pQty}</span>;
        },
      },
      {
        title: '状态',
        key: 'status',
        width: 85,
        align: 'center' as const,
        render: (_: unknown, record: MaterialItem) => renderStatusTag(record.purchaseStatus, record),
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_: unknown, record: MaterialItem) => {
          // warehouse_pending：等待仓库确认出库中
          if (record.purchaseStatus === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING) {
            return <span style={{ color: 'var(--color-primary)', fontSize: 12 }}>⏳ 待仓库出库确认</span>;
          }
          // 其他非 pending 状态，不显示操作按钮
          if (record.purchaseStatus !== 'pending') {
            return <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>已处理</span>;
          }

          const userPick = record.userPickQty || 0;
          const remainQty = record.requiredQty - userPick;

          // 仓库无库存 → 只显示"采购"按钮
          if (record.availableStock <= 0) {
            return (
              <Button
                type="primary"
                size="small"
                ghost
                icon={<SendOutlined />}
                loading={actionLoading[record.purchaseId]}
                onClick={() => handlePurchaseOnly(record)}
              >
                一键采购
              </Button>
            );
          }

          // 有库存 → 显示"仓库领取"按钮
          return (
            <Space size={4}>
              <Tooltip title={userPick <= 0 ? '请先填写领取数量' : `领取 ${userPick}${remainQty > 0 ? `，差额 ${remainQty} 自动采购` : ''}`}>
                <Button
                  type="primary"
                  size="small"
                  icon={<ShopOutlined />}
                  disabled={userPick <= 0}
                  loading={actionLoading[record.purchaseId]}
                  onClick={() => handleWarehousePick(record)}
                >
                  仓库领取
                </Button>
              </Tooltip>
            </Space>
          );
        },
      },
    ],

    [actionLoading],
  );

  // 出库记录表格列
  const pickingColumns = useMemo(
    () => [
      {
        title: '出库单号',
        dataIndex: 'pickingNo',
        key: 'pickingNo',
        width: 160,
        render: (text: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (status: string) => {
          if (status === 'cancelled') return <Tag color="red">已撤销</Tag>;
          if (status === 'pending') return <Tag color="blue">待仓库确认</Tag>;
          return <Tag color="green">已出库</Tag>;
        },
      },
      {
        title: '领料人',
        dataIndex: 'pickerName',
        key: 'pickerName',
        width: 80,
      },
      {
        title: '领料时间',
        dataIndex: 'pickTime',
        key: 'pickTime',
        width: 140,
        render: (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
      },
      {
        title: '物料明细',
        key: 'items',
        width: 200,
        render: (_: unknown, record: PickingRecord) => {
          const items = record.items || [];
          if (!items.length) return '-';
          return (
            <div>
              {items.map((item, i) => (
                <div key={i} style={{ fontSize: 12 }}>
                  {item.materialName} {item.color ? `(${item.color})` : ''} × {item.quantity}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        title: '备注',
        dataIndex: 'remark',
        key: 'remark',
        width: 120,
        ellipsis: true,
      },
      ...(isSupervisorOrAbove
        ? [
            {
              title: '操作',
              key: 'actions',
              width: 80,
              render: (_: unknown, record: PickingRecord) =>
                record.status !== 'cancelled' ? (
                  <Button type="link" size="small" danger icon={<UndoOutlined />} onClick={() => handleCancelPicking(record)}>
                    撤销
                  </Button>
                ) : (
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>已撤销</span>
                ),
            },
          ]
        : []),
    ],

    [isSupervisorOrAbove],
  );

  // 汇总统计
  const pendingMaterials = materials.filter((m) => m.purchaseStatus === 'pending');
  const noStockCount = pendingMaterials.filter((m) => m.availableStock <= 0).length;
  const partialStockCount = pendingMaterials.filter((m) => m.availableStock > 0 && m.availableStock < m.requiredQty).length;
  const fullStockCount = pendingMaterials.filter((m) => m.availableStock >= m.requiredQty).length;
  const activePickings = pickingRecords.filter((p) => p.status !== 'cancelled');

  const stockStatusText = pendingMaterials.length === 0
    ? '全部已处理'
    : fullStockCount === pendingMaterials.length
      ? '全部充足'
      : noStockCount === pendingMaterials.length
        ? '全部缺货'
        : noStockCount > 0 && partialStockCount > 0
          ? `${noStockCount}项缺货 ${partialStockCount}项部分有货`
          : noStockCount > 0
            ? `${noStockCount}项缺货`
            : `${partialStockCount}项部分有货`;

  const stockStatusColor = pendingMaterials.length === 0 || fullStockCount === pendingMaterials.length
    ? 'var(--color-success)'
    : noStockCount === pendingMaterials.length
      ? 'var(--color-danger)'
      : 'var(--color-warning)';

  return (
    <ResizableModal
      title={
        <Space>
          <ShopOutlined />
          <span>智能领取 - {orderNo}</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.6)}
      footer={[
        <Button key="close" onClick={onCancel}>
          关闭
        </Button>,
        <Button
          key="batchPurchase"
          icon={<SendOutlined />}
          loading={actionLoading._batchPurchase}
          disabled={pendingMaterials.filter((m) => m.availableStock <= 0).length === 0}
          onClick={handleBatchPurchaseAll}
          style={{
            borderColor: 'var(--color-primary)',
            color: 'var(--color-primary)',
          }}
        >
          一键采购全部{noStockCount > 0 ? `（${noStockCount}项）` : ''}
        </Button>,
        <Tooltip
          key="forcePurchase"
          title={
            pendingMaterials.filter((m) => m.availableStock > 0).length === 0
              ? '当前所有待处理物料均无可用库存，无需跳过库存'
              : ''
          }
        >
          <Button
            icon={<ExclamationCircleOutlined />}
            loading={!!actionLoading._forcePurchase}
            disabled={
              pendingMaterials.filter((m) => m.availableStock > 0).length === 0 ||
              !!actionLoading._forcePurchase
            }
            onClick={handleForcePurchaseAll}
            style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
          >
            忽略库存全部外采（{pendingMaterials.length}项）
          </Button>
        </Tooltip>,
        <Tooltip
          key="smartAll"
          title={
            pendingMaterials.length > 0 && noStockCount === pendingMaterials.length
              ? `全部 ${noStockCount} 项物料库存为零，请先点"一键采购全部"完成采购入库后再领取`
              : ''
          }
        >
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={actionLoading._all}
            disabled={
              pendingMaterials.length === 0 ||
              noStockCount === pendingMaterials.length ||
              actionLoading._all
            }
            onClick={handleSmartReceiveAll}
          >
            一键智能领取
          </Button>
        </Tooltip>,
      ]}
    >
      {/* 库存状态智能提示 */}
      <InoutRecommendBanner
        pendingCount={pendingMaterials.length}
        noStockCount={noStockCount}
        partialStockCount={partialStockCount}
        visible={open}
      />

      {/* 汇总卡片 - 使用通用组件 */}
      <PageStatCards
        cards={[
          {
            key: 'total',
            items: [
              { label: '面辅料需求', value: materials.length, unit: '项', color: 'var(--color-text-primary)' },
              { label: '待处理', value: pendingCount, unit: '项', color: pendingCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
            ],
          },
          {
            key: 'stock',
            items: { label: '库存状态', value: stockStatusText, color: stockStatusColor },
            activeColor: stockStatusColor,
          },
          {
            key: 'picking',
            items: { label: '已出库记录', value: activePickings.length, unit: '单', color: 'var(--color-primary)' },
          },
        ] as StatCard[]}
        activeKey="stock"
      />

      {/* 面辅料需求明细表格 */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}> 面辅料需求明细</span>
        {pendingCount === 0 && materials.length > 0 && (
          <Tag color="green" style={{ marginLeft: 8 }}>全部已处理</Tag>
        )}
      </div>

      {materials.length > 0 ? (
        <ResizableTable
          storageKey="smart-receive-materials"
          dataSource={materials}
          columns={materialColumns}
          rowKey="purchaseId"
          size="small"
          pagination={false}
          loading={loading}
          scroll={{ x: 900 }}
          style={{ marginBottom: 20 }}
          rowClassName={(record) => {
            if (record.purchaseStatus !== 'pending') return 'row-done';
            if (record.availableStock <= 0) return 'row-no-stock';
            if (record.availableStock < record.requiredQty) return 'row-partial';
            return '';
          }}
        />
      ) : (
        <Empty
          description={loading ? '加载中...' : '该订单暂无面辅料需求记录'}
          style={{ marginBottom: 20, padding: '20px 0' }}
        />
      )}

      {/* 出库记录 */}
      {pickingRecords.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}> 出库单记录</span>
            {isSupervisorOrAbove && (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>（主管以上可撤销）</span>
            )}
          </div>
          <ResizableTable
            storageKey="smart-receive-picking"
            dataSource={pickingRecords}
            columns={pickingColumns}
            rowKey="pickingId"
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
            rowClassName={(record) => (record.status === 'cancelled' ? 'row-cancelled' : '')}
          />
        </>
      )}

      <style>{`
        .row-no-stock { background: #fff2f0 !important; }
        .row-partial { background: #fffbe6 !important; }
        .row-done { background: #f6f6f6 !important; }
        .row-cancelled { opacity: 0.5; }
        .row-no-stock:hover td, .row-partial:hover td, .row-done:hover td { background: inherit !important; }
      `}</style>
    </ResizableModal>
  );
};

export default SmartReceiveModal;
