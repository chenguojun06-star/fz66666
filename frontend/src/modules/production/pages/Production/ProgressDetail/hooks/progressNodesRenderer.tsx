import React from 'react';
import { Button, Popover } from 'antd';
import { ShareAltOutlined, SendOutlined, AppstoreOutlined } from '@ant-design/icons';
import { buildOrderColorSizeMatrixModel, ColorSizeMatrixPopoverContent } from '@/components/common/OrderColorSizeMatrix';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
import DefectTracePopover from '../components/DefectTracePopover';
import { displayDate } from '@/utils/display';
import { isDirectCuttingOrder, isOrderFrozenByStatus } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { parseProductionOrderLines } from '@/utils/api/production';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import {
  stripWarehousingNode,
  resolveNodesForListOrder,
  getProcessesByNodeFromOrder,
  getOrderStageCompletionTimeFallback,
  defaultNodes,
} from '../utils';
import { NODE_TYPE_MAP, colorWithAlpha, getNodeColor } from './cellRendererHelpers';

export interface ProgressNodesContext {
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardTimesByOrder: Record<string, Record<string, string>>;
  processWorkerNamesByOrder: Record<string, Record<string, string[]>>;
  openNodeDetail: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => void;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void | Promise<void>;
  labelPrintLoading?: boolean;
  isFactoryAccount?: boolean;
  onFactoryShip?: (order: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  onShareOrder?: (order: ProductionOrder) => void;
  openKanban: (order: ProductionOrder) => void;
  getPredictHint: (orderId: string, stageName: string, percent: number) => string;
  triggerPredict: (params: { orderId: string; orderNo?: string; stageName: string; currentProgress: number }) => void;
}

export function createProgressNodesRender(ctx: ProgressNodesContext) {
  const {
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardTimesByOrder,
    processWorkerNamesByOrder,
    openNodeDetail,
    setQuickEditRecord,
    setQuickEditVisible,
    setPrintingRecord,
    handlePrintLabel,
    labelPrintLoading,
    isFactoryAccount,
    onFactoryShip,
    canManageOrderLifecycle,
    handleCloseOrder,
    onShareOrder,
    getPredictHint,
    triggerPredict,
  } = ctx;
  return (_: any, record: ProductionOrder) => {
    const frozen = isOrderFrozenByStatus(record);
    const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';
    const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes))
      .filter(n => !isDirectCuttingOrder(record) || !/采购|物料|备料|辅料|面料/.test(n.name || ''));
    const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
    const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
    const nodeTimeMap = boardTimesByOrder[String(record.id || '')];
    const nodeWorkerNamesMap = processWorkerNamesByOrder[String(record.id || '')];
    const progressTrackMinWidth = Math.max((ns.length + 1) * 92, 420);

