import React, { useEffect, useMemo } from 'react';
import { App, Progress, QRCode, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import SampleProcessList from './SampleProcessList';
import useSampleScanRecords, { ScanRecord } from './useSampleScanRecords';
import type { ProcessStageProgress } from './useSampleProcessProgress';

interface SampleStageExpandedContentProps {
  patternProductionId: string | null | undefined;
  patternId: string | null | undefined;
  receiver: string;
  receiveTime: string;
  completeTime: string;
  stages: ProcessStageProgress[];
  processLoading: boolean;
  orderId: string | null;
  orderNo: string | null;
  styleNo?: string;
  color?: string;
  quantity?: number;
  size?: string;
  onCompleteProcess?: (processCode: string) => Promise<void>;
  onReceiveSample?: () => void;
  onUpdateProgress?: () => void;
  actionLoading?: boolean;
  onRefresh?: () => void;
}

export default function SampleStageExpandedContent({
  patternProductionId,
  patternId,
  receiver,
  receiveTime,
  completeTime,
  stages,
  processLoading,
  orderId,
  orderNo,
  styleNo,
  color,
  quantity,
  size,
  onCompleteProcess,
  onReceiveSample,
  onUpdateProgress,
  actionLoading = false,
  onRefresh,
}: SampleStageExpandedContentProps) {
  const { message } = App.useApp();
  const { scanRecords, scanRecordsLoading, loadScanRecords } = useSampleScanRecords();

  useEffect(() => {
    if (patternProductionId) {
      void loadScanRecords(patternProductionId);
    }
  }, [patternProductionId, loadScanRecords]);

  const scanColumns = useMemo<ColumnsType<ScanRecord>>(() => [
    {
      title: '工序名称',
      dataIndex: 'processName',
      key: 'processName',
      width: 120,
      render: (val: string) => <Tag>{val || '样衣操作'}</Tag>,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
      render: (val: string, record: ScanRecord) => (
        <span>
          {val || record.operatorId || '-'}
          {record.operatorRole ? <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>{record.operatorRole}</Tag> : null}
        </span>
      ),
    },
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 160,
      render: (val: string) => val || '-',
    },
    {
      title: '仓库',
      dataIndex: 'warehouseCode',
      key: 'warehouseCode',
      width: 100,
      render: (val: string) => val ? <Tag color="purple">{val}</Tag> : '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (val: string) => val || '-',
    },
  ], []);

  const overallPercent = useMemo(() => {
    if (!stages.length) return 0;
    return Math.round(stages.reduce((sum, s) => sum + s.percent, 0) / stages.length);
  }, [stages]);

  const overallColor = overallPercent >= 100 ? 'var(--color-success)' : 'var(--color-primary)';

  return (
    <div className="sample-stage-expanded">
      <div className="sample-stage-expanded__left">
        <div className="sample-stage-expanded__section">
          <div className="sample-stage-expanded__section-title">基本信息</div>
          <div className="sample-stage-expanded__facts">
            <div className="sample-stage-expanded__fact">
              <span className="sample-stage-expanded__fact-label">领取人</span>
              <span className="sample-stage-expanded__fact-value">{receiver || '-'}</span>
            </div>
            <div className="sample-stage-expanded__fact">
              <span className="sample-stage-expanded__fact-label">领取时间</span>
              <span className="sample-stage-expanded__fact-value">{receiveTime || '-'}</span>
            </div>
            <div className="sample-stage-expanded__fact">
              <span className="sample-stage-expanded__fact-label">完成时间</span>
              <span className="sample-stage-expanded__fact-value">{completeTime || '-'}</span>
            </div>
            <div className="sample-stage-expanded__fact">
              <span className="sample-stage-expanded__fact-label">二维码号</span>
              <span className="sample-stage-expanded__fact-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {patternProductionId || patternId || '-'}
              </span>
            </div>
          </div>
          <div className="sample-stage-expanded__qr-row">
            <QRCode
              value={JSON.stringify({ type: 'pattern', id: patternProductionId || patternId })}
              size={72}
              style={{ flexShrink: 0 }}
            />
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 500, color: '#595959', marginBottom: 2 }}>工人扫码领取 / 完成</div>
              <div style={{ fontSize: 12 }}>样衣单号: {patternProductionId || patternId || '-'}</div>
            </div>

          </div>
        </div>

        {stages.length > 0 || processLoading ? (
          <div className="sample-stage-expanded__section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="sample-stage-expanded__section-title" style={{ marginBottom: 0 }}>工序进度</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: overallColor }}>
                {overallPercent}%
              </div>
            </div>
            <Progress
              percent={overallPercent}
              showInfo={false}
              size={6}
              strokeColor={overallColor}
              style={{ marginBottom: 12 }}
            />
            {processLoading ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : (
              <SampleProcessList
                stages={stages}
                loading={processLoading}
                orderId={orderId}
                orderNo={orderNo}
                styleNo={styleNo}
                color={color}
                quantity={quantity}
                size={size}
                receiver={receiver}
                receiveTime={receiveTime}
                patternProductionId={patternProductionId || undefined}
                onCompleteProcess={onCompleteProcess}
                onRefresh={onRefresh}
              />
            )}
          </div>
        ) : null}
      </div>

      <div className="sample-stage-expanded__right">
        <div className="sample-stage-expanded__section">
          <div className="sample-stage-expanded__section-title">
            扫码记录
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
              {scanRecords.length > 0 ? `${scanRecords.length} 条` : ''}
            </span>
          </div>
          {scanRecordsLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : scanRecords.length === 0 ? (
            <div style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}>
              暂无扫码记录，请先扫码
            </div>
          ) : (
            <Table<ScanRecord>
              columns={scanColumns}
              dataSource={scanRecords}
              rowKey="id"
              size="small"
              pagination={scanRecords.length > 10 ? { pageSize: 10, size: 'small' } : false}
              scroll={{ x: 560, y: 300 }}
              style={{ fontSize: 12 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
