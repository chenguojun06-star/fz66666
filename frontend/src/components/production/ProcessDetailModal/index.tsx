import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, Table } from 'antd';
import { useNavigate } from 'react-router-dom';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import ProcessTrackingTable from '@/components/production/ProcessTrackingTable';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import api from '@/utils/api';
import { getProductionProcessTracking } from '@/utils/api/production';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { stageAliasMap, carSewingKeywords, tailProcessKeywords } from '@/utils/productionStage';
import { compareSizeAsc } from '@/utils/api/size';

/**
 * 模块级工序阶段定义（关键词统一从 productionStage.ts 导入，禁止在此处内联数组）
 * 修改关键词请直接修改 frontend/src/utils/productionStage.ts
 */
const PROCESS_STAGE_DEFS: { key: string; name: string; keywords: string[] }[] = [
  { key: 'procurement',      name: '采购',     keywords: stageAliasMap.procurement },
  { key: 'cutting',          name: '裁剪',     keywords: stageAliasMap.cutting },
  { key: 'carSewing',        name: '车缝',     keywords: carSewingKeywords },
  { key: 'secondaryProcess', name: '二次工艺', keywords: stageAliasMap.secondaryProcess },
  { key: 'tailProcess',      name: '尾部',     keywords: tailProcessKeywords },
  { key: 'warehousing',      name: '入库',     keywords: stageAliasMap.warehousing },
];

/** 将模板节点分类到对应阶段（全局唯一实现，供 workflowNodesByStage 和 renderNormalProcessDetail 共用）*/
const classifyNodeStage = (progressStage: string, nodeName: string): string => {
  const text = `${progressStage || ''} ${nodeName || ''}`;
  for (const s of PROCESS_STAGE_DEFS) {
    if (s.keywords.some(kw => text.includes(kw))) return s.key;
  }
  return 'tailProcess';
};

interface CuttingBundle {
  id: string;
  size: string;
  quantity: number;
}

interface ProcessDetailModalProps {
  visible: boolean;
  onClose: () => void;
  record: ProductionOrder | null;
  processType: string;
  procurementStatus: any;
  processStatus: any;
  activeTab: string;
  onTabChange: (key: string) => void;
  delegationContent?: React.ReactNode; // 工序委派Tab内容（从父组件传入）
  onDataChanged?: () => void;
}

