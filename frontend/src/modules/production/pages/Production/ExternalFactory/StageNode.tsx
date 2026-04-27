import React, { useState } from 'react';
import { Popover } from 'antd';
import { ProductionOrder } from '@/types/production';
import { getProcessesByNodeFromOrder } from '../ProgressDetail/utils';
import StagePopoverContent from './StagePopoverContent';
import type { SmartStage, StageStatus } from './types';

interface StageNodeProps {
  stage: SmartStage;
  record: ProductionOrder;
  totalQty: number;
  openNodeDetail?: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: Array<{ id?: string; name: string; unitPrice?: number }>
  ) => void;
}

const StageNode: React.FC<StageNodeProps> = ({ stage, record, totalQty, openNodeDetail }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={
        <StagePopoverContent
          orderId={String(record.id)}
          stageKey={stage.key}
          label={stage.label}
          progress={stage.progress}
          status={stage.status}
          totalQty={totalQty}
          open={open}
          expectedShipDate={(record as any).expectedShipDate}
          plannedEndDate={record.plannedEndDate}
        />
      }
      trigger="hover"
      mouseEnterDelay={0.15}
      placement="top"
      overlayStyle={{ maxWidth: 240, zIndex: 1100 }}
      getPopupContainer={() => document.body}
    >
      <div
        className={`style-smart-stage style-smart-stage--${stage.status}`}
        style={{ cursor: openNodeDetail ? 'pointer' : 'default' }}
        onClick={() => {
          if (!openNodeDetail) return;
          const SMART_KEY_TO_NODE_TYPE: Record<string, string> = {
            secondary: 'secondaryProcess',
            sewing: 'carSewing',
            tail: 'tailProcess',
          };
          const nodeType = SMART_KEY_TO_NODE_TYPE[stage.key] ?? stage.key;
          const completedQty = Math.round((stage.progress / 100) * totalQty);
          const byParent = getProcessesByNodeFromOrder(record);
          let processList: { name: string; unitPrice?: number; processCode?: string }[] = [];
          if (stage.label === '二次工艺') {
            const exactChildren = byParent['二次工艺'] || [];
            const STD_STAGES = new Set(['采购', '裁剪', '车缝', '尾部', '入库', '二次工艺']);
            const orphanChildren = Object.entries(byParent)
              .filter(([st]) => !STD_STAGES.has(st))
              .flatMap(([, nodes]) => nodes || []);
            processList = [...exactChildren, ...orphanChildren].map(c => ({
              name: c.name,
              unitPrice: c.unitPrice,
              processCode: c.processCode,
            }));
          } else {
            const children = byParent[stage.label] || [];
            processList = children.map(c => ({
              name: c.name,
              unitPrice: c.unitPrice,
              processCode: c.processCode,
            }));
          }
          openNodeDetail(
            record,
            nodeType,
            stage.label,
            { done: completedQty, total: totalQty, percent: stage.progress, remaining: totalQty - completedQty },
            undefined,
            processList,
          );
        }}
      >
        <div className="style-smart-stage__time">{stage.timeLabel}</div>
        <div className="style-smart-stage__node">
          <span className="style-smart-stage__ring" />
          <span className="style-smart-stage__orbit" />
          <span className="style-smart-stage__core" />
          <span className="style-smart-stage__check" />
        </div>
        <div className="style-smart-stage__label">{stage.label}</div>
        {stage.helper && <div className="style-smart-stage__helper">{stage.helper}</div>}
      </div>
    </Popover>
  );
};

export default StageNode;