    if (!ns || ns.length === 0) {
      return (
        <div style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-base)', padding: '20px 0' }}>
          暂无工序进度数据
        </div>
      );
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        width: '100%',
        alignSelf: 'stretch',
      }}>
        <div style={{
          display: 'flex',
          flex: 1,
          gap: 0,
          alignItems: 'stretch',
          padding: '0 12px',
          minWidth: progressTrackMinWidth,
          overflow: 'visible',
        }}>
        {(() => {
          const orderLines = parseProductionOrderLines(record);
          let matrixItems = orderLines.map(item => ({
            color: String(item.color || '').trim(),
            size: String(item.size || '').trim(),
            quantity: Number(item.quantity || 0),
          }));
          if (matrixItems.length === 1) {
            const single = matrixItems[0];
            const clrArr = single.color.split(/[,，/]+/).map(s => s.trim()).filter(Boolean);
            const sizeArr = single.size.split(/[,，/、\s]+/).map(s => s.trim()).filter(Boolean);
            if (clrArr.length > 1 || sizeArr.length > 1) {
              const clrs = clrArr.length > 0 ? clrArr : [single.color];
              const sizes = sizeArr.length > 0 ? sizeArr : [single.size];
              const qtyEach = Math.round(single.quantity / (clrs.length * sizes.length));
              matrixItems = clrs.flatMap(c => sizes.map(s => ({ color: c, size: s, quantity: qtyEach })));
            }
          }
          const orderMatrix = buildOrderColorSizeMatrixModel({
            items: matrixItems,
            fallbackColor: String(record.color || '').trim(),
            fallbackSize: String(record.size || '').trim(),
            fallbackQuantity: totalQty,
          });
          const matrixPopoverContent = <ColorSizeMatrixPopoverContent model={orderMatrix} />;
          return (
            <div style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 0' }}>
              <Popover
                content={matrixPopoverContent}
                trigger="hover"
                placement="top"
                mouseEnterDelay={0.1}
                overlayStyle={{ maxWidth: 320 }}
                open={orderMatrix.hasData ? undefined : false}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 78,
                  flex: '0 0 auto',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: orderMatrix.hasData ? 'pointer' : 'default',
                }}>
                  <LiquidProgressLottie progress={100} size={68} nodeName="下单"
                    paused={frozen} color1={isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-text-tertiary)' : 'var(--color-success)')} color2={isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : '#95de64')} />
                  <div style={{
                    position: 'absolute',
                    top: 'calc(50% + 39px)',
                    left: 0,
                    right: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}>
                    <div style={{
                      fontSize: 12,
                      color: 'var(--color-text-primary)',
                      fontWeight: 600,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}>
                      下单
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}>
                      {displayDate(record.createTime, 'month-day')}
                    </div>
                  </div>
                </div>
              </Popover>
              <div style={{ flex: 1, alignSelf: 'center', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2, minWidth: 16 }}>
                <div style={{ flex: 1, position: 'relative', height: 1, borderRadius: 999,
                  background: colorWithAlpha(isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : 'var(--color-success)'), 0.28), overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: 999,
                    background: isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-text-tertiary)' : 'var(--color-success)'), transition: 'width 0.25s ease' }} />
                </div>
              </div>
            </div>
          );
        })()}
        {ns.map((node: ProgressNode, index: number) => {
          const nodeName = node.name || '-';
          const nodeType = (node.progressStage && node.progressStage.trim())
            || NODE_TYPE_MAP[nodeName]
            || nodeName.toLowerCase();
          const rawNodeId = String(node.id || '').trim();
          // After upstream fix, node.id stores processCode ('01','FIN','06').
          // Filter UUIDs (contain '-') and default semantic node IDs.
          const processCode = (rawNodeId && !rawNodeId.includes('-')
            && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(rawNodeId))
            ? rawNodeId : '';
          const nodeLabel = processCode ? `${processCode} ${nodeName}` : nodeName;
          const isWarehousingNode = nodeType === 'warehousing'
            || /入库|仓库|成品仓/.test(nodeName);
          const completedQty = isWarehousingNode
            ? (Number((record as any)?.warehousingQualifiedQuantity) || 0)
            : (nodeDoneMap?.[nodeName] || 0);
          const isProcureNode = /采购|物料|备料|辅料|面料/.test(nodeName);
          const rawPercent = isProcureNode
            ? (completedQty > 0 ? 100 : 0)
            : totalQty > 0
              ? Math.min(100, Math.round((completedQty / totalQty) * 100))
              : 0;
          const percent = isCompletedOrClosed ? 100 : rawPercent;
          const remaining = totalQty - completedQty;
          const completionTime = isProcureNode
            ? ((record as any).procurementConfirmedAt
               || (record as any).procurementEndTime
               || nodeTimeMap?.[nodeName]
               || '')
             : (nodeTimeMap?.[nodeName]
               || (percent >= 100
                ? getOrderStageCompletionTimeFallback(record, nodeName, String(node.progressStage || '').trim())
                : (() => {
                    const stageKey = String(node.progressStage || '').trim().toLowerCase();
                    const nameKey = nodeName.toLowerCase();
                    if (stageKey === 'tailprocess' || stageKey === 'tail' || nameKey.includes('尾部') || nameKey.includes('尾工')) {
                      return (record as any).packagingEndTime || (record as any).ironingEndTime || '';
                    }
                    return '';
                  })())
              );
          const startTime = isProcureNode
            ? ((record as any).procurementStartTime || '')
            : (() => {
                const stageKey = String(node.progressStage || '').trim().toLowerCase();
                const nameKey = nodeName.toLowerCase();
                if (stageKey === 'cutting' || nameKey.includes('裁剪')) return (record as any).cuttingStartTime || '';
                if (stageKey === 'sewing' || stageKey === 'carsewing' || nameKey.includes('车缝')) return (record as any).sewingStartTime || (record as any).carSewingStartTime || '';
                if (stageKey === 'secondaryprocess' || stageKey === 'secondary' || nameKey.includes('二次工艺')) return (record as any).secondaryProcessStartTime || '';
                if (stageKey === 'warehousing' || nameKey.includes('入库')) return (record as any).warehousingStartTime || '';
                if (stageKey === 'quality' || nameKey.includes('质检')) return (record as any).qualityStartTime || '';
                if (stageKey === 'tailprocess' || stageKey === 'tail' || nameKey.includes('尾部') || nameKey.includes('尾工')) return (record as any).packagingStartTime || (record as any).ironingStartTime || '';
                return '';
              })();
          const predictHint = getPredictHint(String(record.id || ''), nodeName, percent);
          const workerNames = nodeWorkerNamesMap?.[nodeName] || [];
          const operatorDisplay = workerNames.length > 0 ? workerNames.slice(0, 3).join('、') + (workerNames.length > 3 ? `等${workerNames.length}人` : '') : '';
          const completionTimeDisplay = formatDateTime(completionTime);
          const segmentProgress = Math.min(1, percent / 100);
          const nodePrimaryColor = isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-text-tertiary)' : getNodeColor(record.expectedShipDate || record.plannedEndDate));
          const nodeSecondaryColor = isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : getNodeColor(record.expectedShipDate || record.plannedEndDate, true));

          return (
            <div
              key={node.id || index}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                flex: '1 1 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 78,
                  flex: '0 0 auto',
                  justifyContent: 'center',
                  cursor: frozen ? 'default' : 'pointer',
                  opacity: isCompletedOrClosed ? 0.75 : (frozen ? 0.6 : percent >= 100 ? 0.75 : 1),
                  position: 'relative',
                  zIndex: 'var(--z-local)',
                }}
                onClick={() => {
                  if (frozen) return;
                  const sn = String((record as any)?.styleNo || '').trim();
                  const templateNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : undefined;
                  const byParent = getProcessesByNodeFromOrder(record, templateNodes);
                  const nodeProgressStage = String(node.progressStage || '').trim();
                  const isSubProcessNode = nodeProgressStage && nodeProgressStage !== nodeName
                    && byParent[nodeProgressStage]?.some(c => c.name === nodeName);
                  let processList: { id?: string; processCode?: string; name: string; unitPrice?: number }[];
                  let effectiveNodeType = nodeType;
                  if (isSubProcessNode) {
                    processList = [{
                      name: nodeName,
                      unitPrice: node.unitPrice,
                      processCode: processCode || undefined,
                    }];
                    effectiveNodeType = nodeName;
                  } else {
                    let children = byParent[nodeName];
                    if (!children?.length && nodeProgressStage && nodeProgressStage !== nodeName) {
                      children = byParent[nodeProgressStage];
                    }
                    if (children?.length) {
                      processList = children.map(c => ({
                        name: c.name,
                        unitPrice: c.unitPrice,
                        processCode: c.processCode,
                      }));
                    } else {
                      const stageChildren = ns.filter(n => {
                        const ps = String((n as any).progressStage || '').trim();
                        return ps === nodeName || (nodeProgressStage && ps === nodeProgressStage);
                      });
                      processList = stageChildren.map(n => ({
                        id: String(n.id || '').trim() || undefined,
                        processCode: (() => {
                          const r = String(n.id || '').trim();
                          return (r && !r.includes('-')
                            && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(r))
                            ? r : undefined;
                        })(),
                        name: n.name,
                        unitPrice: n.unitPrice,
                      }));
                    }
                  }
                  openNodeDetail(
                    record,
                    effectiveNodeType,
                    nodeName,
                    { done: completedQty, total: totalQty, percent, remaining },
                    node.unitPrice,
                    processList,
                  );
                }}
                onMouseEnter={() => {
                  if (frozen) return;
                  void triggerPredict({
                    orderId: String(record.id || '').trim(),
                    orderNo: String(record.orderNo || '').trim() || undefined,
                    stageName: nodeName,
                    currentProgress: percent,
                  });
                }}
                title={completionTime
                  ? `${nodeLabel} 完成时间：${completionTime}${predictHint ? `\n预计完成：${predictHint}` : ''}\n点击查看详情`
                  : `${predictHint ? `预计完成：${predictHint}\n` : ''}点击查看 ${nodeLabel} 详情`}
              >
                {(nodeType === 'quality' || nodeType === 'warehousing') ? (
                  <DefectTracePopover
                    orderId={String(record.id || '')}
                    hasDefects={Number(record.unqualifiedQuantity) > 0}
                  >
                    <LiquidProgressLottie
                      progress={percent}
                      size={nodeType === 'quality' ? 78 : 68}
                      nodeName={nodeName}
                      text={isProcureNode ? (completedQty > 0 ? '✓' : '') : `${completedQty}/${totalQty}`}
                      subText={!isProcureNode && totalQty > 0 ? `${percent}%` : undefined}
                      paused={frozen}
                      color1={nodePrimaryColor}
                      color2={nodeSecondaryColor}
                    />
                  </DefectTracePopover>
                ) : (
                  <LiquidProgressLottie
                    progress={percent}
                    size={68}
                    nodeName={nodeName}
                    text={isProcureNode ? (completedQty > 0 ? '✓' : '') : `${completedQty}/${totalQty}`}
                    subText={!isProcureNode && totalQty > 0 ? `${percent}%` : undefined}
                    paused={frozen}
                    color1={nodePrimaryColor}
                    color2={nodeSecondaryColor}
                  />
                )}
                <div style={{
                  position: 'absolute',
                  top: nodeType === 'quality' ? 'calc(50% + 44px)' : 'calc(50% + 39px)',
                  left: 0,
                  right: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--color-text-primary)',
                    fontWeight: 600,
                    lineHeight: 1.2,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {nodeLabel}
                  </div>
                  {(operatorDisplay || completionTimeDisplay) && (
                    <div style={{
                      fontSize: 10,
                      color: 'var(--color-text-tertiary)',
                      lineHeight: 1.3,
                      textAlign: 'center',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {operatorDisplay && <span>{operatorDisplay}</span>}
                      {operatorDisplay && completionTimeDisplay && <span> · </span>}
                      {completionTimeDisplay && <span>{completionTimeDisplay}</span>}
                    </div>
                  )}
                  {(() => {
                    return (
                      <BudgetDaysEditor
                        record={record}
                        nodeName={nodeName}
                        stageStartTime={startTime || undefined}
                        stageEndTime={completionTime || undefined}
                        isCompletedOrClosed={isCompletedOrClosed}
                        isProcureNode={isProcureNode}
                      />
                    );
                  })()}
                </div>
              </div>
              {index < ns.length - 1 ? (
                <div style={{ flex: 1, alignSelf: 'center', display: 'flex', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
                  <div
                    style={{
                      flex: 1,
                      position: 'relative',
                      height: 1,
                      borderRadius: 999,
                      background: colorWithAlpha(nodeSecondaryColor, 0.28),
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${segmentProgress * 100}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: nodePrimaryColor,
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        </div>
        <div className="progress-row-actions">
          <Button icon={<AppstoreOutlined />} onClick={() => ctx.openKanban(record)}>看板</Button>
          <Button onClick={() => { setQuickEditRecord(record); setQuickEditVisible(true); }}>编辑</Button>
          <Button disabled={frozen} onClick={() => setPrintingRecord(record)}>打印</Button>
          <Button disabled={frozen} loading={labelPrintLoading} onClick={() => { void handlePrintLabel(record); }}>标签</Button>
          {isFactoryAccount ? <Button type="primary" disabled={frozen} icon={<SendOutlined />} onClick={() => onFactoryShip?.(record)}>发货</Button> : null}
          {canManageOrderLifecycle ? <Button danger disabled={frozen} onClick={() => handleCloseOrder(record)}>关单</Button> : null}
          <Button icon={<ShareAltOutlined />} onClick={() => onShareOrder?.(record)}>分享</Button>
        </div>
      </div>
    );
  };
}
