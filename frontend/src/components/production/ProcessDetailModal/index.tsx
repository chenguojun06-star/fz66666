import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';
import api from '@/utils/api';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { compareSizeAsc } from '@/utils/api/size';
import type { CuttingBundle, ProcessDetailModalProps } from './types';
import { PROCESS_STAGE_DEFS, classifyNodeStage } from './processStageUtils';

const ProcessDetailModal: React.FC<ProcessDetailModalProps> = ({
  visible,
  onClose,
  record,
  processType,
  procurementStatus,
  processStatus,
  onDataChanged: _onDataChanged,
}) => {
  const navigate = useNavigate();
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [warehousingSkuRows, setWarehousingSkuRows] = useState<Array<{ color: string; size: string; quantity: number }>>([]);

  const [templatePriceMap, setTemplatePriceMap] = useState<Map<string, number>>(new Map());
  const [styleProcessDescriptionMap, setStyleProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const [secondaryProcessDescriptionMap, setSecondaryProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  /**
   * 从模板库 API 返回的完整节点列表（含 progressStage 字段）
   * 作为 workflowNodesByStage 的主数据源，支持任意自定义工序名精确归类
   */
  const [templateNodesList, setTemplateNodesList] = useState<{ name: string; processCode?: string; progressStage?: string; description?: string }[]>([]);

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
        const nl: { name: string; processCode?: string; progressStage?: string; description?: string }[] = [];
        rows.forEach((n: any) => {
          const name = String(n?.name || '').trim();
          if (!name) return;
          const price = Number(n?.unitPrice);
          if (Number.isFinite(price) && price > 0) pm.set(name, price);
          nl.push({
            name,
            processCode: String(n?.id || n?.processCode || name).trim(),
            progressStage: String(n?.progressStage || '').trim(),
            description: String(n?.description || '').trim(),
          });
        });
        setTemplatePriceMap(pm);
        setTemplateNodesList(nl);
      } catch {
        setTemplateNodesList([]);
      }
    })();
  }, [visible, record]);

  useEffect(() => {
    if (!visible || !record?.styleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    const styleId = String(record.styleId).trim();
    if (!styleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    (async () => {
      try {
        const [processRes, secondaryRes] = await Promise.all([
          api.get(`/style/process/list?styleId=${styleId}`),
          api.get(`/style/secondary-process/list?styleId=${styleId}`),
        ]);
        const processRows = Array.isArray((processRes as any)?.data) ? (processRes as any).data : [];
        const secondaryRows = Array.isArray((secondaryRes as any)?.data) ? (secondaryRes as any).data : [];
        const nextProcessMap = new Map<string, string>();
        const nextSecondaryMap = new Map<string, string>();
        processRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextProcessMap.set(name, description);
        });
        secondaryRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextSecondaryMap.set(name, description);
        });
        setStyleProcessDescriptionMap(nextProcessMap);
        setSecondaryProcessDescriptionMap(nextSecondaryMap);
      } catch {
        setStyleProcessDescriptionMap(new Map());
        setSecondaryProcessDescriptionMap(new Map());
      }
    })();
  }, [visible, record?.styleId]);

  // 加载裁剪数据
  useEffect(() => {
    if (visible && record?.id) {
      loadCuttingData();
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

  // 加载入库码数明细（从 /production/scan/sku/query 拉取真实数据）
  useEffect(() => {
    if (!visible || processType !== 'warehousing' || !record?.orderNo) {
      setWarehousingSkuRows([]);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/production/scan/sku/query', {
          params: { type: 'list', orderNo: record.orderNo },
        });
        const rows: any[] = Array.isArray(res) ? (res as any[]) : ((res as any)?.data ?? []);
        setWarehousingSkuRows(
          rows.map((r: any) => ({
            color: String(r.color || '-'),
            size: String(r.size || '-'),
            quantity: Number(r.quantity) || 0,
          })),
        );
      } catch {
        setWarehousingSkuRows([]);
      }
    })();
  }, [visible, processType, record?.orderNo]);



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
             码数明细
          </div>
          <ResizableTable
            storageKey="process-detail-sizes"
            dataSource={warehousingSkuRows.map((sku, index) => ({
              key: index,
              color: sku.color,
              size: sku.size,
              quantity: sku.quantity,
            }))}
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
                <ResizableTable.Summary.Row style={{ background: 'var(--color-bg-container)' }}>
                  <ResizableTable.Summary.Cell index={0} colSpan={2}>
                    <span style={{ fontWeight: 600 }}>合计</span>
                  </ResizableTable.Summary.Cell>
                  <ResizableTable.Summary.Cell index={1} align="right">
                    <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{total} 件</span>
                  </ResizableTable.Summary.Cell>
                </ResizableTable.Summary.Row>
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
      description: item.description || '',
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
            <div>
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
              </div>
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
            const descriptionTitle = stage.key === 'secondaryProcess' ? '工艺描述' : '工序描述';
            const descriptionMap = stage.key === 'secondaryProcess' ? secondaryProcessDescriptionMap : styleProcessDescriptionMap;

            return (
              <div key={stage.key} style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                {/* 进度节点标题 */}
                <div style={{
                  background: '#f3f4f6',
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
                      color: '#374151'
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
                               已完成
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
                          {processStatus.cutting.completed ? ' 已完成' : `进行中 (${processStatus.cutting.completionRate}%)`}
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
                  dataSource={processes.map((p: any, idx: number) => ({
                    ...p,
                    key: idx,
                    description: p.description || descriptionMap.get(String(p.name || '').trim()) || '',
                  }))}
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
                      title: descriptionTitle,
                      dataIndex: 'description',
                      key: 'description',
                      width: 180,
                      ellipsis: true,
                      render: (v: string) => v || '-',
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
                    <ResizableTable.Summary.Row style={{ background: 'var(--color-bg-container)' }}>
                      <ResizableTable.Summary.Cell index={0} colSpan={5} align="right">
                        <span style={{ fontWeight: 600 }}>合计</span>
                      </ResizableTable.Summary.Cell>
                      <ResizableTable.Summary.Cell index={1} align="right">
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>
                          ¥{stageTotal.toFixed(2)}
                        </span>
                      </ResizableTable.Summary.Cell>
                      <ResizableTable.Summary.Cell index={2} align="right">
                        <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                          ¥{(stageTotal * cuttingQty).toFixed(2)}
                        </span>
                      </ResizableTable.Summary.Cell>
                    </ResizableTable.Summary.Row>
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
      {renderProcessDetail()}
    </ResizableModal>
  );
};

export default ProcessDetailModal;
