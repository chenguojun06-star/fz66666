import React, { useEffect } from 'react';
import dayjs from 'dayjs';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
import DefectTracePopover from '../components/DefectTracePopover';
import NodeScanTimelinePopover from '../components/NodeScanTimelinePopover';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { NodeCalculationResult } from './nodeCalculations';
import { colorWithAlpha } from './cellRendererHelpers';
import { loadStageConfigBudget, getConfigBudgetDays } from '@/utils/progressTimeBudget';

interface ProgressNodeItemProps {
  node: ProgressNode;
  index: number;
  total: number;
  record: ProductionOrder;
  nodeData: NodeCalculationResult;
  frozen: boolean;
  isCompletedOrClosed: boolean;
  predictHint: string;
  onClick: () => void;
  onMouseEnter: () => void;
}

export function ProgressNodeItem({
  node,
  index,
  total,
  record,
  nodeData,
  frozen,
  isCompletedOrClosed,
  predictHint,
  onClick,
  onMouseEnter,
}: ProgressNodeItemProps) {
  // D-387：环节配置预警 —— 首次挂载静默加载该款生效环节配置预算天数（loadStageConfigBudget 自带已加载 guard）
  useEffect(() => {
    loadStageConfigBudget((record as any).styleId as string | null | undefined);
  }, [record]);
  const {
    nodeLabel,
    nodeType,
    isProcureNode,
    completedQty,
    totalQty,
    percent,
    segmentProgress,
    nodePrimaryColor,
    nodeSecondaryColor,
    operatorDisplay,
    completionTimeDisplay,
    completionTime,
    startTime,
    nodeName,
    durationDisplay,
    durationOverThreshold,
  } = {
    ...nodeData,
    totalQty: Number(record.cuttingQuantity || record.orderQuantity) || 0,
  };

  const showConnector = index < total - 1;
  const lottieSize = nodeType === 'quality' ? 78 : 68;
  const labelTopOffset = nodeType === 'quality' ? 'calc(50% + 44px)' : 'calc(50% + 39px)';

  // D-892：开始时间 = 订单环节字段或首次扫码兜底（calcNodeData 已合并进 startTime）
  const startDisplay = startTime ? dayjs(startTime).format('MM-DD HH:mm') : '';
  // D-892：未完成节点显示「已耗时」，超过环节配置预算天数标红
  const elapsedInfo = (() => {
    if (completionTime || !startTime) return null;
    const start = dayjs(startTime).valueOf();
    if (!Number.isFinite(start)) return null;
    const diffMs = Date.now() - start;
    if (diffMs < 0) return null;
    const diffHours = Math.floor(diffMs / 3600000);
    let text: string;
    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24);
      const hours = diffHours % 24;
      text = hours > 0 ? `${days}天${hours}小时` : `${days}天`;
    } else if (diffHours > 0) {
      text = `${diffHours}小时`;
    } else {
      text = `${Math.max(1, Math.floor(diffMs / 60000))}分钟`;
    }
    const budgetDays = getConfigBudgetDays(nodeName, (record as { styleId?: string | null }).styleId);
    const over = budgetDays != null && diffMs > budgetDays * 24 * 3600000;
    return { text, over };
  })();

  const renderLottie = () => {
    const lottie = (
      <LiquidProgressLottie
        progress={percent}
        size={lottieSize}
        nodeName={nodeName}
        text={isProcureNode ? (completedQty > 0 ? '✓' : '') : `${completedQty}/${totalQty}`}
        subText={!isProcureNode && totalQty > 0 ? `${percent}%` : undefined}
        paused={frozen}
        color1={nodePrimaryColor}
        color2={nodeSecondaryColor}
      />
    );

    if (nodeType === 'quality' || nodeType === 'warehousing') {
      return (
        <DefectTracePopover
          orderId={String(record.id || '')}
          hasDefects={Number(record.unqualifiedQuantity) > 0}
        >
          {lottie}
        </DefectTracePopover>
      );
    }
    return lottie;
  };

  const titleText = completionTime
    ? `${nodeLabel} 完成时间：${completionTime}${predictHint ? `\n预计完成：${predictHint}` : ''}\n点击查看详情`
    : `${predictHint ? `预计完成：${predictHint}\n` : ''}点击查看 ${nodeLabel} 详情`;

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
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        title={titleText}
      >
        {renderLottie()}
        <div style={{
          position: 'absolute',
          top: labelTopOffset,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}>
          <div style={{
            fontSize: 13,
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            lineHeight: 1.2,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}>
            {nodeLabel}
          </div>
          {(startDisplay || operatorDisplay || completionTimeDisplay) && (
            <NodeScanTimelinePopover orderId={String(record.id || '')} node={node} nodeName={nodeName}>
              <div
                style={{ cursor: 'pointer', maxWidth: '100%' }}
                title="点击查看该环节全部扫码时间线"
                onClick={(e) => e.stopPropagation()}
              >
                {startDisplay && (
                  <div style={{
                    fontSize: 11,
                    lineHeight: 1.3,
                    textAlign: 'center',
                    color: 'var(--color-primary)',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>
                    开始 {startDisplay}
                  </div>
                )}
                {(operatorDisplay || completionTimeDisplay) && (
                  <div style={{
                    fontSize: 11,
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
              </div>
            </NodeScanTimelinePopover>
          )}
          {(durationDisplay || elapsedInfo) && (
            <div style={{
              fontSize: 11,
              lineHeight: 1.3,
              textAlign: 'center',
              color: (durationOverThreshold || elapsedInfo?.over) ? 'var(--color-danger)' : 'var(--color-text-quaternary)',
              fontWeight: (durationOverThreshold || elapsedInfo?.over) ? 600 : 400,
            }}>
              {durationDisplay
                ? `耗时 ${durationDisplay}${durationOverThreshold ? '（超48h）' : ''}`
                : `已耗时 ${elapsedInfo?.text}${elapsedInfo?.over ? '（超预算）' : ''}`}
            </div>
          )}
          <BudgetDaysEditor
            record={record}
            nodeName={nodeName}
            stageStartTime={startTime || undefined}
            stageEndTime={completionTime || undefined}
            isCompletedOrClosed={isCompletedOrClosed}
            isProcureNode={isProcureNode}
          />
        </div>
      </div>
      {showConnector ? (
        <div className="u-flex-1 u-d-flex u-ai-center" style={{ alignSelf: 'center', paddingLeft: 2, paddingRight: 2 }}>
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
}
