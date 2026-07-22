import React from 'react';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
import DefectTracePopover from '../components/DefectTracePopover';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { NodeCalculationResult } from './nodeCalculations';
import { colorWithAlpha } from './cellRendererHelpers';

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
  } = {
    ...nodeData,
    totalQty: Number(record.cuttingQuantity || record.orderQuantity) || 0,
  };

  const showConnector = index < total - 1;
  const lottieSize = nodeType === 'quality' ? 78 : 68;
  const labelTopOffset = nodeType === 'quality' ? 'calc(50% + 44px)' : 'calc(50% + 39px)';

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
}
