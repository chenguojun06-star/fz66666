import React from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import { formatProcessDisplayName } from '@/utils/productionStage';

interface ProcessStageGroupProps {
  stageKey: string;
  stageName: string;
  processes: any[];
  cuttingQty: number;
  descriptionTitle: string;
  descriptionMap: Map<string, string>;
  procurementStatus?: any;
  processStatus?: any;
  orderNo?: string;
  onNavigateToPayroll: (processName: string) => void;
}

const ProcessStageGroup: React.FC<ProcessStageGroupProps> = ({
  stageKey,
  stageName,
  processes,
  cuttingQty,
  descriptionTitle,
  descriptionMap,
  procurementStatus,
  processStatus,
  orderNo,
  onNavigateToPayroll,
}) => {
  if (processes.length === 0) return null;

  const stageTotal = processes.reduce((sum: number, p: any) => sum + (Number(p.unitPrice) || 0), 0);

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <StageHeader
        stageKey={stageKey}
        stageName={stageName}
        processCount={processes.length}
        stageTotal={stageTotal}
        procurementStatus={procurementStatus}
        processStatus={processStatus}
        orderNo={orderNo}
        onNavigateToPayroll={onNavigateToPayroll}
      />
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
            title: '工序',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (v: string, record: any) => <span style={{ fontWeight: 600 }}>{formatProcessDisplayName(record.id, v)}</span>,
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
};

const StageHeader: React.FC<{
  stageKey: string;
  stageName: string;
  processCount: number;
  stageTotal: number;
  procurementStatus?: any;
  processStatus?: any;
  orderNo?: string;
  onNavigateToPayroll: (processName: string) => void;
}> = ({ stageKey, stageName, processCount, stageTotal, procurementStatus, processStatus, orderNo, onNavigateToPayroll }) => (
  <div style={{
    background: '#f3f4f6',
    padding: '10px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontWeight: 700, fontSize: '15px', color: '#374151' }}>
        {stageName}
      </span>
      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        ({processCount}个工序)
      </span>
      {stageKey === 'procurement' && procurementStatus && (
        <ProcurementStatus status={procurementStatus} orderNo={orderNo} onNavigate={onNavigateToPayroll} />
      )}
      {stageKey === 'cutting' && processStatus?.cutting && (
        <CuttingStatus status={processStatus.cutting} />
      )}
    </div>
    <span style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
      小计: ¥{stageTotal.toFixed(2)}
    </span>
  </div>
);

const ProcurementStatus: React.FC<{
  status: any;
  orderNo?: string;
  onNavigate: (processName: string) => void;
}> = ({ status, onNavigate }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
    {status.completed ? (
      <>
        <span style={{
          fontSize: '13px', fontWeight: 600, color: 'var(--color-success)',
          background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: '4px'
        }}>
          已完成
        </span>
        {status.operatorName && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            操作人: <a
              style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}
              onClick={() => onNavigate('采购')}
            >
              {status.operatorName}
            </a>
          </span>
        )}
        {status.completedTime && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            完成时间: <span style={{ fontWeight: 600, color: '#374151' }}>
              {new Date(status.completedTime).toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </span>
        )}
      </>
    ) : (
      <span style={{
        fontSize: '13px', fontWeight: 600, color: 'var(--color-warning)',
        background: 'rgba(234, 179, 8, 0.15)', padding: '2px 8px', borderRadius: '4px'
      }}>
        进行中 ({status.completionRate}%)
      </span>
    )}
  </div>
);

const CuttingStatus: React.FC<{ status: any }> = ({ status }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
    <span style={{
      fontSize: '13px', fontWeight: 600,
      color: status.completed ? '#059669' : '#f59e0b',
      background: status.completed ? '#d1fae5' : '#fef3c7',
      padding: '2px 8px', borderRadius: '4px'
    }}>
      {status.completed ? ' 已完成' : `进行中 (${status.completionRate}%)`}
    </span>
    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
      完成: <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{status.completedQuantity} 件</span>
    </span>
    {!status.completed && (
      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        剩余: <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{status.remainingQuantity} 件</span>
      </span>
    )}
  </div>
);

export default ProcessStageGroup;