const ProcessDetailModal: React.FC<ProcessDetailModalProps> = ({
  visible,
  onClose,
  record,
  processType,
  procurementStatus,
  processStatus,
  activeTab,
  onTabChange,
  delegationContent,
  onDataChanged,
}) => {
  const navigate = useNavigate();
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [processTrackingRecords, setProcessTrackingRecords] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [templatePriceMap, setTemplatePriceMap] = useState<Map<string, number>>(new Map());
  /**
   * 从模板库 API 返回的完整节点列表（含 progressStage 字段）
   * 作为 workflowNodesByStage 的主数据源，支持任意自定义工序名精确归类
   */
  const [templateNodesList, setTemplateNodesList] = useState<{ name: string; processCode?: string; progressStage?: string }[]>([]);

  /**
   * 将模板节点按阶段分组，传给 ProcessTrackingTable.processList
   * 数据来源：templateNodesList（弹窗打开时从 progressNodeUnitPrices API 加载，含 progressStage）
   * 无需解析 record.progressWorkflowJson，后者仅在 list API 响应中且缺少 progressStage 字段
   */
  const workflowNodesByStage = useMemo<Record<string, { name: string; processCode?: string }[]>>(() => {
    const result: Record<string, { name: string; processCode?: string }[]> = {};
    PROCESS_STAGE_DEFS.forEach(s => { result[s.key] = []; });
    templateNodesList.forEach((n) => {
      const stage = classifyNodeStage(n.progressStage || '', n.name);
      if (n.name) result[stage].push({ name: n.name, processCode: n.processCode || n.name });
    });
    return result;
  }, [templateNodesList]);

  // 加载模板最新单价 & 节点列表（弹窗每次打开时触发）
  useEffect(() => {
    if (!visible || !record) return;
    const styleNo = String((record as any)?.styleNo || '').trim();
    if (!styleNo) {
      setTemplateNodesList([]);
      return;
    }
    (async () => {
      try {
        const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
        const r = res as any;
        const rows: any[] = Array.isArray(r?.data) ? r.data : [];
        // 存价格 Map
        const pm = new Map<string, number>();
        // 存完整节点列表（含 progressStage）
        const nl: { name: string; processCode?: string; progressStage?: string }[] = [];
        rows.forEach((n: any) => {
          const name = String(n?.name || '').trim();
          if (!name) return;
          const price = Number(n?.unitPrice);
          if (Number.isFinite(price) && price > 0) pm.set(name, price);
          // id 字段即 processCode（见后端 resolveProgressNodeUnitPrices: item.put("id", processCode)）
          nl.push({ name, processCode: String(n?.id || n?.processCode || name).trim(), progressStage: String(n?.progressStage || '').trim() });
        });
        setTemplatePriceMap(pm);
        setTemplateNodesList(nl);
      } catch {
        setTemplateNodesList([]);
      }
    })();
  }, [visible, record]);

  // 加载裁剪数据
  useEffect(() => {
    if (visible && record?.id) {
      loadCuttingData();
      loadProcessTrackingData();
    }
  }, [visible, record?.id]);

  const loadCuttingData = async () => {
    if (!record?.id) return;

    try {
      const res = await api.get('/production/cutting/list', {
        params: {
          productionOrderId: record.id,
          productionOrderNo: record.orderNo,
          page: 1,
          pageSize: 999,
        },
      });

      let records = [];
      if (res.code === 200 && res.data?.records) {
        records = res.data.records;
      } else if (Array.isArray(res.data)) {
        records = res.data;
      } else if (Array.isArray(res)) {
        records = res;
      }

      const orderNo = record.orderNo || '';
      const filtered = orderNo
        ? records.filter((b: any) => {
            const qrCode = String(b.qrCode || b.bundleNo || '').trim();
            return qrCode.startsWith(orderNo);
          })
        : records;

      setCuttingBundles(filtered || []);
    } catch (error) {
      console.error('加载裁剪数据失败:', error);
      setCuttingBundles([]);
    }
  };

  // 加载工序跟踪数据
  const loadProcessTrackingData = async () => {
    if (!record?.id) {
      return;
    }

    setTrackingLoading(true);
    try {
      const response = await getProductionProcessTracking(record.id);
      // API返回的是 {code: 200, data: [...]} 结构，需要提取data字段
      const data = (response as any)?.data || [];
      const records = Array.isArray(data) ? data : [];
      setProcessTrackingRecords(records);
    } catch (error) {
      console.error('加载工序跟踪数据失败:', error);
      setProcessTrackingRecords([]);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleUndoSuccess = async () => {
    await loadProcessTrackingData();
    onDataChanged?.();
  };

  // 计算裁剪数量的尺码明细
  const cuttingSizeItems = useMemo(() => {
    if (cuttingBundles.length === 0) return [];

    const sizeMap: Record<string, number> = {};

    // 聚合相同尺码的数量
    cuttingBundles.forEach((bundle) => {
      const size = (bundle.size || '').toUpperCase().trim();
      if (size) {
        sizeMap[size] = (sizeMap[size] || 0) + (bundle.quantity || 0);
      }
    });

    // 转换为数组并排序（统一使用 size.ts 的算法排序，禁止内联尺码数组）
    return Object.entries(sizeMap)
      .filter(([_, qty]) => qty > 0)
      .map(([size, quantity]) => ({ size, quantity }))
      .sort((a, b) => compareSizeAsc(a.size, b.size));
  }, [cuttingBundles]);

  if (!record) return null;

  // 弹窗标题
  const titles: Record<string, string> = {
    all: '全部工序明细',
    procurement: '采购工序明细',
    cutting: '裁剪工序明细',
    secondaryProcess: '二次工艺明细',
    carSewing: '车缝工序明细',
    tailProcess: '尾部工序明细',
    warehousing: '入库详情',
  };

  const title = titles[processType] || '工序明细';

  // 渲染工序详情内容
  const renderProcessDetail = () => {
    // 入库类型特殊处理
    if (processType === 'warehousing') {
      return renderWarehousingDetail();
    }

    // 普通工序类型
    return renderNormalProcessDetail();
  };

  // 渲染入库详情
  const renderWarehousingDetail = () => {
    const orderQty = record.orderQuantity || 0;
    const cuttingQty = record.cuttingQuantity || orderQty;
    const qualifiedQty = record.warehousingQualifiedQuantity || 0;
    const unqualifiedQty = record.unqualifiedQuantity || 0;
    const repairQty = record.repairQuantity || 0;
    const stockQty = record.inStockQuantity || 0;
    const qualifiedRate = cuttingQty > 0 ? Math.round((qualifiedQty / cuttingQty) * 100) : 0;

    return (
      <div>
        {/* 订单基本信息 */}
        <div style={{
          background: '#f8f9fa',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          fontSize: '13px'
        }}>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>订单号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.orderNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>款号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>款名：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleName || '-'}</span>
          </div>
        </div>

        {/* 入库操作信息 */}
        <div style={{
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          fontSize: '13px'
        }}>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>入库单号：</span>
            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
              {(record.warehousingOrderNo as any) || '-'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>操作人：</span>
            {record.warehousingOperatorName ? (
              <a
                style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}
                onClick={() => {
                  if (record?.orderNo) {
                    navigate(`/finance/payroll-operator-summary?orderNo=${record.orderNo}&processName=入库`);
                  }
                }}
              >
                {record.warehousingOperatorName}
              </a>
            ) : (
              <span style={{ fontWeight: 600, color: '#111827' }}>-</span>
            )}
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>开始时间：</span>
            <span style={{ fontWeight: 500, color: '#111827' }}>
              {formatDateTime(record.warehousingStartTime)}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>完成时间：</span>
            <span style={{ fontWeight: 500, color: '#111827' }}>
              {formatDateTime(record.warehousingEndTime)}
            </span>
          </div>
        </div>

        {/* 入库统计卡片 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '8px'
        }}>
          {[
            { label: '合格入库', value: qualifiedQty, color: 'var(--color-success)', percent: qualifiedRate },
            { label: '次品数', value: unqualifiedQty, color: '#dc2626' },
            { label: '返修数', value: repairQty, color: 'var(--color-warning)' },
            { label: '库存', value: stockQty, color: 'var(--color-primary)' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: 'var(--color-bg-base)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                {item.label}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: item.color }}>
                {item.value as any}
              </span>
              {item.percent !== undefined && (
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  占比 {item.percent}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* 码数明细表格 */}
        <div style={{
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#111827' }}>
            📏 码数明细
          </div>
          <ResizableTable
            storageKey="process-detail-sizes"
            dataSource={(() => {
              const skuData = record.skuRows || [];
              if (Array.isArray(skuData) && skuData.length > 0) {
                return skuData.map((sku: any, index: number) => ({
                  key: index,
                  color: sku.color || '-',
                  size: sku.size || '-',
                  quantity: sku.quantity || 0,
                }));
              }
              return [];
            })()}
            columns={[
              { title: '颜色', dataIndex: 'color', key: 'color', width: 100 },
              { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
              {
                title: '数量',
                dataIndex: 'quantity',
                key: 'quantity',
                width: 80,
                align: 'right' as const,
                render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
              },
            ]}
            pagination={false}
            size="small"
            locale={{ emptyText: '暂无码数明细' }}
            summary={(pageData) => {
              if (pageData.length === 0) return null;
              const total = pageData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
              return (
                <Table.Summary.Row style={{ background: 'var(--color-bg-container)' }}>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <span style={{ fontWeight: 600 }}>合计</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{total} 件</span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        </div>
      </div>
    );
  };

  // 渲染普通工序详情（采购、裁剪、车缝等）
  const renderNormalProcessDetail = () => {
    // 直接使用 templateNodesList（弹窗打开时已从 progressNodeUnitPrices API 加载，含 progressStage）
    // 用 templatePriceMap 覆盖最新单价
    const workflowNodes = templateNodesList.map((item, idx) => ({
      id: item.processCode || item.name,
      name: item.name,
      progressStage: item.progressStage || '',
      machineType: '',
      standardTime: 0,
      unitPrice: templatePriceMap.get(item.name) ?? 0,
      sortOrder: idx,
    }));

    // 按主进度节点分组（复用模块级 PROCESS_STAGE_DEFS + classifyNodeStage，无需重复定义）
    const groupedProcesses: Record<string, any[]> = {};
    PROCESS_STAGE_DEFS.forEach(s => { groupedProcesses[s.key] = []; });

    workflowNodes.forEach((node: any) => {
      const stageKey = classifyNodeStage(node.progressStage || '', node.name || '');
      if (!groupedProcesses[stageKey]) {
        groupedProcesses[stageKey] = [];
      }
      groupedProcesses[stageKey].push(node);
    });

    // 显示哪些阶段（复用模块级 PROCESS_STAGE_DEFS）
    const stagesToShow = processType === 'all'
      ? PROCESS_STAGE_DEFS.filter(s => (groupedProcesses[s.key] || []).length > 0)
      : PROCESS_STAGE_DEFS.filter(s => s.key === processType && (groupedProcesses[s.key] || []).length > 0);

    // 计算总工价
    const totalPrice = workflowNodes.reduce((sum: number, node: any) => sum + (Number(node.unitPrice) || 0), 0);
    const cuttingQty = record.cuttingQuantity || record.orderQuantity || 0;

    // 获取操作人信息
    const getOperatorInfo = () => {
      switch (processType) {
        case 'cutting':
          return {
            operatorName: record.cuttingOperatorName,
            endTime: record.cuttingEndTime,
            processName: '裁剪'
          };
        case 'carSewing':
          return {
            operatorName: record.carSewingOperatorName,
            endTime: record.carSewingEndTime,
            processName: '车缝'
          };
        case 'tailProcess':
          return {
            operatorName: record.tailProcessOperatorName,
            endTime: record.tailProcessEndTime,
            processName: '尾部'
          };
        default:
          return null;
      }
    };

    const operatorInfo = getOperatorInfo();

    return (
      <div>
        {/* 订单基本信息 */}
        <div style={{
          background: '#f8f9fa',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          fontSize: '12px'
        }}>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>订单号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.orderNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>款号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>款名：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleName || '-'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>总工价：</span>
            <span style={{ fontWeight: 700, color: '#dc2626' }}>¥{totalPrice.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>订单数量：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.orderQuantity || 0} 件</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>裁剪数量：</span>
            <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{cuttingQty} 件</span>
          </div>
          {operatorInfo && (
            <>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>{operatorInfo.processName}操作人：</span>
                {operatorInfo.operatorName ? (
                  <a
                    style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}
                    onClick={() => {
                      if (record?.orderNo) {
                        navigate(`/finance/payroll-operator-summary?orderNo=${record.orderNo}&processName=${operatorInfo.processName}`);
                      }
                    }}
                  >
                    {operatorInfo.operatorName as any}
                  </a>
                ) : (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>{operatorInfo.processName}完成：</span>
                <span style={{ fontWeight: 500, color: '#111827' }}>
                  {operatorInfo.endTime ? (
                    new Date(operatorInfo.endTime as string).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 裁剪数量尺码明细 */}
        {cuttingSizeItems.length > 0 && (
          <div style={{
            padding: '8px 12px',
            border: '1px solid #b7eb8f',
            background: 'rgba(34, 197, 94, 0.15)',
            borderRadius: 12,
            marginBottom: 12,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap'
          }}>
            <span style={{ color: '#595959', fontWeight: 600 }}>裁剪数明细：</span>
            {cuttingSizeItems.map((item) => (
              <span key={item.size} style={{
                color: 'var(--color-success)',
                fontWeight: 600,
                padding: '2px 8px',
                background: 'var(--color-bg-base)',
                borderRadius: 4,
                border: '1px solid #b7eb8f'
              }}>
                {item.size}: {item.quantity}
              </span>
            ))}
            <span style={{ color: 'var(--color-success)', fontWeight: 700, marginLeft: 4 }}>
              总计: {cuttingSizeItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
        )}

        {/* 按进度节点分组显示工序 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {stagesToShow.map((stage) => {
            const processes = groupedProcesses[stage.key] || [];
            if (processes.length === 0) return null;

            const stageTotal = processes.reduce((sum: number, p: any) => sum + (Number(p.unitPrice) || 0), 0);

            return (
              <div key={stage.key} style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                {/* 进度节点标题 */}
                <div style={{
                  background: stage.key === 'procurement' ? '#dbeafe' :
                             stage.key === 'cutting' ? '#fef3c7' :
                             stage.key === 'carSewing' ? '#d1fae5' :
                             stage.key === 'secondaryProcess' ? '#ede9fe' :
                             stage.key === 'tailProcess' ? '#fce7f3' :
                             '#f3f4f6',
                  padding: '10px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontWeight: 700,
                      fontSize: '15px',
                      color: stage.key === 'procurement' ? '#1e40af' :
                             stage.key === 'cutting' ? '#92400e' :
                             stage.key === 'carSewing' ? '#065f46' :
                             stage.key === 'secondaryProcess' ? '#5b21b6' :
                             stage.key === 'tailProcess' ? '#9d174d' :
                             '#374151'
                    }}>
                      {stage.name}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      ({processes.length}个工序)
                    </span>

                    {/* 采购节点显示完成状态 */}
                    {stage.key === 'procurement' && procurementStatus && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
                        {procurementStatus.completed ? (
                          <>
                            <span style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--color-success)',
                              background: 'rgba(34, 197, 94, 0.15)',
                              padding: '2px 8px',
                              borderRadius: '4px'
                            }}>
                              ✓ 已完成
                            </span>
                            {procurementStatus.operatorName && (
                              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                操作人: <a
                                  style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}
                                  onClick={() => {
                                    if (record?.orderNo) {
                                      navigate(`/finance/payroll-operator-summary?orderNo=${record.orderNo}&processName=采购`);
                                    }
                                  }}
                                >
                                  {procurementStatus.operatorName}
                                </a>
                              </span>
                            )}
                            {procurementStatus.completedTime && (
                              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                完成时间: <span style={{ fontWeight: 600, color: '#374151' }}>
                                  {new Date(procurementStatus.completedTime).toLocaleString('zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--color-warning)',
                            background: 'rgba(234, 179, 8, 0.15)',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            进行中 ({procurementStatus.completionRate}%)
                          </span>
                        )}
                      </div>
                    )}

                    {/* 裁剪节点显示完成数量 */}
                    {stage.key === 'cutting' && processStatus?.cutting && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: processStatus.cutting.completed ? '#059669' : '#f59e0b',
                          background: processStatus.cutting.completed ? '#d1fae5' : '#fef3c7',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {processStatus.cutting.completed ? '✓ 已完成' : `进行中 (${processStatus.cutting.completionRate}%)`}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          完成: <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{processStatus.cutting.completedQuantity} 件</span>
                        </span>
                        {!processStatus.cutting.completed && (
                          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            剩余: <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{processStatus.cutting.remainingQuantity} 件</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
                    小计: ¥{stageTotal.toFixed(2)}
                  </span>
                </div>

                {/* 工序列表表格 */}
                <ResizableTable
                  storageKey="process-detail-list"
                  dataSource={processes.map((p: any, idx: number) => ({ ...p, key: idx }))}
                  columns={[
                    {
                      title: '序号',
                      dataIndex: 'sortOrder',
                      key: 'sortOrder',
                      width: 60,
                      render: (_: any, __: any, index: number) => index + 1,
                    },
                    {
                      title: '工序编号',
                      dataIndex: 'id',
                      key: 'id',
                      width: 100,
                      render: (v: string) => <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{v}</span>,
                    },
                    {
                      title: '工序名称',
                      dataIndex: 'name',
                      key: 'name',
                      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
                    },
                    {
                      title: '机器类型',
                      dataIndex: 'machineType',
                      key: 'machineType',
                      width: 120,
                      render: (v: string) => v || '-',
                    },
                    {
                      title: '工序单价',
                      dataIndex: 'unitPrice',
                      key: 'unitPrice',
                      width: 100,
                      align: 'right' as const,
                      render: (v: number) => (
                        <span style={{ fontWeight: 600, color: '#dc2626' }}>
                          ¥{(v || 0).toFixed(2)}
                        </span>
                      ),
                    },
                    {
                      title: '工序工资',
                      key: 'totalWage',
                      width: 120,
                      align: 'right' as const,
                      render: (_: any, record: any) => {
                        const total = (record.unitPrice || 0) * cuttingQty;
                        return (
                          <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                            ¥{total.toFixed(2)}
                          </span>
                        );
                      },
                    },
                  ]}
                  pagination={false}
                  size="small"
                  summary={() => (
                    <Table.Summary.Row style={{ background: 'var(--color-bg-container)' }}>
                      <Table.Summary.Cell index={0} colSpan={4} align="right">
                        <span style={{ fontWeight: 600 }}>合计</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>
                          ¥{stageTotal.toFixed(2)}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                          ¥{(stageTotal * cuttingQty).toFixed(2)}
                        </span>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <ResizableModal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      className="process-detail-modal"
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
    >
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          {
            key: 'process',
            label: '工序详情',
            children: renderProcessDetail(),
          },
          ...(delegationContent ? [{
            key: 'delegation',
            label: '工序委派',
            children: delegationContent,
          }] : []),
          {
            key: 'processTracking',
            label: '工序跟踪',
            children: (
              <div style={{ padding: '8px 0' }}>
                <ProcessTrackingTable
                  records={Array.isArray(processTrackingRecords) ? processTrackingRecords : []}
                  loading={trackingLoading}
                  processType={processType}
                  nodeName={{ procurement: '采购', cutting: '裁剪', carSewing: '车缝', secondaryProcess: '二次工艺', tailProcess: '尾部', warehousing: '入库' }[processType] || processType}
                  orderStatus={record?.status}
                  onUndoSuccess={handleUndoSuccess}
                  processList={workflowNodesByStage[processType] && workflowNodesByStage[processType].length > 0
                    ? workflowNodesByStage[processType]
                    : undefined}
                />
              </div>
            ),
          },
        ]}
      />
    </ResizableModal>
  );
};

export default ProcessDetailModal;
