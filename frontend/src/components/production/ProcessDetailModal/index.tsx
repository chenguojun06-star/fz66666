import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, Table } from 'antd';
import { useNavigate } from 'react-router-dom';
import ResizableModal from '@/components/common/ResizableModal';
import ProcessTrackingTable from '@/components/production/ProcessTrackingTable';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import api from '@/utils/api';
import { getProductionProcessTracking } from '@/utils/api/production';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

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
  scanRecordContent?: React.ReactNode; // 操作历史Tab内容（从父组件传入）
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
  scanRecordContent,
}) => {
  const navigate = useNavigate();
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [processTrackingRecords, setProcessTrackingRecords] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [templatePriceMap, setTemplatePriceMap] = useState<Map<string, number>>(new Map());

  // 加载模板最新单价
  useEffect(() => {
    if (!visible || !record) return;
    const styleNo = String((record as any)?.styleNo || '').trim();
    if (!styleNo) return;
    (async () => {
      try {
        const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
        const r = res as Record<string, unknown>;
        const rows = Array.isArray(r?.data) ? r.data : [];
        const pm = new Map<string, number>();
        rows.forEach((n: any) => {
          const name = String(n?.name || '').trim();
          const price = Number(n?.unitPrice);
          if (name && Number.isFinite(price) && price > 0) {
            pm.set(name, price);
          }
        });
        setTemplatePriceMap(pm);
      } catch {
        // ignore
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
      console.warn('订单ID为空，无法加载工序跟踪数据');
      return;
    }

    console.log('开始加载工序跟踪数据，订单ID:', record.id, '订单号:', record.orderNo);
    setTrackingLoading(true);
    try {
      const response = await getProductionProcessTracking(record.id);
      // API返回的是 {code: 200, data: [...]} 结构，需要提取data字段
      const data = (response as any)?.data || [];
      const records = Array.isArray(data) ? data : [];
      console.log(`工序跟踪数据加载成功，共 ${records.length} 条记录:`, records);
      setProcessTrackingRecords(records);
    } catch (error) {
      console.error('加载工序跟踪数据失败:', error);
      setProcessTrackingRecords([]);
    } finally {
      setTrackingLoading(false);
    }
  };

  // 计算裁剪数量的尺码明细
  const cuttingSizeItems = useMemo(() => {
    if (cuttingBundles.length === 0) return [];

    // 定义标准尺码顺序
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
    const sizeMap: Record<string, number> = {};

    // 聚合相同尺码的数量
    cuttingBundles.forEach((bundle) => {
      const size = (bundle.size || '').toUpperCase().trim();
      if (size) {
        sizeMap[size] = (sizeMap[size] || 0) + (bundle.quantity || 0);
      }
    });

    // 转换为数组并排序
    return Object.entries(sizeMap)
      .filter(([_, qty]) => qty > 0)
      .map(([size, quantity]) => ({ size, quantity }))
      .sort((a, b) => {
        const indexA = sizeOrder.indexOf(a.size);
        const indexB = sizeOrder.indexOf(b.size);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.size.localeCompare(b.size);
      });
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
            <span style={{ color: '#6b7280' }}>订单号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.orderNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>款号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>款名：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleName || '-'}</span>
          </div>
        </div>

        {/* 入库操作信息 */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          fontSize: '13px'
        }}>
          <div>
            <span style={{ color: '#6b7280' }}>入库单号：</span>
            <span style={{ fontWeight: 600, color: '#1890ff' }}>
              {record.warehousingOrderNo || '-'}
            </span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>操作人：</span>
            {record.warehousingOperatorName ? (
              <a
                style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 600 }}
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
            <span style={{ color: '#6b7280' }}>开始时间：</span>
            <span style={{ fontWeight: 500, color: '#111827' }}>
              {formatDateTime(record.warehousingStartTime)}
            </span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>完成时间：</span>
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
            { label: '合格入库', value: qualifiedQty, color: '#059669', percent: qualifiedRate },
            { label: '次品数', value: unqualifiedQty, color: '#dc2626' },
            { label: '返修数', value: repairQty, color: '#f59e0b' },
            { label: '库存', value: stockQty, color: '#3b82f6' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>
                {item.label}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: item.color }}>
                {item.value}
              </span>
              {item.percent !== undefined && (
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                  占比 {item.percent}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* 码数明细表格 */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#111827' }}>
            📏 码数明细
          </div>
          <Table
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
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <span style={{ fontWeight: 600 }}>合计</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <span style={{ fontWeight: 700, color: '#059669' }}>{total} 件</span>
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
    // 解析工序工作流
    let workflowNodes: any[] = [];
    try {
      if (record.progressWorkflowJson) {
        const workflow = typeof record.progressWorkflowJson === 'string'
          ? JSON.parse(record.progressWorkflowJson)
          : record.progressWorkflowJson;

        const nodes = workflow?.nodes || [];
        if (nodes.length > 0 && nodes[0]?.name) {
          workflowNodes = nodes.map((item: any, idx: number) => {
            const name = String(item.name || item.processName || '').trim();
            const storedPrice = Number(item.unitPrice) || 0;
            return {
              id: item.id || `proc_${idx}`,
              name,
              progressStage: item.progressStage || '',
              machineType: item.machineType || '',
              standardTime: item.standardTime || 0,
              unitPrice: templatePriceMap.get(name) ?? storedPrice,
              sortOrder: item.sortOrder ?? idx,
            };
          });
        } else {
          // 旧格式处理
          const processesByNode = workflow?.processesByNode || {};
          const allProcesses: any[] = [];
          let sortIdx = 0;

          for (const node of nodes) {
            const nodeId = node?.id || '';
            const nodeProcesses = processesByNode[nodeId] || [];
            for (const p of nodeProcesses) {
              const pName = String(p.name || p.processName || '').trim();
              const storedP = Number(p.unitPrice) || 0;
              allProcesses.push({
                id: p.id || `proc_${sortIdx}`,
                name: pName,
                progressStage: p.progressStage || node?.progressStage || node?.name || '',
                machineType: p.machineType || '',
                standardTime: p.standardTime || 0,
                unitPrice: templatePriceMap.get(pName) ?? storedP,
                sortOrder: sortIdx,
              });
              sortIdx++;
            }
          }
          workflowNodes = allProcesses;
        }
      }

      // 从 progressNodeUnitPrices 读取
      if (workflowNodes.length === 0 && Array.isArray(record.progressNodeUnitPrices) && record.progressNodeUnitPrices.length > 0) {
        workflowNodes = record.progressNodeUnitPrices.map((item: any, idx: number) => {
          const itemName = String(item.name || item.processName || '').trim();
          const storedItemPrice = Number(item.unitPrice) || Number(item.price) || 0;
          return {
            id: item.id || item.processId || `node_${idx}`,
            name: itemName,
            progressStage: item.progressStage || '',
            machineType: item.machineType || '',
            standardTime: item.standardTime || 0,
            unitPrice: templatePriceMap.get(itemName) ?? storedItemPrice,
            sortOrder: item.sortOrder ?? idx,
          };
        });
      }
    } catch (e) {
      console.error('解析工艺模板失败:', e);
    }

    // 主进度节点定义
    const mainStages = [
      { key: 'procurement', name: '采购', keywords: ['采购', '物料', '备料'] },
      { key: 'cutting', name: '裁剪', keywords: ['裁剪', '裁床', '开裁'] },
      { key: 'carSewing', name: '车缝', keywords: ['车缝', '缝制', '缝纫', '车工', '生产'] },
      { key: 'secondaryProcess', name: '二次工艺', keywords: ['二次工艺', '二次', '工艺'] },
      { key: 'tailProcess', name: '尾部', keywords: ['尾部', '整烫', '包装', '质检', '后整', '剪线'] },
      { key: 'warehousing', name: '入库', keywords: ['入库', '仓库'] },
    ];

    // 匹配工序到主进度节点
    const matchStage = (progressStage: string, processName: string): string => {
      const text = `${progressStage || ''} ${processName || ''}`;
      for (const stage of mainStages) {
        if (stage.keywords.some(kw => text.includes(kw))) {
          return stage.key;
        }
      }
      return 'tailProcess';
    };

    // 按主进度节点分组
    const groupedProcesses: Record<string, any[]> = {};
    mainStages.forEach(s => { groupedProcesses[s.key] = []; });

    workflowNodes.forEach((node: any) => {
      const stageKey = matchStage(node.progressStage || '', node.name || '');
      if (!groupedProcesses[stageKey]) {
        groupedProcesses[stageKey] = [];
      }
      groupedProcesses[stageKey].push(node);
    });

    // 显示哪些阶段
    const stagesToShow = processType === 'all'
      ? mainStages.filter(s => groupedProcesses[s.key].length > 0)
      : mainStages.filter(s => s.key === processType && groupedProcesses[s.key].length > 0);

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
            <span style={{ color: '#6b7280' }}>订单号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.orderNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>款号：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleNo || '-'}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>款名：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.styleName || '-'}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>总工价：</span>
            <span style={{ fontWeight: 700, color: '#dc2626' }}>¥{totalPrice.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>订单数量：</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{record.orderQuantity || 0} 件</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>裁剪数量：</span>
            <span style={{ fontWeight: 600, color: '#059669' }}>{cuttingQty} 件</span>
          </div>
          {operatorInfo && (
            <>
              <div>
                <span style={{ color: '#6b7280' }}>{operatorInfo.processName}操作人：</span>
                {operatorInfo.operatorName ? (
                  <a
                    style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 600 }}
                    onClick={() => {
                      if (record?.orderNo) {
                        navigate(`/finance/payroll-operator-summary?orderNo=${record.orderNo}&processName=${operatorInfo.processName}`);
                      }
                    }}
                  >
                    {operatorInfo.operatorName}
                  </a>
                ) : (
                  <span style={{ color: '#9ca3af' }}>-</span>
                )}
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>{operatorInfo.processName}完成：</span>
                <span style={{ fontWeight: 500, color: '#111827' }}>
                  {operatorInfo.endTime ? (
                    new Date(operatorInfo.endTime).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  ) : (
                    <span style={{ color: '#9ca3af' }}>-</span>
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
            background: '#f6ffed',
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
                color: '#52c41a',
                fontWeight: 600,
                padding: '2px 8px',
                background: '#fff',
                borderRadius: 4,
                border: '1px solid #b7eb8f'
              }}>
                {item.size}: {item.quantity}
              </span>
            ))}
            <span style={{ color: '#52c41a', fontWeight: 700, marginLeft: 4 }}>
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
                border: '1px solid #e5e7eb',
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
                  borderBottom: '1px solid #e5e7eb'
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
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
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
                              color: '#059669',
                              background: '#d1fae5',
                              padding: '2px 8px',
                              borderRadius: '4px'
                            }}>
                              ✓ 已完成
                            </span>
                            {procurementStatus.operatorName && (
                              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                操作人: <a
                                  style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 600 }}
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
                              <span style={{ fontSize: '12px', color: '#6b7280' }}>
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
                            color: '#f59e0b',
                            background: '#fef3c7',
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
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          完成: <span style={{ fontWeight: 600, color: '#059669' }}>{processStatus.cutting.completedQuantity} 件</span>
                        </span>
                        {!processStatus.cutting.completed && (
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>
                            剩余: <span style={{ fontWeight: 600, color: '#f59e0b' }}>{processStatus.cutting.remainingQuantity} 件</span>
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
                <Table
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
                      render: (v: string) => <span style={{ fontSize: '12px', color: '#6b7280' }}>{v}</span>,
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
                          <span style={{ fontWeight: 700, color: '#059669' }}>
                            ¥{total.toFixed(2)}
                          </span>
                        );
                      },
                    },
                  ]}
                  pagination={false}
                  size="small"
                  summary={() => (
                    <Table.Summary.Row style={{ background: '#fafafa' }}>
                      <Table.Summary.Cell index={0} colSpan={4} align="right">
                        <span style={{ fontWeight: 600 }}>合计</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>
                          ¥{stageTotal.toFixed(2)}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <span style={{ fontWeight: 700, color: '#059669' }}>
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
      initialHeight={580}
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
          ...(scanRecordContent ? [{
            key: 'scanRecords',
            label: '操作记录',
            children: scanRecordContent,
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
