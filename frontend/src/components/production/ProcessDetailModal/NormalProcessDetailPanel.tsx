import React from 'react';
import { PROCESS_STAGE_DEFS, classifyNodeStage } from './processStageUtils';
import ProcessStageGroup from './ProcessStageGroup';
import InfoItem from './InfoItem';
import type { ProductionOrder } from '@/types/production';

interface NormalProcessDetailPanelProps {
  record: ProductionOrder;
  processType: string;
  procurementStatus: any;
  processStatus: any;
  templateNodesList: { name: string; processCode?: string; progressStage?: string; description?: string }[];
  templatePriceMap: Map<string, number>;
  styleProcessDescriptionMap: Map<string, string>;
  secondaryProcessDescriptionMap: Map<string, string>;
  cuttingSizeItems: Array<{ size: string; quantity: number }>;
  onNavigateToPayroll: (processName: string) => void;
}

const NormalProcessDetailPanel: React.FC<NormalProcessDetailPanelProps> = ({
  record,
  processType,
  procurementStatus,
  processStatus,
  templateNodesList,
  templatePriceMap,
  styleProcessDescriptionMap,
  secondaryProcessDescriptionMap,
  cuttingSizeItems,
  onNavigateToPayroll,
}) => {
  const { groupedProcesses, stagesToShow, totalPrice } = buildWorkflowData(
    templateNodesList, templatePriceMap, processType,
  );
  const cuttingQty = record.cuttingQuantity || record.orderQuantity || 0;
  const operatorInfo = getOperatorInfo(record, processType);

  return (
    <div>
      <ProcessOrderInfoGrid
        record={record}
        totalPrice={totalPrice}
        cuttingQty={cuttingQty}
        operatorInfo={operatorInfo}
        onNavigateToPayroll={onNavigateToPayroll}
      />
      {cuttingSizeItems.length > 0 && (
        <CuttingSizeDetail items={cuttingSizeItems} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {stagesToShow.map((stage) => (
          <ProcessStageGroup
            key={stage.key}
            stageKey={stage.key}
            stageName={stage.name}
            processes={groupedProcesses[stage.key] || []}
            cuttingQty={cuttingQty}
            descriptionTitle={stage.key === 'secondaryProcess' ? '工艺描述' : '工序描述'}
            descriptionMap={stage.key === 'secondaryProcess' ? secondaryProcessDescriptionMap : styleProcessDescriptionMap}
            procurementStatus={stage.key === 'procurement' ? procurementStatus : undefined}
            processStatus={stage.key === 'cutting' ? processStatus : undefined}
            orderNo={record.orderNo}
            onNavigateToPayroll={onNavigateToPayroll}
          />
        ))}
      </div>
    </div>
  );
};

function buildWorkflowData(
  templateNodesList: { name: string; processCode?: string; progressStage?: string; description?: string }[],
  templatePriceMap: Map<string, number>,
  processType: string,
) {
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

  const groupedProcesses: Record<string, any[]> = {};
  PROCESS_STAGE_DEFS.forEach(s => { groupedProcesses[s.key] = []; });
  workflowNodes.forEach((node: any) => {
    const stageKey = classifyNodeStage(node.progressStage || '', node.name || '');
    if (!groupedProcesses[stageKey]) {
      groupedProcesses[stageKey] = [];
    }
    groupedProcesses[stageKey].push(node);
  });

  const stagesToShow = processType === 'all'
    ? PROCESS_STAGE_DEFS.filter(s => (groupedProcesses[s.key] || []).length > 0)
    : PROCESS_STAGE_DEFS.filter(s => s.key === processType && (groupedProcesses[s.key] || []).length > 0);

  const totalPrice = workflowNodes.reduce((sum: number, node: any) => sum + (Number(node.unitPrice) || 0), 0);

  return { workflowNodes, groupedProcesses, stagesToShow, totalPrice };
}

function getOperatorInfo(record: ProductionOrder, processType: string) {
  switch (processType) {
    case 'cutting':
      return {
        operatorName: record.cuttingOperatorName,
        endTime: record.cuttingEndTime,
        processName: '裁剪'
      };
    case 'carSewing':
      return {
        operatorName: record.carSewingOperatorName as string | undefined,
        endTime: record.carSewingEndTime as string | undefined,
        processName: '车缝'
      };
    case 'tailProcess':
      return {
        operatorName: record.tailProcessOperatorName as string | undefined,
        endTime: record.tailProcessEndTime as string | undefined,
        processName: '尾部'
      };
    default:
      return null;
  }
}

const ProcessOrderInfoGrid: React.FC<{
  record: ProductionOrder;
  totalPrice: number;
  cuttingQty: number;
  operatorInfo: { operatorName?: string; endTime?: string; processName: string } | null;
  onNavigateToPayroll: (processName: string) => void;
}> = ({ record, totalPrice, cuttingQty, operatorInfo, onNavigateToPayroll }) => (
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
    <InfoItem label="订单号" value={record.orderNo} />
    <InfoItem label="款号" value={record.styleNo} />
    <InfoItem label="款名" value={record.styleName} />
    <div>
      <span style={{ color: 'var(--color-text-secondary)' }}>总工价：</span>
      <span style={{ fontWeight: 700, color: '#dc2626' }}>¥{totalPrice.toFixed(2)}</span>
    </div>
    <InfoItem label="订单数量" value={`${record.orderQuantity || 0} 件`} />
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
                  onNavigateToPayroll(operatorInfo.processName);
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
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
              })
            ) : (
              <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
            )}
          </span>
        </div>
      </div>
    )}
  </div>
);

const CuttingSizeDetail: React.FC<{ items: Array<{ size: string; quantity: number }> }> = ({ items }) => (
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
    {items.map((item) => (
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
      总计: {items.reduce((sum, item) => sum + item.quantity, 0)}
    </span>
  </div>
);

export default NormalProcessDetailPanel;
